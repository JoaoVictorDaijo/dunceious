/*
 * Dunceious
 *
 * This file is part of Dunceious.
 *
 * Dunceious is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Dunceious is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Dunceious.  If not, see <https://www.gnu.org/licenses/>.
 */

import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import type { LocalAlignment, LocalEngine } from '../../../core/search/local/engine';
import { createLocalSearchHandler } from '../localSearch';
import type { LocalSearchResponse, LocalSearchRequest } from '../../protocol';
const wasm = readFileSync('public/wasm/local-align.wasm');
export const request: Extract<LocalSearchRequest, { type: 'search' }> = { type: 'search', phase: 'refine', requestId: 1, boundScore2: null, query: 'AA', scoring: 'EDNAFULL', moleculeType: 'dna', limit: 10,
  filters: { minIdentity: null, minQueryCoverage: null }, jobs: [0, 1].map(recordIndex => ({ recordIndex, record: { id: String(recordIndex), sequence: 'AAA' }, strand: 1 })) };
it.each([
  ['query', '\uFB05'], ['query', '\uFB06'], ['record', '\uFB05'], ['record', '\uFB06'],
] as const)('reports unsupported %s symbol %s without publishing a result', async (side, symbol) => {
  const messages: LocalSearchResponse[] = [];
  const handle = createLocalSearchHandler(m => messages.push(m));
  await handle({ type: 'init', wasm: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) });
  await handle({ ...request, scoring: 'EBLOSUM62', moleculeType: 'protein',
    query: side === 'query' ? `D${symbol}D` : 'DDD',
    jobs: [{ recordIndex: 0, record: { id: 'protein', sequence: side === 'record' ? `D${symbol}D` : 'DDD', moleculeType: 'protein' }, strand: 1 }] });
  expect(messages).toEqual([{ type: 'ready' },
    { type: 'error', requestId: 1, error: `Unsupported ${side} characters: ${symbol}` }]);
});
it('initializes from supplied bytes, reports progress and finishes every stream', async () => {
  const messages: LocalSearchResponse[] = [];
  const handle = createLocalSearchHandler(m => messages.push(m));
  await handle({ type: 'init', wasm: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) });
  await handle(request);
  expect(messages[0]).toEqual({ type: 'ready' });
  expect(messages.filter(m => m.type === 'progress').length).toBeGreaterThanOrEqual(4);
  expect(messages.filter(m => m.type === 'stream-done').every(m => m.peakMemoryBytes > 0)).toBe(true);
  expect(messages.filter(m => m.type === 'stream-done').map(m => m.outcome.recordIndex)).toEqual([0, 1]);
});
it('makes initialization and computation failures distinct', async () => {
  const messages: LocalSearchResponse[] = [];
  const handle = createLocalSearchHandler(m => messages.push(m));
  await handle({ type: 'init', wasm: new ArrayBuffer(2) });
  expect(messages[0]).toMatchObject({ type: 'init-error' });
  await handle(request);
  expect(messages[1]).toMatchObject({ type: 'error', requestId: 1 });
});
it('reports an engine failure without publishing a stream result', async () => {
  const messages: LocalSearchResponse[] = [];
  const handle = createLocalSearchHandler(m => messages.push(m), async () => ({ enumerate() { throw new Error('forced engine error'); }, peakMemoryBytes: () => 0 }));
  await handle({ type: 'init', wasm: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) });
  await handle(request);
  expect(messages.at(-1)).toEqual({ type: 'error', requestId: 1, error: 'forced engine error' });
  expect(messages.some(m => m.type === 'stream-done')).toBe(false);
});

it('forwards each stream engine heap high-water mark in bytes', async () => {
  const messages: LocalSearchResponse[] = [];
  let peak = 0;
  const handle = createLocalSearchHandler(m => messages.push(m), async () => ({
    enumerate: () => [][Symbol.iterator](),
    peakMemoryBytes: () => (peak += 65536),
  }));
  await handle({ type: 'init', wasm: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) });
  await handle(request);
  expect(messages.filter(m => m.type === 'stream-done').map(m => m.peakMemoryBytes)).toEqual([65536, 131072]);
});

function alignment(score2: number, recordStart: number, length = 2): LocalAlignment {
  return { score2, queryStart: 0, queryEnd: length, recordStart, recordEnd: recordStart + length,
    cigar: length === 2 ? '2=' : '1=1S' };
}

it('accepts a rising bound between passing and overlap-hidden alignments and closes the engine iterator', async () => {
  const messages: LocalSearchResponse[] = [];
  const closed = vi.fn();
  const pulled: number[] = [];
  const engine: LocalEngine = {
    *enumerate() {
      try {
        for (const a of [alignment(20, 0), alignment(20, 1), alignment(10, 3, 1)]) {
          pulled.push(a.score2);
          yield a;
        }
      } finally { closed(); }
    },
    peakMemoryBytes: () => 65536,
  };
  let ticks = 0;
  const handle = createLocalSearchHandler(m => messages.push(m), async () => engine, async () => {
    if (++ticks === 2) await handle({ type: 'bound', requestId: 1, boundScore2: 20 });
  });
  await handle({ type: 'init', wasm: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) });
  await handle({ ...request, jobs: [{ recordIndex: 0, record: { id: 'a', sequence: 'AAAA' }, strand: 1 }] });
  expect(ticks).toBe(2);
  expect(pulled).toEqual([20, 20, 10]);
  expect(messages.filter(m => m.type === 'hit').map(m => m.hit.start)).toEqual([0]);
  expect(messages.find(m => m.type === 'stream-done')).toMatchObject({ outcome: {
    exhausted: false, hiddenByOverlapScores: [20], hits: [{ start: 0 }],
  } });
  expect(closed).toHaveBeenCalledOnce();
});

it('yields to bound messages after filter-hidden alignments and never lowers the current bound', async () => {
  const messages: LocalSearchResponse[] = [];
  let ticks = 0;
  const handle = createLocalSearchHandler(m => messages.push(m), async () => ({
    *enumerate() { yield alignment(20, 0, 1); yield alignment(10, 1, 1); },
    peakMemoryBytes: () => 0,
  }), async () => {
    ticks++;
    await handle({ type: 'bound', requestId: 1, boundScore2: 20 });
    await handle({ type: 'bound', requestId: 1, boundScore2: 1 });
  });
  await handle({ type: 'init', wasm: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) });
  await handle({ ...request, filters: { minIdentity: null, minQueryCoverage: 100 }, jobs: request.jobs.slice(0, 1) });
  expect(ticks).toBe(1);
  expect(messages.some(m => m.type === 'hit')).toBe(false);
  expect(messages.find(m => m.type === 'stream-done')).toMatchObject({ outcome: {
    exhausted: false, hiddenByFilterScores: [20],
  } });
});

it('ignores stale bound messages across queries and resets the bound for a new request', async () => {
  const messages: LocalSearchResponse[] = [];
  const handle = createLocalSearchHandler(m => messages.push(m), async () => ({
    *enumerate() { yield alignment(20, 0); yield alignment(10, 2, 1); },
    peakMemoryBytes: () => 0,
  }), async () => { await handle({ type: 'bound', requestId: 1, boundScore2: 100 }); });
  await handle({ type: 'init', wasm: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) });
  await handle({ ...request, jobs: request.jobs.slice(0, 1) });
  await handle({ ...request, requestId: 2, jobs: request.jobs.slice(0, 1) });
  expect(messages.filter(m => m.type === 'hit' && m.requestId === 1)).toHaveLength(1);
  expect(messages.filter(m => m.type === 'hit' && m.requestId === 2)).toHaveLength(2);
  expect(messages.filter(m => m.type === 'stream-done').map(m => m.outcome.exhausted)).toEqual([false, true]);
});

it('bootstraps only the first alignment despite an established bound and destroys its context', async () => {
  const messages: LocalSearchResponse[] = [];
  const pulled: number[] = [];
  const closed = vi.fn();
  const handle = createLocalSearchHandler(m => messages.push(m), async () => ({
    *enumerate() {
      try {
        for (const a of [alignment(20, 0), alignment(10, 2, 1)]) { pulled.push(a.score2); yield a; }
      } finally { closed(); }
    }, peakMemoryBytes: () => 0,
  }), async () => {});
  await handle({ type: 'init', wasm: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength) });
  await handle({ ...request, phase: 'bootstrap', boundScore2: 100, jobs: request.jobs.slice(0, 1) });
  expect(pulled).toEqual([20]);
  expect(closed).toHaveBeenCalledOnce();
  expect(messages.filter(m => m.type === 'hit')).toHaveLength(1);
  expect(messages.find(m => m.type === 'stream-done')).toMatchObject({ phase: 'bootstrap', outcome: {
    exhausted: false, firstScore2: 20, alignmentsEnumerated: 1,
  } });
});

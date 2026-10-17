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
import { expect, it } from 'vitest';
import { createLocalSearchHandler } from '../localSearch';
import type { LocalSearchResponse, LocalSearchRequest } from '../../protocol';
const wasm = readFileSync('public/wasm/local-align.wasm');
export const request: Extract<LocalSearchRequest, { type: 'search' }> = { type: 'search', requestId: 1, query: 'AA', scoring: 'EDNAFULL', moleculeType: 'dna', limit: 10,
  filters: { minIdentity: null, minQueryCoverage: null }, jobs: [0, 1].map(recordIndex => ({ recordIndex, record: { id: String(recordIndex), sequence: 'AAA' }, strand: 1 })) };
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

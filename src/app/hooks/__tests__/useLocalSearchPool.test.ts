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

// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@/src/app/testing/renderHarness';
import { createLocalSearchHandler } from '@/src/workers/handlers/localSearch';
import type { LocalSearchRequest, LocalSearchResponse, LocalSearchResult } from '@/src/workers/protocol';
import { useLocalSearchPool } from '../useLocalSearchPool';
class InProcessWorker {
  static instances: InProcessWorker[] = [];
  static failSearchAt: number | null = null;
  static pause = false;
  static events: Array<LocalSearchRequest | LocalSearchResponse> = [];
  sent: LocalSearchRequest[] = [];
  responses: LocalSearchResponse[] = [];
  stopped = false;
  release: (() => void) | null = null;
  onmessage: ((e: MessageEvent<LocalSearchResponse>) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  onmessageerror: ((e: MessageEvent) => void) | null = null;
  terminate = vi.fn(() => { this.stopped = true; this.release?.(); });
  handle = createLocalSearchHandler(m => {
    this.responses.push(m); InProcessWorker.events.push(m);
    setTimeout(() => { if (!this.stopped) this.onmessage?.({ data: m } as MessageEvent<LocalSearchResponse>); },
      (InProcessWorker.instances.indexOf(this) * 7) % 11);
  }, undefined, () => InProcessWorker.pause && !this.stopped
    ? new Promise<void>(resolve => { this.release = resolve; })
    : new Promise<void>(resolve => setTimeout(resolve, 0)));
  constructor() { InProcessWorker.instances.push(this); }
  postMessage(m: LocalSearchRequest) {
    this.sent.push(m); InProcessWorker.events.push(m);
    if (m.type === 'search' && this.sent.filter(message => message.type === 'search').length === InProcessWorker.failSearchAt) {
      throw new Error('forced dispatch failure');
    }
    void this.handle(m);
  }
}
const b = readFileSync('public/wasm/local-align.wasm');
const bytes = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const request = { query: 'AA', scoring: 'EDNAFULL' as const, moleculeType: 'dna' as const, limit: 2, filters: { minIdentity: null, minQueryCoverage: null },
  records: [{ id: 'a', sequence: 'AAAT' }, { id: 'b', sequence: 'TTAA' }], strand: 'both' as const };
beforeEach(() => { InProcessWorker.instances = []; InProcessWorker.failSearchAt = null; InProcessWorker.pause = false; InProcessWorker.events = []; vi.stubGlobal('Worker', InProcessWorker); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it('returns identical results with one and four members despite completion order', async () => {
  const outcomes: LocalSearchResult[] = [];
  for (const concurrency of [2, 5]) {
    vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockReturnValue(concurrency);
    const h = renderHook(() => useLocalSearchPool(bytes));
    await waitFor(() => expect(h.result.current.ready).toBe(true));
    let result!: LocalSearchResult;
    await act(async () => { result = await h.result.current.run(request, () => {}); });
    outcomes.push(result);
    expect(result.results.map(h => [h.recordId, h.start, h.end, h.local!.score])).toEqual([['a', 0, 2, 10], ['b', 2, 4, 10]]);
    h.unmount();
  }
  expect(outcomes[0]).toEqual(outcomes[1]);
});
it('cancels, retires every member and initializes replacements from bytes', async () => {
  const h = renderHook(() => useLocalSearchPool(bytes));
  await waitFor(() => expect(h.result.current.ready).toBe(true));
  const old = [...InProcessWorker.instances];
  let rejected: Promise<unknown>;
  act(() => { rejected = h.result.current.run(request, () => {}).catch(e => e.name); h.result.current.cancel(); });
  expect(await rejected!).toBe('AbortError');
  expect(old.every(w => w.terminate.mock.calls.length === 1)).toBe(true);
  await waitFor(() => expect(h.result.current.ready).toBe(true));
  expect(InProcessWorker.instances.length).toBe(old.length * 2);
});
it('rejects a member failure and ignores old request IDs', async () => {
  const h = renderHook(() => useLocalSearchPool(bytes));
  await waitFor(() => expect(h.result.current.ready).toBe(true));
  let rejected: Promise<unknown>;
  act(() => {
    rejected = h.result.current.run(request, () => {}).catch(e => e.message);
    InProcessWorker.instances[0].onmessage?.({ data: { type: 'error', requestId: -1, error: 'stale' } } as MessageEvent<LocalSearchResponse>);
    InProcessWorker.instances[0].onerror?.({ message: 'member broke' } as ErrorEvent);
  });
  expect(await rejected!).toContain('member broke');
});
it('skips invalid nucleotide records before scheduling and never makes reverse protein jobs', async () => {
  const h = renderHook(() => useLocalSearchPool(bytes));
  await waitFor(() => expect(h.result.current.ready).toBe(true));
  let result!: LocalSearchResult;
  await act(async () => { result = await h.result.current.run({ ...request, records: [{ id: 'bad', sequence: 'A*.' }] }, () => {}); });
  expect(result.counts).toMatchObject({ streams: 0, skippedRecords: [{ recordId: 'bad', characters: ['*', '.'] }] });
  await act(async () => { result = await h.result.current.run({ ...request, query: 'N', scoring: 'EBLOSUM62', moleculeType: 'protein', records: [{ id: 'p', sequence: 'N*' }] }, () => {}); });
  expect(result.counts.streams).toBe(1);
  expect(result.results[0].strand).toBe(1);
});

it('waits for replacement readiness when restarting in the same render', async () => {
  const h = renderHook(() => useLocalSearchPool(bytes));
  await waitFor(() => expect(h.result.current.ready).toBe(true));
  let first!: Promise<unknown>;
  let replacement!: Promise<LocalSearchResult>;
  act(() => {
    first = h.result.current.run(request, () => {}).catch(e => e.name);
    h.result.current.cancel();
    replacement = h.result.current.run(request, () => {});
    void replacement.catch(() => {});
  });
  expect(await first).toBe('AbortError');
  let result!: LocalSearchResult;
  await act(async () => { result = await replacement; });
  expect(result.results.map(hit => [hit.recordId, hit.start, hit.end])).toEqual([['a', 0, 2], ['b', 2, 4]]);
});

it('dispatches one stream at a time from the shared queue and broadcasts only rising bounds', async () => {
  vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockReturnValue(2);
  const h = renderHook(() => useLocalSearchPool(bytes));
  await waitFor(() => expect(h.result.current.ready).toBe(true));
  await act(async () => { await h.result.current.run(request, () => {}); });
  const messages = InProcessWorker.instances[0].sent;
  const searches = messages.filter(m => m.type === 'search');
  expect(searches.every(m => m.jobs.length === 1)).toBe(true);
  expect(searches.filter(m => m.phase === 'score').map(m => m.jobs.map(j => [j.recordIndex, j.strand])))
    .toEqual([[[0, 1]], [[0, -1]], [[1, 1]], [[1, -1]]]);
  expect(searches.filter(m => m.phase === 'align').map(m => m.jobs.map(j => [j.recordIndex, j.strand])))
    .toEqual([[[0, 1]], [[1, 1]], [[1, -1]]]);
  const bounds = messages.filter(m => m.type === 'bound').map(m => m.boundScore2);
  expect(bounds.length).toBeGreaterThan(0);
  expect(bounds.every((score, i) => i === 0 || score > bounds[i - 1])).toBe(true);
  expect(bounds.at(-1)).toBe(20);
  expect(searches.at(-1)?.boundScore2).toBe(20);
});

it('does not publish partial results and cancels after a streamed hit', async () => {
  vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockReturnValue(2);
  InProcessWorker.pause = true;
  const h = renderHook(() => useLocalSearchPool(bytes));
  await waitFor(() => expect(h.result.current.ready).toBe(true));
  let settled = false;
  let result!: Promise<string>;
  act(() => { result = h.result.current.run(request, () => {}).then(() => { settled = true; return 'resolved'; }, e => { settled = true; return e.name; }); });
  const old = InProcessWorker.instances[0];
  await waitFor(() => expect(old.responses.some(m => m.type === 'hit')).toBe(true));
  expect(settled).toBe(false);
  act(() => h.result.current.cancel());
  expect(await result).toBe('AbortError');
  expect(old.terminate).toHaveBeenCalledOnce();
  await waitFor(() => expect(h.result.current.ready).toBe(true));
});

it.each([1, 2])('reports search dispatch failure for queued stream %i', async failAt => {
  vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockReturnValue(2);
  InProcessWorker.failSearchAt = failAt;
  const h = renderHook(() => useLocalSearchPool(bytes));
  await waitFor(() => expect(h.result.current.ready).toBe(true));
  let error!: unknown;
  await act(async () => { error = await h.result.current.run(request, () => {}).catch(e => e); });
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toContain('forced dispatch failure');
  expect(h.result.current.error).toContain('dispatch failed');
  expect(h.result.current.ready).toBe(false);
  expect(InProcessWorker.instances[0].terminate).toHaveBeenCalledOnce();
});

it('raises the live score bound when a later stream improves the global best', async () => {
  vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockReturnValue(2);
  const h = renderHook(() => useLocalSearchPool(bytes));
  await waitFor(() => expect(h.result.current.ready).toBe(true));
  let result!: LocalSearchResult;
  await act(async () => {
    result = await h.result.current.run({ ...request, query: 'AAAA', strand: 'fwd', limit: 1, filters: { minIdentity: 100, minQueryCoverage: null },
      records: [{ id: 'short', sequence: 'AA' }, { id: 'long', sequence: 'AAAA' }, { id: 'tie', sequence: 'AAAA' }] }, () => {});
  });
  const messages = InProcessWorker.instances[0].sent;
  expect(messages.filter(m => m.type === 'bound').map(m => m.boundScore2)).toEqual([40]);
  expect(messages.filter(m => m.type === 'search').filter(m => m.phase === 'score').map(m => m.boundScore2)).toEqual([null, null, null]);
  expect(messages.filter(m => m.type === 'search').filter(m => m.phase === 'align').map(m => [m.jobs[0].recordIndex, m.boundScore2]))
    .toEqual([[1, null], [2, 40]]);
  expect(result.results.map(hit => [hit.recordId, hit.local!.score])).toEqual([['long', 20]]);
});

it.each(['hit', 'progress', 'stream-done'] as const)('rejects an unassigned %s response', async type => {
  vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockReturnValue(2);
  InProcessWorker.pause = true;
  const h = renderHook(() => useLocalSearchPool(bytes));
  await waitFor(() => expect(h.result.current.ready).toBe(true));
  let rejected!: Promise<unknown>;
  act(() => { rejected = h.result.current.run(request, () => {}).catch(e => e.message); });
  const worker = InProcessWorker.instances[0];
  await waitFor(() => expect(worker.responses.some(m => m.type === 'hit')).toBe(true));
  const search = worker.sent.find(m => m.type === 'search')!;
  const hit = worker.responses.find(m => m.type === 'hit')!;
  const response: LocalSearchResponse = type === 'hit'
    ? { ...hit, recordIndex: 99 }
    : type === 'progress'
      ? { type, requestId: search.requestId, recordIndex: 99, strand: 1, fraction: 0 }
      : { type, phase: 'score', requestId: search.requestId, peakMemoryBytes: 0, outcome: {
        recordIndex: 99, strand: 1, hits: [], exhausted: true, noPositive: true,
        firstScore2: null, alignmentsEnumerated: 0, hiddenByOverlapScores: [], hiddenByFilterScores: [],
      } };
  act(() => worker.onmessage?.({ data: response } as MessageEvent<LocalSearchResponse>));
  expect(await rejected).toContain('unassigned stream');
  expect(h.result.current.error).toContain('unassigned stream');
});

it('finishes every scoring before aligning in descending first-score order with stable ties', async () => {
  vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockReturnValue(5);
  const h = renderHook(() => useLocalSearchPool(bytes));
  await waitFor(() => expect(h.result.current.ready).toBe(true));
  let result!: LocalSearchResult;
  await act(async () => {
    result = await h.result.current.run({ ...request, query: 'AAAA', strand: 'fwd', limit: 10,
      records: [{ id: 'short', sequence: 'AA' }, { id: 'best', sequence: 'AAAA' }, { id: 'tie', sequence: 'AAAA' }, { id: 'middle', sequence: 'AAA' }] }, () => {});
  });
  const events = InProcessWorker.events;
  const firstRefine = events.findIndex(m => m.type === 'search' && m.phase === 'align');
  expect(firstRefine).toBeGreaterThan(0);
  expect(events.slice(0, firstRefine).filter(m => m.type === 'stream-done' && m.phase === 'score')).toHaveLength(4);
  expect(events.filter(m => m.type === 'search').filter(m => m.phase === 'align').map(m => m.jobs[0].recordIndex)).toEqual([1, 2, 3, 0]);
  expect(result.counts.streams).toBe(4);
});

it('supersedes scoring outcomes and skips a stream below the improved live bound', async () => {
  vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockReturnValue(2);
  const h = renderHook(() => useLocalSearchPool(bytes));
  await waitFor(() => expect(h.result.current.ready).toBe(true));
  let result!: LocalSearchResult;
  await act(async () => {
    result = await h.result.current.run({ ...request, strand: 'fwd', limit: 2,
      records: [{ id: 'two', sequence: 'AATTAA' }, { id: 'weak', sequence: 'AT' }] }, () => {});
  });
  const searches = InProcessWorker.instances[0].sent.filter(m => m.type === 'search');
  expect(searches.filter(m => m.phase === 'align').map(m => m.jobs[0].recordIndex)).toEqual([0]);
  expect(result.results.map(hit => [hit.recordId, hit.start, hit.end, hit.local!.score]))
    .toEqual([['two', 0, 2, 10], ['two', 4, 6, 10]]);
  expect(result.counts).toMatchObject({ streams: 2, beyondLimit: 0 });
});

it('exhausts every positive stream when fewer hits pass than the requested limit', async () => {
  vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockReturnValue(2);
  const h = renderHook(() => useLocalSearchPool(bytes));
  await waitFor(() => expect(h.result.current.ready).toBe(true));
  let result!: LocalSearchResult;
  await act(async () => { result = await h.result.current.run({ ...request, query: 'A', strand: 'fwd', limit: 5,
    records: [{ id: 'yes', sequence: 'A' }, { id: 'none', sequence: 'T' }] }, () => {}); });
  const messages = InProcessWorker.instances[0].sent;
  expect(messages.some(m => m.type === 'bound')).toBe(false);
  expect(messages.filter(m => m.type === 'search').filter(m => m.phase === 'align').map(m => m.jobs[0].recordIndex)).toEqual([0]);
  expect(result.results.map(hit => hit.recordId)).toEqual(['yes']);
  expect(result.counts).toMatchObject({ streams: 2, noPositiveStreams: 1, beyondLimit: 0, cutoff: null });
});

it('keeps a distinct lower-scoring hit without double counting the scoring pass', async () => {
  vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockReturnValue(2);
  const h = renderHook(() => useLocalSearchPool(bytes));
  await waitFor(() => expect(h.result.current.ready).toBe(true));
  let result!: LocalSearchResult;
  await act(async () => { result = await h.result.current.run({ ...request, strand: 'fwd', limit: 2,
    records: [{ id: 'two', sequence: 'AATTA' }, { id: 'none', sequence: 'TT' }] }, () => {}); });
  expect(result.results.map(hit => [hit.recordId, hit.start, hit.end, hit.local!.score]))
    .toEqual([['two', 0, 2, 10], ['two', 4, 5, 5]]);
  expect(InProcessWorker.instances[0].sent.filter(m => m.type === 'bound').map(m => m.boundScore2)).toEqual([10]);
});

it('stops old progress and preserves a replacement run when cancellation happens while skipping a stream', async () => {
  vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockReturnValue(2);
  const h = renderHook(() => useLocalSearchPool(bytes));
  await waitFor(() => expect(h.result.current.ready).toBe(true));
  const retired = InProcessWorker.instances[0];
  let switched = false;
  let oldDispatchesAtCancel = 0;
  const staleProgress: unknown[] = [];
  let replacement!: Promise<LocalSearchResult>;
  let cancelled!: Promise<unknown>;
  await act(async () => {
    cancelled = h.result.current.run({ ...request, strand: 'fwd', limit: 1,
      records: [{ id: 'strong', sequence: 'AA' }, { id: 'weak', sequence: 'A' }, { id: 'weaker', sequence: 'A' }] }, progress => {
      if (switched) { staleProgress.push(progress); return; }
      if (progress.streamsDone !== 2) return;
      switched = true;
      oldDispatchesAtCancel = retired.sent.length;
      h.result.current.cancel();
      replacement = h.result.current.run({ ...request, strand: 'fwd', limit: 1,
        records: [{ id: 'replacement', sequence: 'AA' }] }, () => {});
    }).catch(e => e.name);
    expect(await cancelled).toBe('AbortError');
  });
  let result!: LocalSearchResult;
  await act(async () => { result = await replacement; });
  expect(switched).toBe(true);
  expect(staleProgress).toEqual([]);
  expect(retired.sent).toHaveLength(oldDispatchesAtCancel);
  expect(retired.terminate).toHaveBeenCalledOnce();
  expect(result.results.map(hit => hit.recordId)).toEqual(['replacement']);
});

it.each([
  { query: 'ACGT', scoring: 'EDNAFULL' as const, moleculeType: 'dna' as const,
    records: [{ id: 'a', sequence: 'ACGTCCCCACGT' }, { id: 'b', sequence: 'ACGATACGT' }, { id: 'zero', sequence: 'NNN' }] },
  { query: 'AAU', scoring: 'EDNAFULL' as const, moleculeType: 'rna' as const,
    records: [{ id: 'a', sequence: '-AAUCCAUU-' }, { id: 'b', sequence: 'ATTAAT', moleculeType: 'rna' as const }] },
  { query: 'WACN', scoring: 'EBLOSUM62' as const, moleculeType: 'protein' as const,
    records: [{ id: 'a', sequence: 'WACNAAAWWACN' }, { id: 'b', sequence: 'WNCN' }, { id: 'zero', sequence: '*' }] },
])('matches exhaustive filtered results with one and four workers for $moleculeType $query', async c => {
  const { instantiateLocalEngine } = await import('@/src/core/search/local/engine');
  const { runLocalStream } = await import('@/src/core/search/local/stream');
  const { loadScoring, encodeResidues } = await import('@/src/core/search/local/scoring');
  const { mergeLocalOutcomes } = await import('@/src/core/search/local/selection');
  const scoring = loadScoring(c.scoring);
  const q = encodeResidues(c.query, scoring);
  if (!('codes' in q)) throw new Error('Invalid synthetic query');
  const input = { ...request, ...c, limit: 3, filters: { minIdentity: 75, minQueryCoverage: 50 } };
  const engine = await instantiateLocalEngine(await WebAssembly.compile(bytes));
  const exhaustive = mergeLocalOutcomes(c.records.flatMap((record, recordIndex) =>
    (c.moleculeType === 'protein' ? [1 as const] : [1 as const, -1 as const]).map(strand =>
      runLocalStream(engine, { ...input, record, recordIndex, strand, queryCodes: q.codes, scoring }))), input.limit, []);
  expect(exhaustive.results.length).toBeGreaterThan(0);
  for (const concurrency of [2, 5]) {
    vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockReturnValue(concurrency);
    const h = renderHook(() => useLocalSearchPool(bytes));
    try {
      await waitFor(() => expect(h.result.current.ready).toBe(true));
      let result!: LocalSearchResult;
      await act(async () => { result = await h.result.current.run(input, () => {}); });
      expect(result).toEqual(exhaustive);
    } finally { h.unmount(); }
  }
});

it('seeds the bound before aligning and stops an overlap-heavy stream below the score seed', async () => {
  const { instantiateLocalEngine } = await import('@/src/core/search/local/engine');
  const { runLocalStream } = await import('@/src/core/search/local/stream');
  const { loadScoring, encodeResidues } = await import('@/src/core/search/local/scoring');
  const { mergeLocalOutcomes } = await import('@/src/core/search/local/selection');
  const scoring = loadScoring('EDNAFULL');
  const input = { ...request, query: 'AAAAAAAA', strand: 'fwd' as const, limit: 3,
    records: [{ id: 'overlaps', sequence: 'AAAAAAAAAAAA' }, { id: 'tie', sequence: 'AAAAAAAA' },
      { id: 'another-tie', sequence: 'AAAAAAAA' }, { id: 'zero', sequence: 'CCCCCCCC' }] };
  const encoded = encodeResidues(input.query, scoring);
  if (!('codes' in encoded)) throw new Error('Invalid synthetic query');
  const engine = await instantiateLocalEngine(await WebAssembly.compile(bytes));
  const exhaustive = input.records.map((record, recordIndex) => runLocalStream(engine,
    { ...input, record, recordIndex, strand: 1, queryCodes: encoded.codes, scoring }));
  const reference = mergeLocalOutcomes(exhaustive, input.limit, []);
  const alignments = Array.from({ [Symbol.iterator]: () => engine.enumerate(encoded.codes,
    (encodeResidues(input.records[0].sequence, scoring) as { codes: Uint8Array }).codes, scoring) });
  const firstBelowSeed = alignments.findIndex(a => a.score2 < 80);
  expect(firstBelowSeed).toBeGreaterThan(0);
  expect(firstBelowSeed + 1).toBeLessThan(alignments.length);
  for (const concurrency of [2, 5]) {
    InProcessWorker.events = [];
    vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockReturnValue(concurrency);
    const h = renderHook(() => useLocalSearchPool(bytes));
    try {
      await waitFor(() => expect(h.result.current.ready).toBe(true));
      let result!: LocalSearchResult;
      await act(async () => { result = await h.result.current.run(input, () => {}); });
      expect(result).toEqual(reference);
      const events = InProcessWorker.events;
      const firstAlign = events.findIndex(m => m.type === 'search' && m.phase === 'align');
      const done = events.find(m => m.type === 'stream-done' && m.phase === 'align' && m.outcome.recordIndex === 0);
      expect(done).toMatchObject({ outcome: { exhausted: false, alignmentsEnumerated: firstBelowSeed + 1 } });
      expect(exhaustive[0].alignmentsEnumerated).toBeGreaterThan(firstBelowSeed + 1);
      expect(events.slice(0, firstAlign).filter(m => m.type === 'bound').map(m => m.boundScore2))
        .toEqual(Array.from({ length: concurrency - 1 }, () => 80));
      expect(events.filter(m => m.type === 'search').filter(m => m.phase === 'align').map(m => m.boundScore2))
        .toEqual([80, 80, 80]);
      expect(result.counts).toMatchObject({ streams: 4, noPositiveStreams: 1, cutoff: 40 });
    } finally { h.unmount(); }
  }
});

it.each([
  { minIdentity: 100, minQueryCoverage: null },
  { minIdentity: null, minQueryCoverage: 100 },
])('does not seed the bound with display filters %j', async filters => {
  vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockReturnValue(2);
  const h = renderHook(() => useLocalSearchPool(bytes));
  try {
    await waitFor(() => expect(h.result.current.ready).toBe(true));
    await act(async () => { await h.result.current.run({ ...request, filters }, () => {}); });
    const events = InProcessWorker.events;
    const firstAlign = events.findIndex(m => m.type === 'search' && m.phase === 'align');
    expect(firstAlign).toBeGreaterThan(0);
    expect(events.slice(0, firstAlign).filter(m => m.type === 'bound')).toEqual([]);
    expect(events.find(m => m.type === 'search' && m.phase === 'align')).toMatchObject({ boundScore2: null });
    const firstHit = events.findIndex(m => m.type === 'hit');
    expect(events.findIndex(m => m.type === 'bound')).toBeGreaterThan(firstHit);
  } finally { h.unmount(); }
});

it('raises the bound from a hit that displaces an unaligned stream placeholder', async () => {
  const { instantiateLocalEngine } = await import('@/src/core/search/local/engine');
  const { runLocalStream } = await import('@/src/core/search/local/stream');
  const { loadScoring, encodeResidues } = await import('@/src/core/search/local/scoring');
  const { mergeLocalOutcomes } = await import('@/src/core/search/local/selection');
  const scoring = loadScoring('EDNAFULL');
  const input = { ...request, query: 'AAAA', strand: 'fwd' as const, limit: 3,
    records: [{ id: 'two-hits', sequence: 'AAAACCCCAAA' }, { id: 'middle', sequence: 'AAA' },
      { id: 'weak', sequence: 'AA' }] };
  const codes = (s: string) => {
    const encoded = encodeResidues(s, scoring);
    if (!('codes' in encoded)) throw new Error('Invalid synthetic query');
    return encoded.codes;
  };
  const engine = await instantiateLocalEngine(await WebAssembly.compile(bytes));
  const exhaustive = input.records.map((record, recordIndex) => runLocalStream(engine,
    { ...input, record, recordIndex, strand: 1, queryCodes: codes(input.query), scoring }));
  const reference = mergeLocalOutcomes(exhaustive, input.limit, []);
  const alignments = Array.from({ [Symbol.iterator]: () => engine.enumerate(codes(input.query), codes(input.records[0].sequence), scoring) });
  const firstBelowBound = alignments.findIndex(a => a.score2 < 30);
  expect(firstBelowBound).toBeGreaterThan(0);
  expect(firstBelowBound + 1).toBeLessThan(alignments.length);
  for (const concurrency of [2, 5]) {
    InProcessWorker.instances = []; InProcessWorker.events = [];
    vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockReturnValue(concurrency);
    const h = renderHook(() => useLocalSearchPool(bytes));
    try {
      await waitFor(() => expect(h.result.current.ready).toBe(true));
      let result!: LocalSearchResult;
      await act(async () => { result = await h.result.current.run(input, () => {}); });
      expect(result).toEqual(reference);
      const events = InProcessWorker.events;
      const raisedAt = events.findIndex(m => m.type === 'bound' && m.boundScore2 === 30);
      expect(raisedAt).toBeGreaterThan(0);
      if (concurrency === 2) {
        expect(InProcessWorker.instances[0].responses.find(m => m.type === 'stream-done' && m.phase === 'align'
          && m.outcome.recordIndex === 0)).toMatchObject({ outcome: { alignmentsEnumerated: firstBelowBound + 1, exhausted: false } });
        expect(events.slice(0, raisedAt).filter(m => m.type === 'hit')).toHaveLength(2);
      }
    } finally { h.unmount(); }
  }
});

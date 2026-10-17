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
  onmessage: ((e: MessageEvent<LocalSearchResponse>) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  onmessageerror: ((e: MessageEvent) => void) | null = null;
  terminate = vi.fn();
  handle = createLocalSearchHandler(m => { setTimeout(() => this.onmessage?.({ data: m } as MessageEvent<LocalSearchResponse>), (InProcessWorker.instances.indexOf(this) * 7) % 11); });
  constructor() { InProcessWorker.instances.push(this); }
  postMessage(m: LocalSearchRequest) { void this.handle(m); }
}
const b = readFileSync('public/wasm/local-align.wasm');
const bytes = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const request = { query: 'AA', scoring: 'EDNAFULL' as const, moleculeType: 'dna' as const, limit: 2, filters: { minIdentity: null, minQueryCoverage: null },
  records: [{ id: 'a', sequence: 'AAAT' }, { id: 'b', sequence: 'TTAA' }], strand: 'both' as const };
beforeEach(() => { InProcessWorker.instances = []; vi.stubGlobal('Worker', InProcessWorker); });
afterEach(() => vi.unstubAllGlobals());
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

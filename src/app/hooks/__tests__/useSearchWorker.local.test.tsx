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
import { beforeEach, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@/src/app/testing/renderHarness';
import { useSearchWorker } from '../useSearchWorker';
import type { LocalSearchProgress, LocalSearchResult } from '@/src/workers/protocol';
import type { SeqRecord } from '@/src/domain/bio/types';
const pool = vi.hoisted(() => ({ ready: true, error: null as string | null, run: vi.fn(), cancel: vi.fn() }));
vi.mock('../useLocalSearchPool', () => ({ useLocalSearchPool: () => pool }));
const moduleState = vi.hoisted(() => ({ bytes: new ArrayBuffer(8), error: null as string | null }));
vi.mock('../../lib/localEngineModule', () => ({ useLocalEngineBytes: () => moduleState }));
beforeEach(() => { moduleState.error = null; pool.ready = true; pool.error = null; pool.run.mockReset(); pool.cancel.mockReset(); });
const records: SeqRecord[] = [{ id: 'r', name: 'r', sequence: 'AAA', features: [] }];
const counts = { cutoff: null, streams: 1, noPositiveStreams: 0, skippedRecords: [], hiddenByOverlap: 0, hiddenByFilters: 0, beyondLimit: 0 };
it.each(['clear', 'replace', 'mode', 'new'] as const)('ignores local results after %s mid-run', async action => {
  let complete: (v: unknown) => void = () => {};
  pool.run.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
  const h = renderHook(({ r }) => useSearchWorker(r, vi.fn(), vi.fn(), vi.fn()), { initialProps: { r: records } });
  act(() => { h.result.current.setSearchMode('fuzzy'); h.result.current.setSearchOptions({ ...h.result.current.searchOptions, fuzzyMethod: 'local' }); h.result.current.setSearchQuery('AA'); });
  act(() => h.result.current.handleSearch());
  expect(h.result.current.isSearching).toBe(true);
  const oldComplete = complete;
  if (action === 'replace') h.rerender({ r: [...records] });
  else act(() => { if (action === 'clear') h.result.current.clearSearch(); else if (action === 'mode') h.result.current.setSearchMode('exact'); else h.result.current.handleSearch(); });
  await act(async () => { oldComplete({ results: [{ recordId: 'r', start: 0, end: 2, strand: 1, sequence: 'AA', cigar: '2=' }], counts }); });
  expect(h.result.current.searchResults).toEqual([]);
  expect(h.result.current.isSearching).toBe(action === 'new');
});
it('makes Cancel distinct from no hits and reports unsupported query symbols', async () => {
  pool.run.mockImplementation(() => new Promise(() => {}));
  const h = renderHook(() => useSearchWorker(records, vi.fn(), vi.fn(), vi.fn()));
  act(() => { h.result.current.setSearchMode('fuzzy'); h.result.current.setSearchOptions({ ...h.result.current.searchOptions, fuzzyMethod: 'local' }); h.result.current.setSearchQuery('AA'); });
  act(() => h.result.current.handleSearch());
  act(() => h.result.current.cancelLocalSearch());
  expect(h.result.current.localJob.phase).toBe('cancelled');
  act(() => h.result.current.setSearchQuery('J-'));
  act(() => h.result.current.handleSearch());
  expect(h.result.current.localJob).toMatchObject({ phase: 'failed', error: expect.stringContaining('J, -') });
});

it.each(['exact', 'fuzzy'] as const)('preserves completed %s results when Local module loading fails later', async mode => {
  const h = renderHook(() => useSearchWorker(records, vi.fn(), vi.fn(), vi.fn()));
  act(() => { h.result.current.setSearchMode(mode); h.result.current.setSearchQuery('AA'); });
  act(() => h.result.current.handleSearch());
  await waitFor(() => expect(h.result.current.searchResults.length).toBeGreaterThan(0));
  const results = h.result.current.searchResults;
  const completed = h.result.current.completedSearch;
  moduleState.error = 'Local module load failed: forced delayed failure';
  h.rerender();
  expect(h.result.current.localError).toBe(moduleState.error);
  expect(h.result.current.searchQuery).toBe('AA');
  expect(h.result.current.searchResults).toBe(results);
  expect(h.result.current.completedSearch).toBe(completed);
});

function startLocal(recordsToSearch = records) {
  const addLog = vi.fn();
  const navigate = vi.fn();
  const h = renderHook(() => useSearchWorker(recordsToSearch, addLog, vi.fn(), navigate));
  act(() => {
    h.result.current.setSearchMode('fuzzy');
    h.result.current.setSearchOptions({ ...h.result.current.searchOptions, fuzzyMethod: 'local' });
    h.result.current.setSearchQuery(' A A ');
  });
  act(() => h.result.current.handleSearch());
  return { ...h, addLog, navigate };
}

it.each([
  [null, null, 'Local search is not ready'],
  [null, 'Worker initialization failed', 'Worker initialization failed'],
  ['Module unavailable', 'Worker initialization failed', 'Module unavailable'],
])('reports readiness failure with module error %s and pool error %s', (moduleError, poolError, expected) => {
  pool.ready = false;
  moduleState.error = moduleError;
  pool.error = poolError;
  const h = startLocal();
  expect(h.result.current.localReady).toBe(false);
  expect(h.result.current.localError).toBe(moduleError ?? poolError);
  expect(h.result.current.localJob).toMatchObject({ phase: 'failed', error: expected, endedAt: expect.any(Number) });
  expect(h.result.current.isSearching).toBe(false);
  expect(h.result.current.completedSearch).toBeNull();
  expect(pool.run).not.toHaveBeenCalled();
  expect(h.addLog).toHaveBeenCalledWith(expected);
});

it('applies local hits, progress, counts, scoring and navigation from the submitted query', async () => {
  let complete!: (value: LocalSearchResult) => void;
  let progress!: (value: LocalSearchProgress) => void;
  pool.run.mockImplementation((_request, report) => {
    progress = report;
    return new Promise<LocalSearchResult>(resolve => { complete = resolve; });
  });
  const h = startLocal();
  expect(h.result.current.localReady).toBe(true);
  expect(pool.run).toHaveBeenCalledWith({ query: 'AA', records: [{ id: 'r', sequence: 'AAA', alignedSequence: undefined, moleculeType: undefined }],
    moleculeType: 'dna', scoring: 'EDNAFULL', limit: 100, filters: { minIdentity: null, minQueryCoverage: null }, strand: 'both' }, expect.any(Function));
  const update = { phase: 'align' as const, streamsDone: 1, streamsTotal: 2, currentFraction: 0.5 };
  act(() => progress(update));
  expect(h.result.current.localJob).toMatchObject({ phase: 'running', progress: update });
  act(() => h.result.current.setSearchQuery('TT'));
  const results = [{ recordId: 'r', start: 0, end: 2, strand: 1 as const, sequence: 'AA', cigar: '2=' }];
  const finishedCounts = { ...counts, skippedRecords: [{ recordId: 'bad', characters: ['J'] }] };
  await act(async () => complete({ results, counts: finishedCounts }));
  expect(h.result.current.searchResults).toEqual(results);
  expect(h.result.current.localCounts).toEqual(finishedCounts);
  expect(h.result.current.localJob).toMatchObject({ phase: 'done', progress: update, endedAt: expect.any(Number) });
  expect(h.result.current.completedSearch).toMatchObject({ query: 'AA', mode: 'local', alphabet: 'nucleotide' });
  expect(h.result.current.completedSearch?.matrixScore?.('A', 'A')).toBe(5);
  expect(h.result.current.completedSearch?.matrixScore?.('A', 'C')).toBe(-4);
  expect(h.result.current.currentSearchIdx).toBe(0);
  expect(h.result.current.isSearching).toBe(false);
  expect(h.addLog).toHaveBeenCalledWith('Local search skipped bad: unsupported characters J');
  await waitFor(() => expect(h.navigate).toHaveBeenCalledWith({ start: 0, end: 2, recordIds: ['r'] }));
});

it.each([
  [new DOMException('Stopped', 'AbortError'), 'cancelled'],
  [new Error('Worker crashed'), 'failed'],
] as const)('settles rejected local runs as %s', async (error, phase) => {
  pool.run.mockRejectedValue(error);
  const h = startLocal();
  await waitFor(() => expect(h.result.current.localJob.phase).toBe(phase));
  expect(h.result.current.isSearching).toBe(false);
  expect(h.result.current.searchResults).toEqual([]);
  expect(h.result.current.completedSearch).toBeNull();
  if (phase === 'failed') {
    expect(h.result.current.localJob.error).toBe('Error: Worker crashed');
    expect(h.addLog).toHaveBeenCalledWith('Error: Worker crashed');
  }
});

it.each(['cancel', 'options', 'unmount'] as const)('ignores progress and rejection after %s', async action => {
  let reject!: (error: Error) => void;
  let progress!: (value: LocalSearchProgress) => void;
  pool.run.mockImplementation((_request, report) => {
    progress = report;
    return new Promise((_resolve, fail) => { reject = fail; });
  });
  const h = startLocal();
  if (action === 'unmount') h.unmount();
  else act(() => {
    if (action === 'cancel') h.result.current.cancelLocalSearch();
    else h.result.current.setSearchOptions({ ...h.result.current.searchOptions, strand: 'fwd' });
  });
  expect(pool.cancel).toHaveBeenCalledTimes(1);
  await act(async () => {
    progress({ phase: 'align' as const, streamsDone: 2, streamsTotal: 2, currentFraction: 1 });
    reject(new Error('Late failure'));
  });
  expect(h.addLog).not.toHaveBeenCalledWith('Error: Late failure');
  expect(h.result.current.searchResults).toEqual([]);
  if (action !== 'unmount') {
    expect(h.result.current.localJob.phase).toBe(action === 'cancel' ? 'cancelled' : 'idle');
    expect(h.result.current.isSearching).toBe(false);
    expect(h.result.current.completedSearch).toBeNull();
  }
});

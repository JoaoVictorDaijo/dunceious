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
import type { SeqRecord } from '@/src/domain/bio/types';
const pool = vi.hoisted(() => ({ ready: true, error: null, run: vi.fn(), cancel: vi.fn() }));
vi.mock('../useLocalSearchPool', () => ({ useLocalSearchPool: () => pool }));
const moduleState = vi.hoisted(() => ({ bytes: new ArrayBuffer(8), error: null as string | null }));
vi.mock('../../lib/localEngineModule', () => ({ useLocalEngineBytes: () => moduleState }));
beforeEach(() => { moduleState.error = null; });
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

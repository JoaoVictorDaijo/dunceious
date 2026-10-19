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
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, renderHook } from '@/src/app/testing/renderHarness';
import { createDeferredWorker } from '@/src/app/testing/deferredWorker';
import { runSearch } from '@/src/workers/handlers/search';
import type { SeqRecord } from '@/src/domain/bio/types';
import { useSearchWorker } from '../useSearchWorker';

const DeferredWorker = createDeferredWorker(runSearch);
const records: SeqRecord[] = [{ id: 'old', name: 'old', sequence: 'AAAACCCC', features: [] }];
const replacement: SeqRecord[] = [{ id: 'new', name: 'new', sequence: 'GGGGTTTT', features: [] }];

beforeEach(() => {
  vi.useFakeTimers();
  DeferredWorker.instances = [];
  vi.stubGlobal('Worker', DeferredWorker);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it.each([
  ['clear', []],
  ['replacement', replacement],
] as const)('clears pending fuzzy search state after workspace %s and ignores late results', (_action, next) => {
  const log = vi.fn();
  const focus = vi.fn();
  const h = renderHook(({ active }) => useSearchWorker(active, log, vi.fn(), focus), { initialProps: { active: records } });
  const worker = DeferredWorker.instances.at(-1)!;
  act(() => { h.result.current.setSearchQuery('AAAA'); h.result.current.setSearchMode('fuzzy'); });
  act(() => h.result.current.handleSearch());
  expect(h.result.current.isSearching).toBe(true);
  h.rerender({ active: [...next] });
  const logCount = log.mock.calls.length;
  act(() => worker.release(0));
  act(() => vi.advanceTimersByTime(5000));
  expect(h.result.current.searchResults).toEqual([]);
  expect(h.result.current.groupedSearchResults).toEqual({});
  expect(h.result.current.searchQuery).toBe('');
  expect(h.result.current.currentSearchIdx).toBe(-1);
  expect(h.result.current.selectedSearchIndices.size).toBe(0);
  expect(h.result.current.isSearching).toBe(false);
  expect(focus).not.toHaveBeenCalled();
  expect(log).toHaveBeenCalledTimes(logCount);
});

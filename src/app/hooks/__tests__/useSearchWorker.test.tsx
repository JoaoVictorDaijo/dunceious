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
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@/src/app/testing/renderHarness';
import type { SeqRecord, SearchResult } from '@/src/domain/bio/types';
import type { SearchWorkerRequest, SearchWorkerResponse } from '@/src/workers/protocol';
import { useSearchWorker } from '../useSearchWorker';

class SearchWorker {
  static instances: SearchWorker[] = [];
  onmessage: ((event: MessageEvent<SearchWorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  postMessage = vi.fn<(request: SearchWorkerRequest) => void>();
  terminate = vi.fn();
  constructor() { SearchWorker.instances.push(this); }
  reply(results: SearchResult[], requestId?: number) {
    act(() => this.onmessage?.({ data: { results, requestId } } as MessageEvent<SearchWorkerResponse>));
  }
}
const records: SeqRecord[] = [{ id: 'synthetic', name: 'synthetic', sequence: 'AAAACCCCAAAA', features: [] }];
const match: SearchResult = { recordId: 'synthetic', start: 0, end: 4, strand: 1, sequence: 'AAAA', score: 12 };

function setup() {
  const focus = vi.fn();
  const log = vi.fn();
  const hook = renderHook(() => useSearchWorker(records, log, vi.fn(), focus));
  const worker = SearchWorker.instances.at(-1)!;
  const search = (query = 'AAAA', mode: 'exact' | 'fuzzy' = 'exact') => {
    act(() => { hook.result.current.setSearchQuery(query); hook.result.current.setSearchMode(mode); });
    act(() => hook.result.current.handleSearch());
  };
  const flush = () => act(() => vi.runOnlyPendingTimers());
  return { ...hook, worker, focus, log, search, flush };
}
beforeEach(() => { vi.useFakeTimers(); SearchWorker.instances = []; vi.stubGlobal('Worker', SearchWorker); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('explicit search cleanup', () => {
  it('clears results, highlights, active result and checked results without changing records', () => {
    const h = setup(); h.search(); h.flush();
    expect(h.result.current.searchResults).toHaveLength(2);
    act(() => h.result.current.setSelectedSearchIndices(new Set([0, 1])));
    act(() => h.result.current.clearSearch());
    expect(h.result.current.searchQuery).toBe('');
    expect(h.result.current.searchResults).toEqual([]);
    expect(h.result.current.filteredResults).toEqual([]);
    expect(h.result.current.groupedSearchResults).toEqual({});
    expect(h.result.current.currentSearchIdx).toBe(-1);
    expect(h.result.current.selectedSearchIndices.size).toBe(0);
    expect(h.result.current.maxScoreFound).toBe(0);
    expect(h.result.current.isSearching).toBe(false);
    expect(records[0].sequence).toBe('AAAACCCCAAAA');
    h.search('CCCC'); h.flush();
    expect(h.result.current.searchResults).toHaveLength(1);
    h.search('GGGGGG'); h.flush();
    expect(h.result.current.searchResults).toEqual([]);
  });

  it('keeps results while the user edits the query or navigates matches', () => {
    const h = setup(); h.search(); h.flush();
    act(() => { h.result.current.setSearchQuery(''); h.result.current.setCurrentSearchIdx(1); });
    expect(h.result.current.searchResults).toHaveLength(2);
    expect(h.result.current.currentSearchIdx).toBe(1);
  });

  it('cancels queued navigation before clearing an exact search', () => {
    const h = setup(); h.search();
    act(() => h.result.current.clearSearch());
    h.flush();
    expect(h.focus).not.toHaveBeenCalled();
  });

  it('ignores late worker results/errors and cancels the fallback after clearing a pending fuzzy search', () => {
    const h = setup(); h.search('AAAA', 'fuzzy');
    const request = h.worker.postMessage.mock.calls[0][0];
    expect(h.result.current.isSearching).toBe(true);
    act(() => h.result.current.clearSearch());
    h.worker.reply([match], request.requestId);
    h.worker.reply([match]);
    act(() => h.worker.onerror?.({ message: 'late failure' } as ErrorEvent));
    act(() => vi.advanceTimersByTime(5000));
    expect(h.result.current.searchResults).toEqual([]);
    expect(h.result.current.isSearching).toBe(false);
    expect(h.focus).not.toHaveBeenCalled();
    expect(h.log.mock.calls.flat().join(' ')).not.toContain('fallback');
  });

  it('accepts a new fuzzy search after clearing while rejecting the previous request ID', () => {
    const h = setup(); h.search('AAAA', 'fuzzy');
    const first = h.worker.postMessage.mock.calls[0][0];
    act(() => h.result.current.clearSearch());
    h.search('CCCC', 'fuzzy');
    const second = h.worker.postMessage.mock.calls[1][0];
    h.worker.reply([match], first.requestId);
    expect(h.result.current.isSearching).toBe(true);
    expect(h.result.current.searchResults).toEqual([]);
    h.worker.reply([{ ...match, start: 4, end: 8, sequence: 'CCCC' }], second.requestId);
    h.flush();
    expect(h.result.current.searchResults[0].sequence).toBe('CCCC');
    expect(h.focus).toHaveBeenCalledWith({ start: 4, end: 8, recordIds: ['synthetic'] });
  });

  it('does not navigate after unmounting with a queued result', () => {
    const h = setup(); h.search(); h.unmount(); h.flush();
    expect(h.focus).not.toHaveBeenCalled();
  });
});

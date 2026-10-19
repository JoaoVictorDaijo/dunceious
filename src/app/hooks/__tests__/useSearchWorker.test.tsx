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
import { SEARCH_WORKER_TIMEOUT_MS, useSearchWorker } from '../useSearchWorker';
import { runSearch } from '@/src/workers/handlers/search';
import { createDeferredWorker } from '@/src/app/testing/deferredWorker';
import * as inlineSearch from '@/src/app/logic/runInlineSearch';

const DeferredWorker = createDeferredWorker(runSearch);
class SearchWorker extends DeferredWorker {
  static instances: SearchWorker[] = [];
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  postMessage = vi.fn((request: SearchWorkerRequest) => super.postMessage(request));
  terminate = vi.fn();
  constructor() { super(); SearchWorker.instances.push(this); }
  reply(results: SearchResult[], requestId?: number) {
    act(() => this.onmessage?.({ data: { results, requestId } } as MessageEvent<SearchWorkerResponse>));
  }
}
const records: SeqRecord[] = [{ id: 'synthetic', name: 'synthetic', sequence: 'AAAACCCCAAAA', features: [] }];
const match: SearchResult = { cigar: '4=', recordId: 'synthetic', start: 0, end: 4, strand: 1, sequence: 'AAAA', edits: 0, identity: 100 };

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
  const complete = () => {
    const active = SearchWorker.instances.at(-1)!;
    act(() => active.release(active.requests.length - 1));
    flush();
  };
  return { ...hook, worker, focus, log, search, flush, complete };
}
beforeEach(() => { vi.useFakeTimers(); DeferredWorker.instances = []; SearchWorker.instances = []; vi.stubGlobal('Worker', SearchWorker); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('explicit search cleanup', () => {
  it('clears results, highlights, active result and checked results without changing records', () => {
    const h = setup(); h.search(); h.complete();
    expect(h.result.current.searchResults).toHaveLength(2);
    act(() => h.result.current.setSelectedSearchIndices(new Set([0, 1])));
    act(() => h.result.current.clearSearch());
    expect(h.result.current.searchQuery).toBe('');
    expect(h.result.current.searchResults).toEqual([]);
    expect(h.result.current.groupedSearchResults).toEqual({});
    expect(h.result.current.currentSearchIdx).toBe(-1);
    expect(h.result.current.selectedSearchIndices.size).toBe(0);
    expect(h.result.current.isSearching).toBe(false);
    expect(records[0].sequence).toBe('AAAACCCCAAAA');
    h.search('CCCC'); h.complete();
    expect(h.result.current.searchResults).toHaveLength(1);
    h.search('GGGGGG'); h.complete();
    expect(h.result.current.searchResults).toEqual([]);
  });

  it('keeps results while the user edits the query or navigates matches', () => {
    const h = setup(); h.search(); h.complete();
    act(() => { h.result.current.setSearchQuery(''); h.result.current.setCurrentSearchIdx(1); });
    expect(h.result.current.searchResults).toHaveLength(2);
    expect(h.result.current.currentSearchIdx).toBe(1);
  });

  it('cancels queued navigation before clearing an exact search', () => {
    const h = setup(); h.search();
    act(() => h.worker.release(0));
    act(() => h.result.current.clearSearch());
    h.flush();
    expect(h.focus).not.toHaveBeenCalled();
  });

  it('ignores late worker results/errors after clearing a pending fuzzy search', () => {
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

  it('does not navigate after unmounting with a queued result', () => {
    const h = setup(); h.search();
    act(() => h.worker.release(0));
    h.unmount(); h.flush();
    expect(h.focus).not.toHaveBeenCalled();
  });
});

describe('busy worker retirement', () => {
  it('retires the busy worker when a pending fuzzy search is cleared and serves the next search from a fresh one', () => {
    const h = setup(); h.search('AAAA', 'fuzzy');
    const first = h.worker.postMessage.mock.calls[0][0];
    act(() => h.result.current.clearSearch());
    expect(h.worker.terminate).toHaveBeenCalledTimes(1);
    h.search('CCCC', 'fuzzy');
    const fresh = SearchWorker.instances[1];
    expect(h.worker.postMessage).toHaveBeenCalledTimes(1);
    const second = fresh.postMessage.mock.calls[0][0];
    h.worker.reply([match], first.requestId);
    expect(h.result.current.isSearching).toBe(true);
    expect(h.result.current.searchResults).toEqual([]);
    fresh.reply([{ ...match, start: 4, end: 8, sequence: 'CCCC' }], second.requestId);
    h.flush();
    expect(h.result.current.searchResults[0].sequence).toBe('CCCC');
    expect(h.focus).toHaveBeenCalledWith({ start: 4, end: 8, recordIds: ['synthetic'] });
  });

  it('does not queue a new fuzzy search behind one still running', () => {
    const h = setup(); h.search('AAAA', 'fuzzy');
    h.search('CCCC', 'fuzzy');
    expect(h.worker.terminate).toHaveBeenCalledTimes(1);
    expect(SearchWorker.instances).toHaveLength(2);
    expect(SearchWorker.instances[1].postMessage.mock.calls[0][0].searchQuery).toBe('CCCC');
  });

  it('keeps the worker when an exact search follows a finished fuzzy search', () => {
    const h = setup(); h.search('AAAA', 'fuzzy');
    h.worker.reply([match], h.worker.postMessage.mock.calls[0][0].requestId);
    h.search('AAAA', 'exact');
    expect(h.worker.terminate).not.toHaveBeenCalled();
    expect(SearchWorker.instances).toHaveLength(1);
  });

  it('does not start a replacement worker when unmounting during a fuzzy search', () => {
    const h = setup(); h.search('AAAA', 'fuzzy');
    h.unmount();
    expect(h.worker.terminate).toHaveBeenCalledTimes(1);
    expect(SearchWorker.instances).toHaveLength(1);
  });
});

describe('replacement worker that cannot start', () => {
  class FailingReplacement extends SearchWorker {
    constructor() {
      if (SearchWorker.instances.length > 0) throw new Error('worker quota');
      super();
    }
  }
  beforeEach(() => { vi.stubGlobal('Worker', FailingReplacement); });

  it('still clears a pending fuzzy search and reports a failed retry without inline search', () => {
    const h = setup(); h.search('AAAA', 'fuzzy');
    expect(() => act(() => h.result.current.clearSearch())).not.toThrow();
    expect(h.result.current.isSearching).toBe(false);
    h.search('AAAA', 'fuzzy');
    expect(h.log.mock.calls.flat().join(' ')).toContain('Search Worker could not start');
    expect(h.result.current.searchResults).toEqual([]);
    expect(h.result.current.isSearching).toBe(false);
  });

  it('still ends a timed-out search', () => {
    const h = setup(); h.search('AAAA', 'fuzzy');
    act(() => vi.advanceTimersByTime(SEARCH_WORKER_TIMEOUT_MS));
    expect(h.result.current.isSearching).toBe(false);
    expect(h.log.mock.calls.flat().join(' ')).toContain('Search stopped');
  });
});

describe('fuzzy search dispatch', () => {
  it('sends the chosen identity threshold to the worker unchanged', () => {
    const h = setup();
    act(() => h.result.current.setSearchOptions({ minIdentity: 90, strand: 'fwd', maxResults: 7 }));
    h.search('AAAA', 'fuzzy');
    expect(h.worker.postMessage.mock.calls[0][0].options).toEqual({ minIdentity: 90, strand: 'fwd', maxResults: 7 });
  });

  it('replaces a timed-out worker instead of rerunning the search on the page', () => {
    const h = setup();
    h.search('AAAA', 'fuzzy');
    const stale = h.worker;
    const request = stale.postMessage.mock.calls[0][0];
    act(() => vi.advanceTimersByTime(SEARCH_WORKER_TIMEOUT_MS - 1));
    expect(h.result.current.isSearching).toBe(true);
    act(() => vi.advanceTimersByTime(1));

    expect(stale.terminate).toHaveBeenCalledTimes(1);
    expect(SearchWorker.instances).toHaveLength(1);
    expect(h.result.current.isSearching).toBe(false);
    expect(h.result.current.searchResults).toEqual([]);
    const logged = h.log.mock.calls.flat().join(' ');
    expect(logged).toContain('Search stopped');
    expect(logged).not.toContain('fallback');
    expect(logged).not.toContain('Search complete');

    stale.reply([match], request.requestId);
    expect(h.result.current.searchResults).toEqual([]);

    h.search('CCCC', 'fuzzy');
    const fresh = SearchWorker.instances[1];
    const next = fresh.postMessage.mock.calls[0][0];
    expect(next.searchQuery).toBe('CCCC');
    fresh.reply([{ ...match, start: 4, end: 8, sequence: 'CCCC' }], next.requestId);
    expect(h.result.current.searchResults.map(r => r.sequence)).toEqual(['CCCC']);
  });
});



describe.each(['exact', 'fuzzy'] as const)('%s worker isolation', mode => {
  it('waits for a worker reply before exposing matches or navigating', () => {
    const h = setup();
    h.search(' A A A A ', mode);
    expect(h.worker.postMessage).toHaveBeenCalledTimes(1);
    expect(h.worker.requests[0]).toMatchObject({ searchQuery: 'AAAA', mode, records: [{ id: 'synthetic', sequence: 'AAAACCCCAAAA' }] });
    expect(h.result.current.searchResults).toEqual([]);
    expect(h.result.current.isSearching).toBe(true);
    expect(h.focus).not.toHaveBeenCalled();
    h.complete();
    expect(h.result.current.searchResults.map(({ start, end, sequence }) => ({ start, end, sequence }))).toEqual([
      { start: 0, end: 4, sequence: 'AAAA' }, { start: 8, end: 12, sequence: 'AAAA' },
    ]);
    expect(h.result.current.currentSearchIdx).toBe(0);
    expect(h.focus).toHaveBeenCalledWith({ start: 0, end: 4, recordIds: ['synthetic'] });
  });

  it.each(['clear', 'replace', 'unmount'] as const)('terminates a pending worker on %s and ignores captured callbacks without request IDs', action => {
    const h = setup();
    h.search('AAAA', mode);
    const lateResponse = h.worker.onmessage!;
    const lateError = h.worker.onerror!;
    const lateMessageError = h.worker.onmessageerror;
    if (action === 'clear') act(() => h.result.current.clearSearch());
    if (action === 'unmount') h.unmount();
    if (action !== 'unmount') h.search('CCCC', mode);
    expect(h.worker.terminate).toHaveBeenCalledTimes(1);
    const logCount = h.log.mock.calls.length;
    act(() => {
      lateResponse({ data: { results: [match] } } as MessageEvent<SearchWorkerResponse>);
      lateError({ message: 'retired' } as ErrorEvent);
      lateMessageError?.({} as MessageEvent);
    });
    expect(h.log).toHaveBeenCalledTimes(logCount);
    expect(h.result.current.searchResults).toEqual([]);
    expect(h.focus).not.toHaveBeenCalled();
    if (action !== 'unmount') {
      expect(h.result.current.isSearching).toBe(true);
      h.complete();
      expect(h.result.current.searchResults.map(hit => hit.sequence)).toEqual(['CCCC']);
    } else {
      expect(SearchWorker.instances).toHaveLength(1);
      expect(vi.getTimerCount()).toBe(0);
    }
  });

});

describe.each(['exact', 'fuzzy'] as const)('%s worker isolation failures', mode => {
  it.each(['runtime', 'message', 'response', 'dispatch', 'timeout'] as const)('settles %s failures without inline execution and retries with a fresh worker', failure => {
    const inline = vi.spyOn(inlineSearch, 'runInlineSearch');
    const h = setup();
    h.search('AAAA', mode);
    act(() => h.worker.release(0));
    act(() => h.result.current.setSelectedSearchIndices(new Set([0, 1])));
    if (failure === 'dispatch') h.worker.postMessage.mockImplementationOnce(() => { throw new Error('cannot clone'); });
    h.search('CCCC', mode);
    const retiredResponse = h.worker.onmessage!;
    act(() => {
      if (failure === 'runtime') h.worker.onerror?.({ message: 'worker crashed' } as ErrorEvent);
      if (failure === 'message') h.worker.onmessageerror?.({} as MessageEvent);
      if (failure === 'response') h.worker.onmessage?.({ data: { error: 'core rejected query', requestId: h.worker.requests.at(-1)?.requestId } } as MessageEvent<SearchWorkerResponse>);
      if (failure === 'timeout') {
        vi.advanceTimersByTime(SEARCH_WORKER_TIMEOUT_MS - 1);
        expect(h.result.current.isSearching).toBe(true);
        vi.advanceTimersByTime(1);
      }
    });
    expect(h.result.current.isSearching).toBe(false);
    expect(h.result.current.searchResults).toEqual([]);
    expect(h.result.current.currentSearchIdx).toBe(-1);
    expect(h.result.current.selectedSearchIndices.size).toBe(0);
    expect(h.worker.terminate).toHaveBeenCalledTimes(1);
    expect(inline).not.toHaveBeenCalled();
    expect(h.focus).not.toHaveBeenCalled();
    expect(h.log.mock.calls.flat().join(' ')).toMatch(/could not|failed|Error|stopped/);
    expect(vi.getTimerCount()).toBe(0);
    h.search('CCCC', mode);
    expect(SearchWorker.instances).toHaveLength(2);
    act(() => retiredResponse?.({ data: { results: [match] } } as MessageEvent<SearchWorkerResponse>));
    expect(h.result.current.isSearching).toBe(true);
    h.complete();
    expect(h.result.current.searchResults.map(hit => hit.sequence)).toEqual(['CCCC']);
    expect(h.focus).toHaveBeenCalledExactlyOnceWith({ start: 4, end: 8, recordIds: ['synthetic'] });
  });

  it('reports startup failure without inline search and retries when a worker can start', () => {
    const inline = vi.spyOn(inlineSearch, 'runInlineSearch');
    vi.stubGlobal('Worker', class { constructor() { throw new Error('worker blocked'); } });
    const h = setup();
    h.search('AAAA', mode);
    expect(h.result.current.isSearching).toBe(false);
    expect(h.result.current.searchResults).toEqual([]);
    expect(inline).not.toHaveBeenCalled();
    expect(h.log.mock.calls.flat().join(' ')).toContain('Search Worker could not start');
    vi.stubGlobal('Worker', SearchWorker);
    h.search('CCCC', mode);
    expect(h.result.current.isSearching).toBe(true);
    h.complete();
    expect(h.result.current.searchResults.map(hit => hit.sequence)).toEqual(['CCCC']);
  });

  it('ignores a mismatched response and uses the submitted query for empty-result logs', () => {
    const h = setup();
    h.search('GGGGGG', mode);
    const request = h.worker.requests[0];
    h.worker.reply([match], request.requestId! + 1);
    expect(h.result.current.isSearching).toBe(true);
    act(() => h.result.current.setSearchQuery('edited'));
    h.complete();
    expect(h.result.current.searchQuery).toBe('edited');
    expect(h.result.current.searchResults).toEqual([]);
    expect(h.log).toHaveBeenCalledWith("No matches found for 'GGGGGG'.");
  });
});

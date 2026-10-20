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

import { useState, useRef, useEffect, useMemo, useCallback, type Dispatch, type SetStateAction } from 'react';
import { SeqRecord, SelectionArea, SearchResult } from '@/src/domain/bio/types';
import { isProteinSession as computeIsProteinSession } from '@/src/domain/bio';
import type { SearchWorkerRequest, SearchWorkerResponse, SearchableRecord, SearchOptions } from '@/src/workers/protocol';
import type { GroupedSearchResults } from '../components/SearchPanel';
import {
  type CompletedSearch,
  type SearchAnnotationHit,
  completedSearchFor,
  groupedSearchResults as computeGroupedSearchResults,
  joinSegments,
  getSequenceContext as computeSequenceContext,
} from '@/src/app/logic/searchState';

import { useLocalEngineBytes } from '../lib/localEngineModule';
import { useLocalSearchPool } from './useLocalSearchPool';
import { encodeResidues, loadScoring, scoringFor, scoreOf } from '@/src/core/search/local/scoring';
import type { LocalSearchCounts } from '@/src/core/search/local/selection';
import { localSearchOptions, type LocalSearchProgress } from '@/src/workers/protocol';

export interface LocalSearchJob {
  phase: 'idle' | 'running' | 'done' | 'cancelled' | 'failed';
  startedAt: number; endedAt?: number; progress: LocalSearchProgress; error?: string;
}
const idleLocalJob: LocalSearchJob = { phase: 'idle', startedAt: 0,
  progress: { phase: 'score', streamsDone: 0, streamsTotal: 0, currentFraction: 0 } };

export type { SearchOptions };

/** A stalled scan must release its worker so later requests can run. */
export const SEARCH_WORKER_TIMEOUT_MS = 15_000;

const DEFAULT_RESULT_LIMIT = 100;

export interface UseSearchWorkerReturn {
  localReady: boolean;
  localError: string | null;
  localJob: LocalSearchJob;
  localCounts: LocalSearchCounts | null;
  cancelLocalSearch: () => void;
  completedSearch: CompletedSearch | null;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  searchMode: 'exact' | 'fuzzy';
  setSearchMode: (mode: 'exact' | 'fuzzy') => void;
  searchOptions: SearchOptions;
  setSearchOptions: (opts: SearchOptions) => void;
  /** Exact matches, or fuzzy hits already at or above `searchOptions.minIdentity`. */
  searchResults: SearchResult[];
  currentSearchIdx: number;
  setCurrentSearchIdx: Dispatch<SetStateAction<number>>;
  selectedSearchIndices: Set<number>;
  setSelectedSearchIndices: Dispatch<SetStateAction<Set<number>>>;
  isSearching: boolean;
  isProteinSession: boolean;
  groupedSearchResults: GroupedSearchResults;
  handleSearch: () => void;
  clearSearch: () => void;
  toggleRecordSelection: (recordId: string, select: boolean) => void;
  joinAllInRecord: (recordId: string) => void;
  joinSelectedMatches: () => void;
  getSequenceContext: (
    recordId: string,
    start: number,
    end: number,
    contextLen?: number,
  ) => { pre: string; match: string; post: string };
}

/**
 * Manages the searchWorker Web Worker lifecycle and all sequence-search state.
 *
 * Idle workers are reused; abandoned or failed scans terminate their worker.
 * Query edits preserve displayed results until the next explicit search or clear.
 *
 * @param records                 - Current active records to search over.
 * @param addLog                  - Callback to append a timestamped message.
 * @param addAnnotationFromSearch - Opens the feature editor pre-filled with match data.
 * @param onFirstResult           - Called after a successful search to navigate the viewport.
 */
export function useSearchWorker(
  records: SeqRecord[],
  addLog: (msg: string) => void,
  addAnnotationFromSearch: (
    recordId: string,
    start: number,
    end: number,
    name: string,
    segments?: { start: number; end: number }[],
    strand?: 1 | -1,
    hit?: SearchAnnotationHit,
  ) => void,
  onFirstResult: (selection: SelectionArea) => void,
): UseSearchWorkerReturn {
  const [completedSearch, setCompletedSearch] = useState<CompletedSearch | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMode, updateSearchMode] = useState<'exact' | 'fuzzy'>('exact');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [currentSearchIdx, setCurrentSearchIdx] = useState(-1);
  const [selectedSearchIndices, setSelectedSearchIndices] = useState<Set<number>>(new Set());
  const [isSearching, setIsSearching] = useState(false);
  const [searchOptions, updateSearchOptions] = useState<SearchOptions>({
    fuzzyMethod: 'whole', localFilters: { minIdentity: null, minQueryCoverage: null },
    minIdentity: 80,
    strand: 'both',
    maxResults: DEFAULT_RESULT_LIMIT,
  });

  const moduleState = useLocalEngineBytes();
  const pool = useLocalSearchPool(moduleState.bytes);
  const poolRef = useRef(pool);
  poolRef.current = pool;
  const localGeneration = useRef(0);
  const localActive = useRef(false);
  const [localJob, setLocalJob] = useState<LocalSearchJob>(idleLocalJob);
  const [localCounts, setLocalCounts] = useState<LocalSearchCounts | null>(null);

  const isProteinSession = useMemo(
    () => computeIsProteinSession(records),
    [records],
  );

  const searchableRecords = useMemo<SearchableRecord[]>(() => {
    return records.map(r => ({
      id: r.id,
      sequence: r.sequence,
      alignedSequence: r.alignedSequence,
      moleculeType: r.moleculeType,
    }));
  }, [records]);

  const searchWorkerRef = useRef<Worker | null>(null);
  const lastRequestRef = useRef<SearchWorkerRequest | null>(null);
  const nextRequestIdRef = useRef(0);
  const pendingRequestIdRef = useRef<number | null>(null);
  const searchTimeoutRef = useRef<number | null>(null);
  const navigationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addLogRef = useRef(addLog);
  const onFirstResultRef = useRef(onFirstResult);
  const isMountedRef = useRef(true);

  const clearSearchTimeout = useCallback(() => {
    if (searchTimeoutRef.current !== null) {
      window.clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }
  }, []);

  const retireWorker = useCallback(() => {
    const worker = searchWorkerRef.current;
    searchWorkerRef.current = null;
    if (!worker) return;
    worker.onmessage = null;
    worker.onerror = null;
    worker.onmessageerror = null;
    worker.terminate();
  }, []);

  const cancelPendingSearch = useCallback(() => {
    localGeneration.current++;
    if (localActive.current) { localActive.current = false; poolRef.current.cancel(); }
    setLocalJob(idleLocalJob); setLocalCounts(null);
    // Termination releases a busy worker instead of queueing the next scan behind it.
    if (pendingRequestIdRef.current !== null) retireWorker();
    pendingRequestIdRef.current = null;
    lastRequestRef.current = null;
    clearSearchTimeout();
    if (navigationTimeoutRef.current !== null) {
      clearTimeout(navigationTimeoutRef.current);
      navigationTimeoutRef.current = null;
    }
  }, [clearSearchTimeout, retireWorker]);

  const clearSearch = useCallback(() => {
    cancelPendingSearch();
    setCompletedSearch(null);
    setSearchQuery('');
    setSearchResults([]);
    setCurrentSearchIdx(-1);
    setSelectedSearchIndices(new Set());
    setIsSearching(false);
  }, [cancelPendingSearch]);

  useEffect(() => {
    clearSearch();
  }, [records, clearSearch]);

  const applySearchResults = useCallback((results: SearchResult[], request: SearchWorkerRequest) => {
    setIsSearching(false);
    setSearchResults(results);
    const local = request.mode === 'fuzzy' && localSearchOptions(request.options).fuzzyMethod === 'local';
    const scoring = local ? loadScoring(scoringFor(request.moleculeType === 'protein')) : null;
    setCompletedSearch(completedSearchFor(request, local,
      scoring ? (q: string, r: string) => scoreOf(scoring, q, r) : undefined));

    addLogRef.current(`Search complete: ${results.length} matches found.`);

    if (results.length > 0) {
      setCurrentSearchIdx(0);
      const first = results[0];
      navigationTimeoutRef.current = setTimeout(() => {
        navigationTimeoutRef.current = null;
        if (!isMountedRef.current) return;
        onFirstResultRef.current({ start: first.start, end: first.end, recordIds: [first.recordId] });
      }, 0);
    } else {
      setCurrentSearchIdx(-1);
      addLogRef.current(`No matches found for '${request.searchQuery}'.`);
    }
  }, []);

  const failSearch = useCallback((reason: string) => {
    cancelPendingSearch();
    retireWorker();
    setIsSearching(false);
    setSearchResults([]);
    setCurrentSearchIdx(-1);
    setSelectedSearchIndices(new Set());
    addLogRef.current(reason);
  }, [cancelPendingSearch, retireWorker]);

  useEffect(() => {
    addLogRef.current = addLog;
    onFirstResultRef.current = onFirstResult;
  }, [addLog, onFirstResult]);

  const spawnWorker = useCallback((): Worker | null => {
    let worker: Worker;
    try {
      worker = new Worker(
        new URL('@/src/workers/search.worker.ts', import.meta.url),
        { type: 'module' },
      );
    } catch (err) {
      addLogRef.current(`Search Worker could not start: ${String(err)}. Try searching again.`);
      return null;
    }
    searchWorkerRef.current = worker;

    // Queued callbacks can outlive termination, including responses without request IDs.
    const isCurrentWorker = () => isMountedRef.current && searchWorkerRef.current === worker;
    worker.onmessage = (e: MessageEvent<SearchWorkerResponse>) => {
      if (!isCurrentWorker() || pendingRequestIdRef.current === null) return;
      const msg = e.data;
      if (typeof msg.requestId === 'number' && msg.requestId !== pendingRequestIdRef.current) return;
      if ('error' in msg) {
        failSearch(`Search Error: ${msg.error}. Try searching again.`);
        return;
      }
      const request = lastRequestRef.current!;
      clearSearchTimeout();
      pendingRequestIdRef.current = null;
      lastRequestRef.current = null;
      applySearchResults(msg.results, request);
    };
    const handleWorkerFailure = (reason: string) => {
      if (!isCurrentWorker()) return;
      if (pendingRequestIdRef.current === null) {
        retireWorker();
        addLogRef.current('Search worker stopped unexpectedly; it will restart on the next search.');
        return;
      }
      failSearch(reason);
    };
    worker.onerror = (event: ErrorEvent) => {
      handleWorkerFailure(`Search Worker Error: ${event.message}. Try searching again.`);
    };
    worker.onmessageerror = () => {
      handleWorkerFailure('Search Worker response could not be read. Try searching again.');
    };
    return worker;
  }, [applySearchResults, clearSearchTimeout, failSearch, retireWorker]);

  useEffect(() => {
    isMountedRef.current = true;
    spawnWorker();
    return () => {
      isMountedRef.current = false;
      cancelPendingSearch();
      retireWorker();
    };
  }, [spawnWorker, cancelPendingSearch, retireWorker]);

  const handleSearch = useCallback(() => {
    cancelPendingSearch();
    const normalizedQuery = searchQuery.replace(/\s+/g, '');
    if (!normalizedQuery) {
      clearSearch();
      return;
    }
    const options = Number.isNaN(searchOptions.maxResults)
      ? { ...searchOptions, maxResults: DEFAULT_RESULT_LIMIT }
      : searchOptions;
    if (options !== searchOptions) updateSearchOptions(options);
    setCompletedSearch(null);
    setIsSearching(true);
    setSearchResults([]);
    setCurrentSearchIdx(-1);
    setSelectedSearchIndices(new Set());
    addLog(`Initiating ${searchMode} search for '${normalizedQuery}'...`);

    const requestId = ++nextRequestIdRef.current;
    const request: SearchWorkerRequest = {
      requestId,
      searchQuery: normalizedQuery,
      records: searchableRecords,
      mode: searchMode,
      options,
      moleculeType: isProteinSession ? 'protein' : 'dna',
    };
    lastRequestRef.current = request;
    if (searchMode === 'fuzzy' && localSearchOptions(options).fuzzyMethod === 'local') {
      const startedAt = Date.now();
      const generation = localGeneration.current;
      const scoring = loadScoring(scoringFor(isProteinSession));
      const encoded = encodeResidues(normalizedQuery, scoring);
      const fail = (error: string) => {
        setIsSearching(false); localActive.current = false;
        setLocalJob({ ...idleLocalJob, phase: 'failed', startedAt, endedAt: Date.now(), error });
        addLogRef.current(error);
      };
      if ('invalid' in encoded) { fail(`Unsupported query characters: ${encoded.invalid.join(', ')}`); return; }
      if (!poolRef.current.ready) { fail(moduleState.error ?? poolRef.current.error ?? 'Local search is not ready'); return; }
      localActive.current = true;
      setLocalJob({ ...idleLocalJob, phase: 'running', startedAt });
      void poolRef.current.run({ query: normalizedQuery, records: searchableRecords,
        moleculeType: request.moleculeType!, scoring: scoring.id, limit: options.maxResults,
        filters: localSearchOptions(options).localFilters, strand: options.strand }, progress => {
        if (localGeneration.current === generation) setLocalJob({ phase: 'running', startedAt, progress });
      }).then(({ results, counts }) => {
        if (!isMountedRef.current || localGeneration.current !== generation) return;
        localActive.current = false; setLocalCounts(counts);
        setLocalJob(job => ({ ...job, phase: 'done', endedAt: Date.now() }));
        for (const skipped of counts.skippedRecords) addLogRef.current(`Local search skipped ${skipped.recordId}: unsupported characters ${skipped.characters.join(', ')}`);
        applySearchResults(results, request);
      }, error => {
        if (!isMountedRef.current || localGeneration.current !== generation) return;
        if (error instanceof DOMException && error.name === 'AbortError') {
          localActive.current = false; setIsSearching(false);
          setLocalJob(job => ({ ...job, phase: 'cancelled', endedAt: Date.now() }));
        } else fail(String(error));
      });
      return;
    }

    const worker = searchWorkerRef.current ?? spawnWorker();
    if (!worker) {
      setIsSearching(false);
      return;
    }
    pendingRequestIdRef.current = requestId;
    searchTimeoutRef.current = window.setTimeout(() => {
      if (!isMountedRef.current || pendingRequestIdRef.current !== requestId) return;
      failSearch(`Search stopped after ${SEARCH_WORKER_TIMEOUT_MS / 1000} s; try a shorter query.`);
    }, SEARCH_WORKER_TIMEOUT_MS);
    try {
      worker.postMessage(request);
    } catch (err) {
      failSearch(`Search Worker dispatch failed: ${String(err)}. Try searching again.`);
    }
  }, [searchQuery, searchableRecords, searchMode, searchOptions, isProteinSession, addLog, spawnWorker, failSearch, cancelPendingSearch, clearSearch, applySearchResults, moduleState.error]);

  const cancelLocalSearch = useCallback(() => {
    localGeneration.current++; localActive.current = false; poolRef.current.cancel();
    setIsSearching(false); setSearchResults([]); setCompletedSearch(null);
    setLocalJob(job => ({ ...job, phase: 'cancelled', endedAt: Date.now() }));
  }, []);
  const setSearchMode = useCallback((mode: 'exact' | 'fuzzy') => {
    if (localActive.current) { cancelPendingSearch(); setIsSearching(false); }
    updateSearchMode(mode);
  }, [cancelPendingSearch]);
  const setSearchOptions = useCallback((opts: SearchOptions) => {
    if (localActive.current) { cancelPendingSearch(); setIsSearching(false); }
    updateSearchOptions(opts);
  }, [cancelPendingSearch]);

  // ── Grouped results (keyed by recordId) ───────────────────────────────────
  const groupedSearchResults = useMemo<GroupedSearchResults>(
    () => computeGroupedSearchResults(searchResults),
    [searchResults],
  );

  // ── Selection helpers ─────────────────────────────────────────────────────
  const toggleRecordSelection = (recordId: string, select: boolean) => {
    const group = groupedSearchResults[recordId];
    if (!group) return;
    const next = new Set(selectedSearchIndices);
    group.indices.forEach(idx => { if (select) next.add(idx); else next.delete(idx); });
    setSelectedSearchIndices(next);
  };

  const joinAllInRecord = (recordId: string) => {
    const group = groupedSearchResults[recordId];
    if (!group) return;
    const res = joinSegments(group.results, 'record');
    if ('error' in res) {
      if (res.error === 'mixed') {
        alert('All matches in the record must have the same strand to be joined automatically.');
      }
      return;
    }
    addAnnotationFromSearch(
      recordId,
      res.start,
      res.end,
      `Joined Record Search: ${searchQuery}`,
      res.segments,
      group.results[0].strand,
    );
  };

  const joinSelectedMatches = () => {
    if (selectedSearchIndices.size < 2) return;
    const indices = Array.from(selectedSearchIndices).sort((a, b) => a - b);
    const matches = indices.map(i => searchResults[i]);
    const recordId = matches[0].recordId;
    const res = joinSegments(matches, 'selection');
    if ('error' in res) {
      if (res.error === 'mixed') {
        alert('All selected matches must be on the same sequence and strand to be joined.');
      }
      return;
    }
    addAnnotationFromSearch(
      recordId,
      res.start,
      res.end,
      `Joined Search: ${searchQuery}`,
      res.segments,
      matches[0].strand,
    );
  };

  const getSequenceContext = (
    recordId: string,
    start: number,
    end: number,
    contextLen = 8,
  ): { pre: string; match: string; post: string } => {
    const record = records.find(r => r.id === recordId);
    return computeSequenceContext(record, start, end, contextLen);
  };

  return {
    localReady: pool.ready, localError: moduleState.error ?? pool.error,
    localJob, localCounts, cancelLocalSearch,
    completedSearch,
    searchQuery,
    setSearchQuery,
    searchMode,
    setSearchMode,
    searchOptions,
    setSearchOptions,
    searchResults,
    currentSearchIdx,
    setCurrentSearchIdx,
    selectedSearchIndices,
    setSelectedSearchIndices,
    isSearching,
    isProteinSession,
    groupedSearchResults,
    handleSearch,
    clearSearch,
    toggleRecordSelection,
    joinAllInRecord,
    joinSelectedMatches,
    getSequenceContext,
  };
}

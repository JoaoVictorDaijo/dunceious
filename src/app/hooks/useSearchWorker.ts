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
import { runInlineSearch } from '@/src/app/logic/runInlineSearch';
import {
  type CompletedSearch,
  type SearchAnnotationHit,
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
  progress: { streamsDone: 0, streamsTotal: 0, currentFraction: 0 } };

export type { SearchOptions };

/**
 * How long a fuzzy search may run in the worker before it is abandoned. The
 * worker is replaced rather than reused, since a stuck job would hold every
 * later request in its queue.
 */
export const FUZZY_WORKER_TIMEOUT_MS = 15_000;

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
 * The worker is created once and reused; refs keep callback/query values fresh
 * for response handling without worker churn during typing.
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
    maxResults: 100,
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

  const executeSearchInline = useCallback(
    (request: SearchWorkerRequest): SearchResult[] => runInlineSearch(request),
    [],
  );

  const searchWorkerRef = useRef<Worker | null>(null);
  const lastRequestRef = useRef<SearchWorkerRequest | null>(null);
  const nextRequestIdRef = useRef(0);
  const pendingRequestIdRef = useRef<number | null>(null);
  const fuzzyTimeoutRef = useRef<number | null>(null);
  const navigationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestQueryRef = useRef(searchQuery);
  const addLogRef = useRef(addLog);
  const onFirstResultRef = useRef(onFirstResult);
  const isMountedRef = useRef(true);
  const replaceWorkerRef = useRef<() => void>(() => {});

  const clearFuzzyTimeout = useCallback(() => {
    if (fuzzyTimeoutRef.current !== null) {
      window.clearTimeout(fuzzyTimeoutRef.current);
      fuzzyTimeoutRef.current = null;
    }
  }, []);

  const cancelPendingSearch = useCallback(() => {
    localGeneration.current++;
    if (localActive.current) { localActive.current = false; poolRef.current.cancel(); }
    setLocalJob(idleLocalJob); setLocalCounts(null);
    // A worker still busy with the abandoned job would hold the next request in its queue.
    if (pendingRequestIdRef.current !== null) replaceWorkerRef.current();
    pendingRequestIdRef.current = null;
    lastRequestRef.current = null;
    clearFuzzyTimeout();
    if (navigationTimeoutRef.current !== null) {
      clearTimeout(navigationTimeoutRef.current);
      navigationTimeoutRef.current = null;
    }
  }, [clearFuzzyTimeout]);

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
  }, [records, clearSearch, moduleState.error]);

  const applySearchResults = useCallback((results: SearchResult[], request: SearchWorkerRequest) => {
    setIsSearching(false);
    setSearchResults(results);
    const local = request.mode === 'fuzzy' && localSearchOptions(request.options).fuzzyMethod === 'local';
    const scoring = local ? loadScoring(scoringFor(request.moleculeType === 'protein')) : null;
    setCompletedSearch({ query: request.searchQuery, mode: local ? 'local' : request.mode === 'exact' ? 'iupac' : 'whole',
      ...(scoring ? { matrixScore: (q: string, r: string) => scoreOf(scoring, q, r) } : {}),
      alphabet: request.moleculeType === 'protein' ? 'protein' : 'nucleotide', options: { ...request.options } });

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

  const runInlineFallback = useCallback((request: SearchWorkerRequest, reason: string) => {
    addLogRef.current(reason);
    try {
      const results = executeSearchInline(request);
      applySearchResults(results, request);
    } catch (err) {
      addLogRef.current(`Fallback search failed: ${String(err)}`);
      setIsSearching(false);
      setCurrentSearchIdx(-1);
      setSearchResults([]);
    } finally {
      pendingRequestIdRef.current = null;
      clearFuzzyTimeout();
    }
  }, [executeSearchInline, applySearchResults, clearFuzzyTimeout]);

  useEffect(() => {
    latestQueryRef.current = searchQuery;
    addLogRef.current = addLog;
    onFirstResultRef.current = onFirstResult;
  }, [searchQuery, addLog, onFirstResult]);

  // ── Worker lifecycle ───────────────────────────────────────────────────────
  useEffect(() => {
    isMountedRef.current = true;

    const retire = () => {
      const worker = searchWorkerRef.current;
      if (!worker) return;
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
      searchWorkerRef.current = null;
    };

    const spawn = () => {
      let worker: Worker;
      try {
        worker = new Worker(
          new URL('@/src/workers/search.worker.ts', import.meta.url),
          { type: 'module' },
        );
      } catch (err) {
        // Without a worker, fuzzy searches take the inline fallback in `handleSearch`.
        addLogRef.current(`Search Worker could not start: ${String(err)}`);
        return;
      }

      worker.onmessage = (e: MessageEvent<SearchWorkerResponse>) => {
        if (!isMountedRef.current) return;
        const msg = e.data;

        if (pendingRequestIdRef.current === null) return;
        if (typeof msg.requestId === 'number' && msg.requestId !== pendingRequestIdRef.current) return;

        clearFuzzyTimeout();
        pendingRequestIdRef.current = null;
        setIsSearching(false);
        if ('error' in msg) {
          // The inline path runs the same search core, so retrying there would fail the same way.
          addLogRef.current(`Search Error: ${msg.error}`);
          return;
        }

        if (lastRequestRef.current) applySearchResults(msg.results, lastRequestRef.current);
      };

      worker.onerror = (event: ErrorEvent) => {
        if (!isMountedRef.current || pendingRequestIdRef.current === null) return;
        const pending = lastRequestRef.current;
        if (pending && pending.mode === 'fuzzy') {
          runInlineFallback(pending, `Search Worker Error: ${event.message}. Using local fallback.`);
          return;
        }
        clearFuzzyTimeout();
        pendingRequestIdRef.current = null;
        setIsSearching(false);
        addLogRef.current(`Search Worker Error: ${event.message}`);
      };

      searchWorkerRef.current = worker;
    };

    replaceWorkerRef.current = () => { retire(); spawn(); };
    spawn();

    return () => {
      replaceWorkerRef.current = () => {};
      cancelPendingSearch();
      retire();
      isMountedRef.current = false;
    };
  }, []);

  // ── Dispatch search request ───────────────────────────────────────────────
  const handleSearch = useCallback(() => {
    cancelPendingSearch();
    const normalizedQuery = searchQuery.replace(/\s+/g, '');
    if (!normalizedQuery || normalizedQuery.length < 1) {
      clearSearch();
      return;
    }
    setCompletedSearch(null);
    setSearchResults([]);
    setCurrentSearchIdx(-1);
    setIsSearching(true);
    setSelectedSearchIndices(new Set());
    addLog(`Initiating ${searchMode} search for '${normalizedQuery}'...`);

    const requestId = ++nextRequestIdRef.current;
    const request: SearchWorkerRequest = {
      requestId,
      searchQuery: normalizedQuery,
      records: searchableRecords,
      mode: searchMode,
      options: searchOptions,
      moleculeType: isProteinSession ? 'protein' : 'dna',
    };
    lastRequestRef.current = request;
    if (searchMode === 'fuzzy' && localSearchOptions(searchOptions).fuzzyMethod === 'local') {
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
        moleculeType: request.moleculeType!, scoring: scoring.id, limit: searchOptions.maxResults,
        filters: localSearchOptions(searchOptions).localFilters, strand: searchOptions.strand }, progress => {
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

    // Keep exact/IUPAC deterministic and independent of worker state.
    if (searchMode === 'exact') {
      try {
        const exactResults = executeSearchInline(request);
        applySearchResults(exactResults, request);
      } catch (err) {
        addLog(`Search execution failed: ${String(err)}`);
        setCurrentSearchIdx(-1);
        setSearchResults([]);
      }
      setIsSearching(false);
      pendingRequestIdRef.current = null;
      clearFuzzyTimeout();
      return;
    }

    const worker = searchWorkerRef.current;
    if (worker) {
      try {
        pendingRequestIdRef.current = requestId;
        worker.postMessage(request);

        clearFuzzyTimeout();
        fuzzyTimeoutRef.current = window.setTimeout(() => {
          fuzzyTimeoutRef.current = null;
          if (!isMountedRef.current || pendingRequestIdRef.current !== requestId) return;
          // Rerunning inline would freeze the page for at least as long.
          pendingRequestIdRef.current = null;
          replaceWorkerRef.current();
          setIsSearching(false);
          setSearchResults([]);
          setCurrentSearchIdx(-1);
          addLogRef.current(`Fuzzy search stopped after ${FUZZY_WORKER_TIMEOUT_MS / 1000} s; try a shorter query.`);
        }, FUZZY_WORKER_TIMEOUT_MS);

        return;
      } catch (err) {
        if (searchMode === 'fuzzy') {
          runInlineFallback(request, `Search Worker dispatch failed: ${String(err)}. Using local fallback.`);
          return;
        }
        addLog(`Search Worker dispatch failed: ${String(err)}`);
        setIsSearching(false);
        pendingRequestIdRef.current = null;
        clearFuzzyTimeout();
        return;
      }
    } else {
      if (searchMode === 'fuzzy') {
        runInlineFallback(request, 'Search Worker unavailable for fuzzy search; using local fallback.');
        return;
      }
      addLog('Search Worker unavailable.');
      setIsSearching(false);
      pendingRequestIdRef.current = null;
      clearFuzzyTimeout();
      return;
    }
  }, [searchQuery, searchableRecords, searchMode, searchOptions, isProteinSession, addLog, executeSearchInline, applySearchResults, runInlineFallback, clearFuzzyTimeout, cancelPendingSearch, clearSearch, moduleState.error]);

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

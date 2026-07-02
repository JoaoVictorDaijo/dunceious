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

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { SeqRecord, SelectionArea, SearchResult } from '@/src/domain/bio/types';
import { isProteinSession as computeIsProteinSession } from '@/src/domain/bio';
import type { SearchWorkerRequest, SearchWorkerResponse, SearchableRecord, SearchOptions } from '@/src/workers/protocol';
import type { GroupedSearchResults } from '../components/SearchPanel';
import { runInlineSearch } from '@/services/search/runInlineSearch';
import {
  filteredResults as computeFilteredResults,
  groupedSearchResults as computeGroupedSearchResults,
  joinSegments,
  getSequenceContext as computeSequenceContext,
} from '@/src/app/logic/searchState';

export type { SearchOptions };

export interface UseSearchWorkerReturn {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  searchMode: 'exact' | 'fuzzy';
  setSearchMode: (mode: 'exact' | 'fuzzy') => void;
  searchOptions: SearchOptions;
  setSearchOptions: (opts: SearchOptions) => void;
  searchResults: SearchResult[];
  /** Fuzzy results filtered by minScore; equals searchResults for exact mode. */
  filteredResults: SearchResult[];
  currentSearchIdx: number;
  setCurrentSearchIdx: (idx: number) => void;
  selectedSearchIndices: Set<number>;
  setSelectedSearchIndices: (next: Set<number>) => void;
  maxScoreFound: number;
  isSearching: boolean;
  isProteinSession: boolean;
  groupedSearchResults: GroupedSearchResults;
  handleSearch: () => void;
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
  ) => void,
  onFirstResult: (selection: SelectionArea) => void,
): UseSearchWorkerReturn {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMode, setSearchMode] = useState<'exact' | 'fuzzy'>('exact');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [currentSearchIdx, setCurrentSearchIdx] = useState(-1);
  const [selectedSearchIndices, setSelectedSearchIndices] = useState<Set<number>>(new Set());
  const [isSearching, setIsSearching] = useState(false);
  const [searchOptions, setSearchOptions] = useState<SearchOptions>({
    minScore: 20,
    strand: 'both',
    maxResults: 100,
  });
  const [maxScoreFound, setMaxScoreFound] = useState(0);

  const isProteinSession = useMemo(
    () => computeIsProteinSession(records),
    [records],
  );

  const searchableRecords = useMemo<SearchableRecord[]>(() => {
    return records.map(r => ({
      id: r.id,
      sequence: r.sequence,
      alignedSequence: r.alignedSequence,
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
  const latestQueryRef = useRef(searchQuery);
  const addLogRef = useRef(addLog);
  const onFirstResultRef = useRef(onFirstResult);
  const isMountedRef = useRef(true);

  const clearFuzzyTimeout = useCallback(() => {
    if (fuzzyTimeoutRef.current !== null) {
      window.clearTimeout(fuzzyTimeoutRef.current);
      fuzzyTimeoutRef.current = null;
    }
  }, []);

  const applySearchResults = useCallback((results: SearchResult[], queryForLog: string) => {
    setIsSearching(false);
    const max = results.length > 0 ? Math.max(...results.map(r => r.score ?? 0)) : 0;
    setMaxScoreFound(max);
    setSearchResults(results);

    addLogRef.current(`Search complete: ${results.length} matches found.`);

    if (results.length > 0) {
      setCurrentSearchIdx(0);
      const first = results[0];
      setTimeout(() => {
        onFirstResultRef.current({ start: first.start, end: first.end, recordIds: [first.recordId] });
      }, 0);
    } else {
      setCurrentSearchIdx(-1);
      addLogRef.current(`No matches found for '${queryForLog}'.`);
    }
  }, []);

  const runInlineFallback = useCallback((request: SearchWorkerRequest, reason: string) => {
    addLogRef.current(reason);
    try {
      const results = executeSearchInline(request);
      applySearchResults(results, request.searchQuery);
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

  // ── Fuzzy filter ──────────────────────────────────────────────────────────
  const filteredResults = useMemo(
    () => computeFilteredResults(searchResults, searchMode, maxScoreFound, searchOptions.minScore),
    [searchResults, searchMode, maxScoreFound, searchOptions.minScore],
  );

  // ── Worker lifecycle ───────────────────────────────────────────────────────
  useEffect(() => {
    isMountedRef.current = true;

    searchWorkerRef.current = new Worker(
      new URL('@/src/workers/searchWorker.ts', import.meta.url),
      { type: 'module' },
    );

    searchWorkerRef.current.onmessage = (e: MessageEvent<SearchWorkerResponse>) => {
      if (!isMountedRef.current) return;
      const msg = e.data;

      if (
        typeof msg.requestId === 'number' &&
        pendingRequestIdRef.current !== null &&
        msg.requestId !== pendingRequestIdRef.current
      ) {
        return;
      }

      clearFuzzyTimeout();
      pendingRequestIdRef.current = null;
      setIsSearching(false);
      if ('error' in msg) {
        addLogRef.current(`Search Error: ${msg.error}`);
        const pending = lastRequestRef.current;
        if (pending && pending.mode === 'fuzzy') {
          runInlineFallback(pending, 'Worker returned an error for fuzzy search; using local fallback.');
        }
        return;
      }

      const { results } = msg;
      applySearchResults(results, latestQueryRef.current);
    };

    searchWorkerRef.current.onerror = (event: ErrorEvent) => {
      if (!isMountedRef.current) return;
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

    return () => {
      clearFuzzyTimeout();
      pendingRequestIdRef.current = null;
      const worker = searchWorkerRef.current;
      if (worker) {
        worker.onmessage = null;
        worker.onerror = null;
        worker.terminate();
        searchWorkerRef.current = null;
      }
      isMountedRef.current = false;
    };
  }, []);

  // ── Dispatch search request ───────────────────────────────────────────────
  const handleSearch = useCallback(() => {
    const normalizedQuery = searchQuery.replace(/\s+/g, '');
    if (!normalizedQuery || normalizedQuery.length < 1) {
      setSearchResults([]);
      setCurrentSearchIdx(-1);
      setSelectedSearchIndices(new Set());
      return;
    }
    setIsSearching(true);
    setSelectedSearchIndices(new Set());
    addLog(`Initiating ${searchMode} search for '${normalizedQuery}'...`);

    const workerMinScore = searchMode === 'fuzzy'
      ? 1
      : 0;
    const requestId = ++nextRequestIdRef.current;
    const request: SearchWorkerRequest = {
      requestId,
      searchQuery: normalizedQuery,
      records: searchableRecords,
      mode: searchMode,
      options: { ...searchOptions, minScore: workerMinScore },
      moleculeType: isProteinSession ? 'protein' : 'dna',
    };
    lastRequestRef.current = request;

    // Keep exact/IUPAC deterministic and independent of worker state.
    if (searchMode === 'exact') {
      try {
        const exactResults = executeSearchInline(request);
        applySearchResults(exactResults, normalizedQuery);
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
          if (!isMountedRef.current) return;
          if (pendingRequestIdRef.current !== requestId) return;
          const pending = lastRequestRef.current;
          if (!pending || pending.mode !== 'fuzzy') return;
          runInlineFallback(pending, 'Fuzzy worker timeout; using local fallback.');
        }, 4500);

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
  }, [searchQuery, searchableRecords, searchMode, searchOptions, isProteinSession, addLog, executeSearchInline, applySearchResults, runInlineFallback, clearFuzzyTimeout]);

  // ── Grouped results (keyed by recordId) ───────────────────────────────────
  const groupedSearchResults = useMemo<GroupedSearchResults>(
    () => computeGroupedSearchResults(filteredResults),
    [filteredResults],
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
    );
  };

  const joinSelectedMatches = () => {
    if (selectedSearchIndices.size < 2) return;
    const indices = Array.from(selectedSearchIndices).sort((a, b) => a - b);
    const matches = indices.map(i => filteredResults[i]);
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
    searchQuery,
    setSearchQuery,
    searchMode,
    setSearchMode,
    searchOptions,
    setSearchOptions,
    searchResults,
    filteredResults,
    currentSearchIdx,
    setCurrentSearchIdx,
    selectedSearchIndices,
    setSelectedSearchIndices,
    maxScoreFound,
    isSearching,
    isProteinSession,
    groupedSearchResults,
    handleSearch,
    toggleRecordSelection,
    joinAllInRecord,
    joinSelectedMatches,
    getSequenceContext,
  };
}

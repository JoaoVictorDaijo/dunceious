import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { SeqRecord, SelectionArea, SearchResult } from '@/src/domain/bio/types';
import type { SearchWorkerRequest, SearchWorkerResponse, SearchableRecord } from '@/src/workers/protocol';
import type { GroupedSearchResults } from '../components/SearchPanel';
import {
  degenerateToRegex,
  getNonGapSegments,
  mapUngappedRangeToAligned,
  removeGapsWithMap,
  reverseComplement,
  smithWaterman,
} from '@/services/searchLogic';

export interface SearchOptions {
  minScore: number;
  strand: 'fwd' | 'rev' | 'both';
  maxResults: number;
}

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

  const searchableRecords = useMemo<SearchableRecord[]>(() => {
    return records.map(r => ({
      id: r.id,
      sequence: r.sequence,
      alignedSequence: r.alignedSequence,
    }));
  }, [records]);

  const executeSearchInline = useCallback((request: SearchWorkerRequest): SearchResult[] => {
    const { searchQuery, records: inputRecords, mode, options } = request;
    const { minScore = 5, strand = 'both', maxResults = 100 } = options;

    if (!searchQuery || searchQuery.length < 1) return [];

    const results: SearchResult[] = [];
    const queryUpper = searchQuery.toUpperCase();
    const startedAt = Date.now();
    const maxInlineMs = mode === 'fuzzy' ? 1800 : 6000;

    for (const record of inputRecords) {
      if (Date.now() - startedAt > maxInlineMs) break;
      const seq = typeof record.alignedSequence === 'string'
        ? record.alignedSequence
        : (typeof record.sequence === 'string' ? record.sequence : '');
      if (!seq) continue;
      const L = seq.length;

      if (mode === 'fuzzy') {
        const { ungapped: ungappedSeq, map: fwdMap } = removeGapsWithMap(seq);

        if ((strand === 'both' || strand === 'fwd') && ungappedSeq.length > 0) {
          const fwdFuzzy = smithWaterman(queryUpper, ungappedSeq, 2, -1, -3, -1, minScore);
          fwdFuzzy.forEach(m => {
            const aligned = mapUngappedRangeToAligned(fwdMap, m.start, m.end);
            results.push({
              start: aligned.start,
              end: aligned.end,
              sequence: seq.substring(aligned.start, aligned.end),
              score: m.score,
              recordId: record.id,
              strand: 1,
              segments: getNonGapSegments(seq, aligned.start, aligned.end),
            });
          });
        }

        if (Date.now() - startedAt > maxInlineMs) break;

        if (strand === 'both' || strand === 'rev') {
          const rcSeq = reverseComplement(seq);
          const { ungapped: ungappedRcSeq, map: revMap } = removeGapsWithMap(rcSeq);
          if (ungappedRcSeq.length === 0) continue;

          const revFuzzy = smithWaterman(queryUpper, ungappedRcSeq, 2, -1, -3, -1, minScore);
          revFuzzy.forEach(m => {
            const rcRange = mapUngappedRangeToAligned(revMap, m.start, m.end);
            const start = L - rcRange.end;
            const end = L - rcRange.start;
            results.push({
              score: m.score,
              start,
              end,
              sequence: seq.substring(start, end),
              recordId: record.id,
              strand: -1,
              segments: getNonGapSegments(seq, start, end),
            });
          });
        }
      } else {
        const regex = degenerateToRegex(searchQuery);

        if (strand === 'both' || strand === 'fwd') {
          let match;
          regex.lastIndex = 0;
          while ((match = regex.exec(seq)) !== null) {
            const start = match.index;
            const end = match.index + match[0].length;
            results.push({
              start,
              end,
              sequence: match[0],
              recordId: record.id,
              strand: 1,
              segments: getNonGapSegments(seq, start, end),
            });
            regex.lastIndex = match.index + 1;
          }
        }

        if (strand === 'both' || strand === 'rev') {
          const rcSeq = reverseComplement(seq);
          let match;
          regex.lastIndex = 0;
          while ((match = regex.exec(rcSeq)) !== null) {
            const rcStart = match.index;
            const rcEnd = match.index + match[0].length;
            const start = L - rcEnd;
            const end = L - rcStart;

            results.push({
              start,
              end,
              sequence: match[0],
              recordId: record.id,
              strand: -1,
              segments: getNonGapSegments(seq, start, end),
            });
            regex.lastIndex = match.index + 1;
          }
        }
      }
    }

    if (mode === 'fuzzy') {
      results.sort((a, b) => (b.score || 0) - (a.score || 0) || a.start - b.start);
    } else {
      results.sort((a, b) => a.start - b.start || a.recordId.localeCompare(b.recordId));
    }

    return results.length > maxResults ? results.slice(0, maxResults) : results;
  }, []);

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
  const filteredResults = useMemo(() => {
    if (searchMode !== 'fuzzy' || maxScoreFound === 0) return searchResults;
    return searchResults.filter(
      r => ((r.score ?? 0) / maxScoreFound) * 100 >= searchOptions.minScore,
    );
  }, [searchResults, searchMode, maxScoreFound, searchOptions.minScore]);

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
  }, [searchQuery, searchableRecords, searchMode, searchOptions, addLog, executeSearchInline, applySearchResults, runInlineFallback, clearFuzzyTimeout]);

  // ── Grouped results (keyed by recordId) ───────────────────────────────────
  const groupedSearchResults = useMemo<GroupedSearchResults>(() => {
    const groups: GroupedSearchResults = {};
    filteredResults.forEach((r, idx) => {
      if (!groups[r.recordId]) groups[r.recordId] = { results: [], indices: [] };
      groups[r.recordId].results.push(r);
      groups[r.recordId].indices.push(idx);
    });
    return groups;
  }, [filteredResults]);

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
    if (!group || group.results.length < 2) return;
    const strand = group.results[0].strand;
    if (group.results.some(r => r.strand !== strand)) {
      alert('All matches in the record must have the same strand to be joined automatically.');
      return;
    }
    const segments = group.results
      .map(r => ({ start: r.start, end: r.end }))
      .sort((a, b) => a.start - b.start);
    addAnnotationFromSearch(
      recordId,
      segments[0].start,
      segments[segments.length - 1].end,
      `Joined Record Search: ${searchQuery}`,
      segments,
    );
  };

  const joinSelectedMatches = () => {
    if (selectedSearchIndices.size < 2) return;
    const indices = Array.from(selectedSearchIndices).sort((a, b) => a - b);
    const matches = indices.map(i => filteredResults[i]);
    const recordId = matches[0].recordId;
    const strand = matches[0].strand;
    if (matches.some(m => m.recordId !== recordId || m.strand !== strand)) {
      alert('All selected matches must be on the same sequence and strand to be joined.');
      return;
    }
    const segments = matches.map(m => ({ start: m.start, end: m.end }));
    addAnnotationFromSearch(
      recordId,
      Math.min(...segments.map(s => s.start)),
      Math.max(...segments.map(s => s.end)),
      `Joined Search: ${searchQuery}`,
      segments,
    );
  };

  const getSequenceContext = (
    recordId: string,
    start: number,
    end: number,
    contextLen = 8,
  ): { pre: string; match: string; post: string } => {
    const record = records.find(r => r.id === recordId);
    if (!record) return { pre: '', match: '', post: '' };
    const seq = record.alignedSequence || record.sequence;
    return {
      pre: seq.substring(Math.max(0, start - contextLen), start),
      match: seq.substring(start, end),
      post: seq.substring(end, Math.min(seq.length, end + contextLen)),
    };
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
    groupedSearchResults,
    handleSearch,
    toggleRecordSelection,
    joinAllInRecord,
    joinSelectedMatches,
    getSequenceContext,
  };
}

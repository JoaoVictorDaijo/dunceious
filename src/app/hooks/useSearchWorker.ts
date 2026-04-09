import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { SeqRecord, SelectionArea, SearchResult } from '@/src/domain/bio/types';
import type { SearchWorkerRequest, SearchWorkerResponse } from '@/src/workers/protocol';
import type { GroupedSearchResults } from '../components/SearchPanel';

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

  const searchWorkerRef = useRef<Worker | null>(null);
  const latestQueryRef = useRef(searchQuery);
  const addLogRef = useRef(addLog);
  const onFirstResultRef = useRef(onFirstResult);

  useEffect(() => {
    latestQueryRef.current = searchQuery;
  }, [searchQuery]);

  useEffect(() => {
    addLogRef.current = addLog;
  }, [addLog]);

  useEffect(() => {
    onFirstResultRef.current = onFirstResult;
  }, [onFirstResult]);

  // ── Fuzzy filter ──────────────────────────────────────────────────────────
  const filteredResults = useMemo(() => {
    if (searchMode !== 'fuzzy' || maxScoreFound === 0) return searchResults;
    return searchResults.filter(
      r => ((r.score ?? 0) / maxScoreFound) * 100 >= searchOptions.minScore,
    );
  }, [searchResults, searchMode, maxScoreFound, searchOptions.minScore]);

  // ── Worker lifecycle ───────────────────────────────────────────────────────
  useEffect(() => {
    searchWorkerRef.current = new Worker(
      new URL('@/src/workers/searchWorker.ts', import.meta.url),
      { type: 'module' },
    );

    searchWorkerRef.current.onmessage = (e: MessageEvent<SearchWorkerResponse>) => {
      const msg = e.data;
      setIsSearching(false);
      if ('error' in msg) { addLogRef.current(`Search Error: ${msg.error}`); return; }

      const { results } = msg;
      const max = results.length > 0 ? Math.max(...results.map(r => r.score ?? 0)) : 0;
      setMaxScoreFound(max);
      setSearchResults(results);

      if (results.length > 0) {
        setCurrentSearchIdx(0);
        const first = results[0];
        setTimeout(() => {
          onFirstResultRef.current({ start: first.start, end: first.end, recordIds: [first.recordId] });
        }, 0);
        addLogRef.current(`Search complete: ${results.length} matches found.`);
      } else {
        setCurrentSearchIdx(-1);
        addLogRef.current(`No matches found for '${latestQueryRef.current}'.`);
      }
    };

    return () => { searchWorkerRef.current?.terminate(); };
  }, []);

  // ── Dispatch search request ───────────────────────────────────────────────
  const handleSearch = useCallback(() => {
    if (!searchQuery || searchQuery.length < 2) {
      setSearchResults([]);
      setCurrentSearchIdx(-1);
      setSelectedSearchIndices(new Set());
      return;
    }
    setIsSearching(true);
    setSelectedSearchIndices(new Set());
    addLog(`Initiating ${searchMode} search for '${searchQuery}'...`);

    const workerMinScore = searchMode === 'fuzzy' ? 5 : 0;
    const request: SearchWorkerRequest = {
      searchQuery,
      records,
      mode: searchMode,
      options: { ...searchOptions, minScore: workerMinScore },
    };
    searchWorkerRef.current?.postMessage(request);
  }, [searchQuery, records, searchMode, searchOptions, addLog]);

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

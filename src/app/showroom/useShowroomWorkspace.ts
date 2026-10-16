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

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { SearchResult, SelectionArea, SeqRecord } from '@/src/domain/bio/types';
import type { SearchOptions, SearchWorkerRequest } from '@/src/workers/protocol';
import { handleBioMessage } from '@/src/workers/handlers/bio';
import { runSearch } from '@/src/workers/handlers/search';
import { runInlineSearch } from '@/src/app/logic/runInlineSearch';
import { getSequenceContext, groupedSearchResults } from '@/src/app/logic/searchState';
import { loadSampleRecords } from './sampleWorkspace';
import type { ExplainId } from './explanations';

type Layer = 'annotations' | 'translation' | 'tracks';
type SearchMode = 'exact' | 'fuzzy';

/** The workbench runs exact search in the page and fuzzy search in its worker; both bodies run here in the page. */
function searchSamples(request: SearchWorkerRequest): SearchResult[] {
  if (request.mode === 'exact') return runInlineSearch(request);
  const response = runSearch(request);
  return 'results' in response ? response.results : runInlineSearch(request);
}

/** `useSearchWorker` and App's search wiring, without the worker. */
function useSampleSearch(records: SeqRecord[], setActiveSelection: Dispatch<SetStateAction<SelectionArea | null>>) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<SearchMode>('exact');
  const [options, setOptions] = useState<SearchOptions>({ minIdentity: 80, strand: 'both', maxResults: 100 });
  const [results, setResults] = useState<SearchResult[]>([]);
  const [currentIdx, setCurrentIdx] = useState(-1);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const searchSelection = useRef<SelectionArea | null>(null);

  const reset = useCallback(() => {
    setQuery(''); setResults([]); setCurrentIdx(-1); setSelected(new Set());
  }, []);
  useEffect(() => { reset(); }, [records, reset]);

  const clear = useCallback(() => {
    reset();
    const made = searchSelection.current;
    setActiveSelection(current => current === made ? null : current);
    searchSelection.current = null;
  }, [reset, setActiveSelection]);

  const run = () => {
    const searchQuery = query.replace(/\s+/g, '');
    if (!searchQuery) { clear(); return; }
    setSelected(new Set());
    const found = searchSamples({
      searchQuery, mode,
      records: records.map(({ id, sequence, alignedSequence, moleculeType }) => ({ id, sequence, alignedSequence, moleculeType })),
      options,
      moleculeType: 'dna',
    });
    setResults(found);
    setCurrentIdx(found.length > 0 ? 0 : -1);
    if (found.length === 0) return;
    const selection = { start: found[0].start, end: found[0].end, recordIds: [found[0].recordId] };
    searchSelection.current = selection;
    setActiveSelection(selection);
  };

  const grouped = useMemo(() => groupedSearchResults(results), [results]);
  const toggleRecord = (recordId: string, select: boolean) => {
    const group = grouped[recordId];
    if (!group) return;
    const next = new Set(selected);
    group.indices.forEach(index => { if (select) next.add(index); else next.delete(index); });
    setSelected(next);
  };
  const context = (recordId: string, start: number, end: number) =>
    getSequenceContext(records.find(record => record.id === recordId), start, end);

  return {
    query, setQuery, mode, setMode, options, setOptions, results, grouped,
    run, clear, currentIdx, setCurrentIdx, selected, setSelected, toggleRecord, context,
    /** Lets a search result row select its match as the workbench's `selectSearchResult` does. */
    select: (selection: SelectionArea) => { searchSelection.current = selection; setActiveSelection(selection); },
  };
}

/** The bio worker's PROCESS_RECORDS over the visible records, as `useBioWorker` requests it after every change. */
function processVisible(records: SeqRecord[]): { transposedRecords: SeqRecord[]; consensus: string } {
  const visible = records.filter(record => record.visible !== false);
  if (visible.length === 0) return { transposedRecords: [], consensus: '' };
  const response = handleBioMessage({ type: 'PROCESS_RECORDS', records: visible });
  return response.type === 'SUCCESS' ? { transposedRecords: response.records, consensus: response.consensus } : { transposedRecords: [], consensus: '' };
}

/**
 * The showroom's whole session, held in memory only: the sample records, the
 * viewer toggles, the selection, sequence search and the open explanation.
 * Leaving the showroom unmounts it, so the next visit starts fresh.
 */
export function useShowroomWorkspace() {
  const [records, setRecords] = useState<SeqRecord[]>(loadSampleRecords);
  const { transposedRecords, consensus } = useMemo(() => processVisible(records), [records]);
  const [layers, setLayers] = useState<Record<Layer, boolean>>({ annotations: true, translation: true, tracks: true });
  // Pan first: a finger drag pans in either mode, so Pan names what a visitor's drag does.
  const [dragMode, setDragMode] = useState<'pan' | 'select'>('pan');
  const [activeSelection, setActiveSelection] = useState<SelectionArea | null>(null);
  const [jumpTo, setJumpTo] = useState<number | null>(null);
  const [explanation, setExplanation] = useState<{ id: ExplainId; anchor: DOMRect | null; serial: number } | null>(null);
  const search = useSampleSearch(records, setActiveSelection);

  const setRecordVisible = useCallback((id: string, visible: boolean) => {
    setRecords(previous => previous.map(record => record.id === id && (record.visible !== false) !== visible ? { ...record, visible } : record));
  }, []);
  const toggle = useCallback((layer: Layer) => setLayers(previous => ({ ...previous, [layer]: !previous[layer] })), []);
  const openExplain = useCallback((id: ExplainId, anchor?: DOMRect) =>
    setExplanation(previous => ({ id, anchor: anchor ?? null, serial: (previous?.serial ?? 0) + 1 })), []);
  const closeExplain = useCallback(() => setExplanation(null), []);

  return {
    records, transposedRecords, consensus, setRecordVisible,
    showAnnotations: layers.annotations, showTranslation: layers.translation, showTracks: layers.tracks, toggle,
    dragMode, setDragMode, activeSelection, setActiveSelection, search, jumpTo, setJumpTo,
    explain: explanation?.id ?? null, explainAnchor: explanation?.anchor ?? null, openExplain, closeExplain,
    /** Changes with every opening, so each explanation mounts its own callout: fresh placement and focus. */
    explainKey: explanation?.serial ?? 0,
  };
}

export type ShowroomWorkspace = ReturnType<typeof useShowroomWorkspace>;

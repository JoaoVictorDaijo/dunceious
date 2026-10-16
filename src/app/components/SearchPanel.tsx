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

import React from 'react';
import type { CompletedSearch, SearchAnnotationHit } from '../logic/searchState';
import { hitColumns, hitCounts } from '@/src/core/search/hitColumns';
import { pathQuery } from '@/src/core/search/editPath';
import { ungappedSpan } from '@/src/core/search/hitPaths';
import { formatPairAlignment, hitCountsText } from '../logic/hitAlignmentText';
import { HitBarcode } from './search/HitBarcode';
import { HitAlignment } from './search/HitAlignment';
import { SearchDetails } from './search/SearchDetails';
import { SeqRecord, SelectionArea, SearchResult } from '@/src/domain/bio/types';
import { MIN_FUZZY_IDENTITY, maxEditsForIdentity } from '@/src/core/search/fuzzy';
import type { SearchOptions } from '@/src/workers/protocol';
import SectionTitle from './SectionTitle';

export interface GroupedSearchResults {
  [recordId: string]: { results: SearchResult[]; indices: number[] };
}

export interface SearchPanelProps {
  completedSearch?: CompletedSearch | null;
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  searchMode: 'exact' | 'fuzzy';
  onSearchModeChange: (mode: 'exact' | 'fuzzy') => void;
  searchOptions: SearchOptions;
  onSearchOptionsChange: (opts: SearchOptions) => void;
  isSearching: boolean;
  onSearch: () => void;
  onClearSearch: () => void;
  searchResults: SearchResult[];
  groupedSearchResults: GroupedSearchResults;
  currentSearchIdx: number;
  onSetCurrentIdx: (idx: number) => void;
  selectedSearchIndices: Set<number>;
  onSetSelectedIndices: (next: Set<number>) => void;
  records: SeqRecord[];
  onSetActiveSelection: (sel: SelectionArea) => void;
  onSetActiveTab: (tab: 'alignment' | 'features') => void;
  onToggleRecordSelection: (recordId: string, select: boolean) => void;
  onJoinAllInRecord: (recordId: string) => void;
  onJoinSelectedMatches: () => void;
  onAnnotateMatch: (recordId: string, start: number, end: number, name: string, segments?: { start: number; end: number }[], strand?: 1 | -1, hit?: SearchAnnotationHit) => void;
  getSequenceContext: (recordId: string, start: number, end: number) => { pre: string; match: string; post: string };
  isProteinSession?: boolean;
}

/**
 * Sequence-search panel displayed inside the sidebar.
 * Supports IUPAC exact search and fuzzy search with a minimum identity.
 */
const SearchPanel: React.FC<SearchPanelProps> = ({
  completedSearch,
  records,
  searchQuery,
  onSearchQueryChange,
  searchMode,
  onSearchModeChange,
  searchOptions,
  onSearchOptionsChange,
  isSearching,
  onSearch,
  onClearSearch,
  searchResults,
  groupedSearchResults,
  currentSearchIdx,
  onSetCurrentIdx,
  selectedSearchIndices,
  onSetSelectedIndices,
  onSetActiveSelection,
  onSetActiveTab,
  onToggleRecordSelection,
  onJoinAllInRecord,
  onJoinSelectedMatches,
  onAnnotateMatch,
  getSequenceContext,
  isProteinSession = false,
}) => {
  const queryLength = searchQuery.replace(/\s+/g, '').length;
  return (
    <section data-sequence-search-section className="flex flex-col min-h-0 pt-4">
      <SectionTitle icon="fa-search" trailing={
        <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 shadow-inner">
          <button
            onClick={() => onSearchModeChange('exact')}
            aria-pressed={searchMode === 'exact'}
            data-tip="Exact search with IUPAC ambiguity codes (N, R, Y…)"
            className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${searchMode === 'exact' ? 'bg-sky-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-300'}`}
          >
            IUPAC
          </button>
          <button
            onClick={() => onSearchModeChange('fuzzy')}
            aria-pressed={searchMode === 'fuzzy'}
            data-tip="Approximate search: tolerates substitutions and indels, ranked by identity"
            className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${searchMode === 'fuzzy' ? 'bg-amber-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-300'}`}
          >
            Fuzzy
          </button>
        </div>
      }>Sequence Search</SectionTitle>

      <div className="space-y-6 bg-slate-900/40 p-6 rounded-[2.5rem] border border-slate-800/50 shadow-2xl flex flex-col min-h-0">
        {/* Search input */}
        <div className="space-y-3">
          <div className="relative group">
            <input
              type="text"
              placeholder={searchMode === 'exact' ? 'Enter IUPAC sequence...' : 'Enter query sequence...'}
              className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-5 py-4 text-[12px] font-bold text-slate-200 outline-none focus:border-env transition-all pr-20 shadow-inner group-hover:border-slate-700"
              value={searchQuery}
              onChange={e => onSearchQueryChange(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && onSearch()}
            />
            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-3">
              {(searchQuery || searchResults.length > 0 || isSearching) && (
                <button onClick={onClearSearch} aria-label="Clear search" className="text-slate-500 hover:text-rose-500 transition-colors" data-tip="Clear the query, results and highlights">
                  <i className="fas fa-times-circle text-sm"></i>
                </button>
              )}
              {isSearching ? (
                <i className="fas fa-circle-notch fa-spin text-env text-sm"></i>
              ) : (
                <button
                  onClick={onSearch}
                  aria-label="Search"
                  data-tip="Run the search"
                  data-tip-kbd="Enter"
                  className="w-8 h-8 rounded-xl bg-env/10 flex items-center justify-center text-env hover:bg-env-strong hover:text-white transition-all shadow-inner"
                >
                  <i className="fas fa-arrow-right text-[10px]"></i>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Query identity uses edit distance over the whole query. */}
        {searchMode === 'fuzzy' && (
          <div className="space-y-4 pt-2 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex justify-between items-center px-1">
              <label htmlFor="fuzzy-min-identity" className="text-[11px] font-semibold text-slate-400">Min query identity</label>
              <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-500 text-[10px] font-bold">
                {searchOptions.minIdentity}%
                {queryLength > 0 && ` · ≤ ${maxEditsForIdentity(queryLength, searchOptions.minIdentity)} edits`}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Query identity = 100 × (query length − edits) / query length. Edits include substitutions, insertions and deletions.</p>
            <input
              id="fuzzy-min-identity"
              type="range" min={MIN_FUZZY_IDENTITY} max="100" step="5"
              value={searchOptions.minIdentity}
              onChange={e => onSearchOptionsChange({ ...searchOptions, minIdentity: parseInt(e.target.value) })}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
            />
          </div>
        )}

        {/* Search options */}
        <div className={`grid gap-4 ${isProteinSession ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {!isProteinSession && (
            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-slate-400 px-1">Strand</label>
              <div className="relative">
                <select
                  value={searchOptions.strand}
                  onChange={e => onSearchOptionsChange({ ...searchOptions, strand: e.target.value as 'fwd' | 'rev' | 'both' })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-[10px] font-bold text-slate-400 outline-none focus:border-env appearance-none cursor-pointer"
                >
                  <option value="both">Both Strands</option>
                  <option value="fwd">Forward Only</option>
                  <option value="rev">Reverse Only</option>
                </select>
                <i className="fas fa-chevron-down absolute right-4 top-1/2 -translate-y-1/2 text-[8px] text-slate-500 pointer-events-none"></i>
              </div>
            </div>
          )}
          <div className="space-y-2">
            <label className="text-[11px] font-semibold text-slate-400 px-1">Result limit</label>
            <input
              type="number"
              value={searchOptions.maxResults}
              onChange={e => onSearchOptionsChange({ ...searchOptions, maxResults: parseInt(e.target.value) })}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-[10px] font-bold text-slate-400 outline-none focus:border-env"
            />
          </div>
        </div>

        {/* Results list */}
        {searchResults.length > 0 && (
          <div className="pt-6 border-t border-slate-800/50 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-6 px-1">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-slate-200">{searchResults.length} matches</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-tighter ${searchMode === 'exact' ? 'bg-sky-500/10 text-sky-500' : 'bg-amber-500/10 text-amber-500'}`}>
                    {searchMode}
                  </span>
                </div>
                <span className="text-[11px] font-semibold text-slate-400">
                  Across {Object.keys(groupedSearchResults).length} records
                </span>
              </div>
              <div className="flex gap-2">
                {selectedSearchIndices.size > 0 && (
                  <button
                    onClick={() => onSetSelectedIndices(new Set())}
                    data-tip="Deselect all matches"
                    className="text-[11px] font-semibold text-rose-500 hover:text-rose-400 transition-colors"
                  >
                    Clear
                  </button>
                )}
                {selectedSearchIndices.size > 1 && (
                  <button
                    onClick={onJoinSelectedMatches}
                    data-tip="Create one multi-segment annotation from the selected matches"
                    className="px-4 py-2 rounded-xl bg-env-strong text-white text-[11px] font-semibold hover:bg-env-strong/90 transition-all shadow-xl"
                  >
                    Join selected
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar-pro space-y-8 pr-2 max-h-[500px]">
              {Object.entries(groupedSearchResults).map(([recordId, group]) => (
                <div key={recordId} className="space-y-4">
                  <div className="flex items-center justify-between sticky top-0 bg-slate-950 z-10 py-2 border-b border-slate-800/50">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-env"></div>
                      <span className="text-[11px] font-semibold text-slate-300 truncate max-w-[140px]">{recordId}</span>
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => onToggleRecordSelection(recordId, true)}
                        data-tip="Select every match in this record"
                        className="text-[11px] font-semibold text-slate-400 hover:text-env transition-colors"
                      >
                        Select all
                      </button>
                      <button
                        onClick={() => onJoinAllInRecord(recordId)}
                        className="text-[11px] font-semibold text-slate-400 hover:text-emerald-400 transition-colors"
                        data-tip="Create one multi-segment annotation from every match in this record"
                      >
                        Join all
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3 pl-1">
                    {group.results.map((match, localIdx) => {
                      const globalIdx = group.indices[localIdx];
                      const context = getSequenceContext(match.recordId, match.start, match.end);
                      const isActive = currentSearchIdx === globalIdx;
                      const record = records.find(r => r.id === recordId);
                      const columns = completedSearch && record ? hitColumns({ ...completedSearch,
                        cigar: match.cigar, query: pathQuery(completedSearch.query, completedSearch.mode),
                        span: ungappedSpan(match, record) }) : null;
                      const forwardSeq = record?.alignedSequence || record?.sequence || '';
                      const recordStart = match.strand === 1
                        ? forwardSeq.slice(0, match.start).replace(/-/g, '').length + 1
                        : forwardSeq.slice(0, match.end).replace(/-/g, '').length;

                      return (
                        <div
                          key={globalIdx}
                          data-search-hit=""
                          onClick={() => {
                            onSetCurrentIdx(globalIdx);
                            onSetActiveTab('alignment');
                            onSetActiveSelection({ start: match.start, end: match.end, recordIds: [match.recordId] });
                          }}
                          className={`group relative bg-slate-950/60 rounded-2xl p-4 border transition-all cursor-pointer ${isActive ? 'border-env ring-2 ring-env/20 bg-env/5' : 'border-slate-800/50 hover:border-slate-700 hover:bg-slate-900/40'}`}
                        >
                          <div className="flex justify-between items-start mb-3">
                            <div className="flex items-center gap-3">
                              <div className="relative flex items-center justify-center">
                                <input
                                  type="checkbox"
                                  checked={selectedSearchIndices.has(globalIdx)}
                                  onChange={e => {
                                    e.stopPropagation();
                                    const next = new Set(selectedSearchIndices);
                                    if (e.target.checked) next.add(globalIdx);
                                    else next.delete(globalIdx);
                                    onSetSelectedIndices(next);
                                  }}
                                  className="w-4 h-4 rounded-lg border-slate-700 bg-slate-900 text-env focus:ring-env cursor-pointer"
                                />
                              </div>
                              <div className="flex flex-col">
                                <span className="text-[11px] font-bold text-slate-200 tracking-tight">
                                  {(match.start + 1).toLocaleString()} <span className="text-slate-500 font-normal">→</span> {match.end.toLocaleString()}
                                </span>
                                <span className="text-[11px] font-semibold text-slate-500">Position</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {match.identity !== undefined && (
                                <div className="flex flex-col items-end">
                                  <span className="text-[10px] font-bold text-amber-500">
                                    {Math.floor(match.identity)}%
                                  </span>
                                  <span className="text-[11px] font-semibold text-slate-500 whitespace-nowrap">{match.edits === 1 ? '1 edit' : `${match.edits ?? 0} edits`}</span>
                                </div>
                              )}
                              <div className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-tight ${match.strand === 1 ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'}`}>
                                {match.strand === 1 ? 'Forward' : 'Reverse'}
                              </div>
                            </div>
                          </div>

                          {columns && completedSearch ? <>
                            <HitBarcode columns={columns} strand={match.strand} alphabet={completedSearch.alphabet} mode={completedSearch.mode} />
                            <p className="text-[11px] text-slate-400 mt-1">{hitCountsText(hitCounts(columns), completedSearch.mode)}</p>
                            <HitAlignment storageKey={`${match.recordId}:${match.start}:${match.end}:${match.strand}`}
                              text={formatPairAlignment({ columns, queryName: 'Query', recordName: recordId,
                                queryStart: 1, recordStart, strand: match.strand })} />
                          </> : <div className="seq-scroll text-[11px] font-mono overflow-x-auto whitespace-nowrap">
                            {context.pre}<strong>{context.match}</strong>{context.post}
                          </div>}

                          <div className="mt-3 flex justify-between items-center">
                            <div className="flex gap-2">
                              {isActive && (
                                <span className="text-[11px] font-semibold text-env flex items-center gap-1 animate-pulse">
                                  <i className="fas fa-eye"></i> Active
                                </span>
                              )}
                            </div>
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                onAnnotateMatch(match.recordId, match.start, match.end, `Match: ${match.sequence}`, match.segments, match.strand, completedSearch ? { result: match, search: completedSearch } : undefined);
                              }}
                              aria-label={`Annotate match ${match.start}–${match.end} in ${match.recordId}`}
                              data-tip="Save this match as an annotation"
                              className="shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-env transition-all text-[11px] font-semibold text-env flex items-center gap-2 bg-env/10 hover:bg-env/20 px-3 py-1.5 rounded-lg border border-env/20"
                            >
                              <i className="fas fa-plus text-[10px]"></i> Annotate
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <SearchDetails mode={completedSearch?.mode ?? (searchMode === 'exact' ? 'iupac' : 'whole')} recordCount={Object.keys(groupedSearchResults).length} />
          </div>
        )}
      </div>
    </section>
  );
};

export default SearchPanel;

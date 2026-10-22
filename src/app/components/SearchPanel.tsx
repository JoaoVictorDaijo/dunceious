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
import { SearchResultGroup } from './search/SearchResultGroup';
import { SearchDetails } from './search/SearchDetails';
import { SeqRecord, SelectionArea, SearchResult } from '@/src/domain/bio/types';
import { MIN_FUZZY_IDENTITY, maxEditsForIdentity } from '@/src/core/search/fuzzy';
import type { SearchOptions } from '@/src/workers/protocol';
import SectionTitle from './SectionTitle';
import LocalOptions from './search/LocalOptions';
import LocalSearchMonitor from './search/LocalSearchMonitor';
import type { LocalSearchJob } from '../hooks/useSearchWorker';
import type { LocalSearchCounts } from '@/src/core/search/local/selection';
import { localSearchOptions } from '@/src/workers/protocol';

export interface GroupedSearchResults {
  [recordId: string]: { results: SearchResult[]; indices: number[] };
}

export interface SearchPanelProps {
  localReady?: boolean;
  localOverride?: { status: string; onSelect: () => void };
  localError?: string | null;
  localJob?: LocalSearchJob;
  localCounts?: LocalSearchCounts | null;
  onCancelLocalSearch?: () => void;
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
  localReady = false, localOverride, localError, localJob, localCounts, onCancelLocalSearch,
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
  const { fuzzyMethod, localFilters } = localSearchOptions(searchOptions);
  const local = searchMode === 'fuzzy' && fuzzyMethod === 'local';
  const queryLength = searchQuery.replace(/\s+/g, '').length;
  return (
    <section data-sequence-search-section className="flex flex-col min-h-0 pt-4">
      <SectionTitle icon="fa-search" trailing={
        <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 shadow-inner">
          <button
            onClick={() => onSearchModeChange('exact')}
            aria-pressed={searchMode === 'exact'}
            data-tip="Exact search with IUPAC ambiguity codes (N, R, Y…)"
            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${searchMode === 'exact' ? 'bg-sky-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-300'}`}
          >
            IUPAC
          </button>
          <button
            onClick={() => onSearchModeChange('fuzzy')}
            aria-pressed={searchMode === 'fuzzy'}
            data-tip="Approximate search: tolerates substitutions and indels, ranked by identity"
            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${searchMode === 'fuzzy' ? 'bg-amber-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-300'}`}
          >
            Fuzzy
          </button>
        </div>
      }>Sequence Search</SectionTitle>

      <div className="stack-y-6 bg-slate-900/40 p-4 rounded-3xl border border-slate-800/50 shadow-2xl flex flex-col min-h-0">
        {searchMode === 'fuzzy' && <div className="stack-y-2">
          <div role="group" aria-label="Fuzzy mode" className="inline-flex rounded-xl border border-slate-700 bg-slate-950 p-1">
            {(['whole', 'local'] as const).map(method => <button key={method} type="button" aria-pressed={fuzzyMethod === method}
              disabled={method === 'local' && !localReady && !localOverride} title={method === 'local' && !localReady && !localOverride ? localError ?? 'Loading Local search module' : undefined}
              onClick={() => {
                if (method === 'local' && localOverride) localOverride.onSelect();
                else onSearchOptionsChange({ ...searchOptions, fuzzyMethod: method });
              }}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold disabled:opacity-40 ${fuzzyMethod === method ? 'bg-slate-700 text-white' : 'text-slate-400'}`}>{method === 'whole' ? 'Whole query' : 'Local'}</button>)}
          </div>
          <p role="status" className="text-[11px] text-slate-400">{localOverride ? localOverride.status : localError ?? (localReady ? 'Local search ready' : 'Loading Local search module…')}</p>
        </div>}
        {localJob && onCancelLocalSearch && <LocalSearchMonitor job={localJob} onCancel={onCancelLocalSearch} />}
        {local && <LocalOptions filters={localFilters} isProtein={isProteinSession} onChange={filters => onSearchOptionsChange({ ...searchOptions, localFilters: filters })} />}
        {localJob?.phase === 'failed' && <p role="alert" className="text-xs text-rose-300">Search failed: {localJob.error}</p>}
        {localJob?.phase === 'cancelled' && <p role="status" className="text-xs text-slate-300">Search cancelled</p>}
        {localJob?.phase === 'done' && <p role="status" className="text-xs text-slate-300">Search done{searchResults.length === 0 ? ' · No hits' : ''}</p>}
        {/* Search input */}
        <div className="stack-y-3">
          <div className="relative group">
            <input
              type="text"
              placeholder={searchMode === 'exact' ? 'Enter IUPAC sequence...' : 'Enter query sequence...'}
              className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-5 py-4 text-[12px] font-bold text-slate-200 outline-hidden focus:border-env transition-all pr-20 shadow-inner group-hover:border-slate-700"
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
        {searchMode === 'fuzzy' && !local && (
          <div className="stack-y-4 pt-2 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex justify-between items-center px-1">
              <label htmlFor="fuzzy-min-identity" className="text-[11px] font-semibold text-slate-400">Min query identity</label>
              <span className="px-2 py-0.5 rounded-sm bg-amber-500/10 text-amber-500 text-[10px] font-bold">
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
            <div className="stack-y-2">
              <label className="text-[11px] font-semibold text-slate-400 px-1">Strand</label>
              <div className="relative">
                <select
                  value={searchOptions.strand}
                  onChange={e => onSearchOptionsChange({ ...searchOptions, strand: e.target.value as 'fwd' | 'rev' | 'both' })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-[10px] font-bold text-slate-400 outline-hidden focus:border-env appearance-none cursor-pointer"
                >
                  <option value="both">Both Strands</option>
                  <option value="fwd">Forward Only</option>
                  <option value="rev">Reverse Only</option>
                </select>
                <i className="fas fa-chevron-down absolute right-4 top-1/2 -translate-y-1/2 text-[8px] text-slate-500 pointer-events-none"></i>
              </div>
            </div>
          )}
          <div className="stack-y-2">
            <label className="text-[11px] font-semibold text-slate-400 px-1">Result limit</label>
            <input
              type="number"
              value={Number.isNaN(searchOptions.maxResults) ? '' : searchOptions.maxResults}
              onChange={e => onSearchOptionsChange({ ...searchOptions, maxResults: parseInt(e.target.value) })}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-[10px] font-bold text-slate-400 outline-hidden focus:border-env"
            />
          </div>
        </div>

        {localCounts && searchResults.length === 0 && <SearchDetails mode="local" counts={localCounts} recordCount={0} />}
        {/* Results list */}
        {searchResults.length > 0 && (
          <div className="pt-6 border-t border-slate-800/50 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-6 px-1">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-slate-200">{localCounts && localCounts.cutoff !== null
                    ? `Top ${searchResults.length} shown; lower-scoring alignments aren't counted`
                    : `${searchResults.length} matches`}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-tighter ${searchMode === 'exact' ? 'bg-sky-500/10 text-sky-500' : 'bg-amber-500/10 text-amber-500'}`}>
                    {searchMode}
                  </span>
                </div>
                <span className="text-[11px] font-semibold text-slate-400">
                  Across {Object.keys(groupedSearchResults).length} {Object.keys(groupedSearchResults).length === 1 ? 'record' : 'records'}
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

            <div className="flex-1 overflow-y-auto custom-scrollbar-pro stack-y-8 pr-2 max-h-[500px]">
              {Object.entries(groupedSearchResults).map(([recordId, group]) => <SearchResultGroup
                key={recordId} recordId={recordId} group={group} records={records} completedSearch={completedSearch}
                getSequenceContext={getSequenceContext} currentSearchIdx={currentSearchIdx}
                onSetCurrentIdx={onSetCurrentIdx} onSetActiveTab={onSetActiveTab} onSetActiveSelection={onSetActiveSelection}
                selectedSearchIndices={selectedSearchIndices} onSetSelectedIndices={onSetSelectedIndices}
                onAnnotateMatch={onAnnotateMatch} onToggleRecordSelection={onToggleRecordSelection}
                onJoinAllInRecord={onJoinAllInRecord} />)}
            </div>
            <SearchDetails counts={localCounts} mode={completedSearch?.mode ?? (searchMode === 'exact' ? 'iupac' : 'whole')} recordCount={Object.keys(groupedSearchResults).length} />
          </div>
        )}
      </div>
    </section>
  );
};

export default SearchPanel;

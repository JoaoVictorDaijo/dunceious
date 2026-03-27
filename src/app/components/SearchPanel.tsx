import React from 'react';
import { SeqRecord, SelectionArea, SearchResult } from '@/src/domain/bio/types';

export interface GroupedSearchResults {
  [recordId: string]: { results: SearchResult[]; indices: number[] };
}

export interface SearchPanelProps {
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  searchMode: 'exact' | 'fuzzy';
  onSearchModeChange: (mode: 'exact' | 'fuzzy') => void;
  searchOptions: { minScore: number; strand: 'fwd' | 'rev' | 'both'; maxResults: number };
  onSearchOptionsChange: (opts: SearchPanelProps['searchOptions']) => void;
  isSearching: boolean;
  onSearch: () => void;
  filteredResults: SearchResult[];
  groupedSearchResults: GroupedSearchResults;
  currentSearchIdx: number;
  onSetCurrentIdx: (idx: number) => void;
  selectedSearchIndices: Set<number>;
  onSetSelectedIndices: (next: Set<number>) => void;
  maxScoreFound: number;
  records: SeqRecord[];
  onSetActiveSelection: (sel: SelectionArea) => void;
  onSetActiveTab: (tab: 'alignment' | 'features') => void;
  onToggleRecordSelection: (recordId: string, select: boolean) => void;
  onJoinAllInRecord: (recordId: string) => void;
  onJoinSelectedMatches: () => void;
  onAnnotateMatch: (recordId: string, start: number, end: number, name: string) => void;
  getSequenceContext: (recordId: string, start: number, end: number) => { pre: string; match: string; post: string };
}

/**
 * Sequence-search panel displayed inside the sidebar.
 * Supports IUPAC exact search and fuzzy search with score filtering.
 */
const SearchPanel: React.FC<SearchPanelProps> = ({
  searchQuery,
  onSearchQueryChange,
  searchMode,
  onSearchModeChange,
  searchOptions,
  onSearchOptionsChange,
  isSearching,
  onSearch,
  filteredResults,
  groupedSearchResults,
  currentSearchIdx,
  onSetCurrentIdx,
  selectedSearchIndices,
  onSetSelectedIndices,
  maxScoreFound,
  onSetActiveSelection,
  onSetActiveTab,
  onToggleRecordSelection,
  onJoinAllInRecord,
  onJoinSelectedMatches,
  onAnnotateMatch,
  getSequenceContext,
}) => {
  const clearSearch = () => {
    onSearchQueryChange('');
    onSetSelectedIndices(new Set());
    onSetCurrentIdx(-1);
  };

  return (
    <section className="flex flex-col min-h-0 pt-4">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-[11px] font-black uppercase text-slate-400 tracking-[0.2em] flex items-center gap-3">
          <div className="w-6 h-6 rounded-lg bg-sky-500/10 flex items-center justify-center text-sky-500 shadow-inner">
            <i className="fas fa-search text-[10px]"></i>
          </div>
          Sequence Search
        </h3>
        <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 shadow-inner">
          <button
            onClick={() => onSearchModeChange('exact')}
            className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${searchMode === 'exact' ? 'bg-sky-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
          >
            IUPAC
          </button>
          <button
            onClick={() => onSearchModeChange('fuzzy')}
            className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${searchMode === 'fuzzy' ? 'bg-amber-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
          >
            Fuzzy
          </button>
        </div>
      </div>

      <div className="space-y-6 bg-slate-900/40 p-6 rounded-[2.5rem] border border-slate-800/50 shadow-2xl flex flex-col min-h-0">
        {/* Search input */}
        <div className="space-y-3">
          <div className="relative group">
            <input
              type="text"
              placeholder={searchMode === 'exact' ? 'Enter IUPAC sequence...' : 'Enter query sequence...'}
              className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-5 py-4 text-[12px] font-black text-slate-200 outline-none focus:border-sky-500 transition-all pr-20 shadow-inner group-hover:border-slate-700"
              value={searchQuery}
              onChange={e => onSearchQueryChange(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && onSearch()}
            />
            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-3">
              {searchQuery && (
                <button onClick={clearSearch} className="text-slate-600 hover:text-rose-500 transition-colors" title="Clear Search">
                  <i className="fas fa-times-circle text-sm"></i>
                </button>
              )}
              {isSearching ? (
                <i className="fas fa-circle-notch fa-spin text-sky-500 text-sm"></i>
              ) : (
                <button
                  onClick={onSearch}
                  className="w-8 h-8 rounded-xl bg-sky-500/10 flex items-center justify-center text-sky-500 hover:bg-sky-500 hover:text-white transition-all shadow-inner"
                >
                  <i className="fas fa-arrow-right text-[10px]"></i>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Fuzzy score threshold */}
        {searchMode === 'fuzzy' && (
          <div className="space-y-4 pt-2 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex justify-between items-center px-1">
              <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Min Match Confidence</label>
              <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-500 text-[10px] font-black">{searchOptions.minScore}%</span>
            </div>
            <input
              type="range" min="0" max="100" step="5"
              value={searchOptions.minScore}
              onChange={e => onSearchOptionsChange({ ...searchOptions, minScore: parseInt(e.target.value) })}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
            />
          </div>
        )}

        {/* Search options */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest px-1">Strand</label>
            <div className="relative">
              <select
                value={searchOptions.strand}
                onChange={e => onSearchOptionsChange({ ...searchOptions, strand: e.target.value as 'fwd' | 'rev' | 'both' })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-[10px] font-black text-slate-400 outline-none focus:border-sky-500 appearance-none cursor-pointer"
              >
                <option value="both">Both Strands</option>
                <option value="fwd">Forward Only</option>
                <option value="rev">Reverse Only</option>
              </select>
              <i className="fas fa-chevron-down absolute right-4 top-1/2 -translate-y-1/2 text-[8px] text-slate-600 pointer-events-none"></i>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest px-1">Result Limit</label>
            <input
              type="number"
              value={searchOptions.maxResults}
              onChange={e => onSearchOptionsChange({ ...searchOptions, maxResults: parseInt(e.target.value) })}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-[10px] font-black text-slate-400 outline-none focus:border-sky-500"
            />
          </div>
        </div>

        {/* Results list */}
        {filteredResults.length > 0 && (
          <div className="pt-6 border-t border-slate-800/50 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-6 px-1">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-black text-slate-200 uppercase tracking-widest">{filteredResults.length} Matches</span>
                  <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter ${searchMode === 'exact' ? 'bg-sky-500/10 text-sky-500' : 'bg-amber-500/10 text-amber-500'}`}>
                    {searchMode}
                  </span>
                </div>
                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tight">
                  Across {Object.keys(groupedSearchResults).length} Records
                </span>
              </div>
              <div className="flex gap-2">
                {selectedSearchIndices.size > 0 && (
                  <button
                    onClick={() => onSetSelectedIndices(new Set())}
                    className="text-[9px] font-black uppercase text-rose-500 hover:text-rose-400 transition-colors"
                  >
                    Clear
                  </button>
                )}
                {selectedSearchIndices.size > 1 && (
                  <button
                    onClick={onJoinSelectedMatches}
                    className="px-4 py-2 rounded-xl bg-sky-600 text-white text-[9px] font-black uppercase hover:bg-sky-500 transition-all shadow-xl shadow-sky-900/40"
                  >
                    Join Selected
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar-pro space-y-8 pr-2 max-h-[500px]">
              {Object.entries(groupedSearchResults).map(([recordId, group]) => (
                <div key={recordId} className="space-y-4">
                  <div className="flex items-center justify-between sticky top-0 bg-[#020617] z-10 py-2 border-b border-slate-800/50">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-sky-500 shadow-[0_0_8px_rgba(14,165,233,0.5)]"></div>
                      <span className="text-[10px] font-black text-slate-300 uppercase truncate max-w-[140px] tracking-tight">{recordId}</span>
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={() => onToggleRecordSelection(recordId, true)}
                        className="text-[8px] font-black text-slate-500 uppercase hover:text-sky-400 transition-colors"
                      >
                        Select All
                      </button>
                      <button
                        onClick={() => onJoinAllInRecord(recordId)}
                        className="text-[8px] font-black text-slate-500 uppercase hover:text-emerald-400 transition-colors"
                        title="Join all matches in this record"
                      >
                        Join All
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3 pl-1">
                    {group.results.map((match, localIdx) => {
                      const globalIdx = group.indices[localIdx];
                      const context = getSequenceContext(match.recordId, match.start, match.end);
                      const isActive = currentSearchIdx === globalIdx;
                      return (
                        <div
                          key={globalIdx}
                          onClick={() => {
                            onSetCurrentIdx(globalIdx);
                            onSetActiveTab('alignment');
                            onSetActiveSelection({ start: match.start, end: match.end, recordIds: [match.recordId] });
                          }}
                          className={`group relative bg-slate-950/60 rounded-2xl p-4 border transition-all cursor-pointer ${isActive ? 'border-sky-500 ring-2 ring-sky-500/20 bg-sky-500/5' : 'border-slate-800/50 hover:border-slate-700 hover:bg-slate-900/40'}`}
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
                                  className="w-4 h-4 rounded-lg border-slate-700 bg-slate-900 text-sky-600 focus:ring-sky-500 cursor-pointer"
                                />
                              </div>
                              <div className="flex flex-col">
                                <span className="text-[11px] font-black text-slate-200 tracking-tight">
                                  {match.start.toLocaleString()} <span className="text-slate-600 font-normal">→</span> {match.end.toLocaleString()}
                                </span>
                                <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Position</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {match.score && (
                                <div className="flex flex-col items-end">
                                  <span className="text-[10px] font-black text-amber-500">
                                    {maxScoreFound > 0 ? Math.round((match.score / maxScoreFound) * 100) : 0}%
                                  </span>
                                  <span className="text-[7px] font-black text-slate-600 uppercase tracking-tighter">Match</span>
                                </div>
                              )}
                              <div className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-tight ${match.strand === 1 ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'}`}>
                                {match.strand === 1 ? 'Forward' : 'Reverse'}
                              </div>
                            </div>
                          </div>

                          <div className="text-[11px] font-mono bg-black/60 p-3 rounded-xl border border-slate-800/50 overflow-hidden whitespace-nowrap text-ellipsis shadow-inner">
                            <span className="text-slate-600">{context.pre}</span>
                            <span className="text-sky-400 font-black bg-sky-400/20 px-1 rounded-sm shadow-[0_0_10px_rgba(56,189,248,0.2)]">{context.match}</span>
                            <span className="text-slate-600">{context.post}</span>
                          </div>

                          <div className="mt-3 flex justify-between items-center">
                            <div className="flex gap-2">
                              {isActive && (
                                <span className="text-[8px] font-black text-sky-500 uppercase flex items-center gap-1 animate-pulse">
                                  <i className="fas fa-eye"></i> Active
                                </span>
                              )}
                            </div>
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                onAnnotateMatch(match.recordId, match.start, match.end, `Match: ${match.sequence}`);
                              }}
                              className="opacity-0 group-hover:opacity-100 transition-all text-[9px] font-black uppercase text-sky-500 hover:text-sky-400 flex items-center gap-2 bg-sky-500/10 px-3 py-1.5 rounded-lg border border-sky-500/20"
                            >
                              <i className="fas fa-plus text-[8px]"></i> Annotate
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default SearchPanel;

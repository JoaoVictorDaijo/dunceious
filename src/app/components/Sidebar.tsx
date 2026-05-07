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

import React, { useState, useRef, useCallback } from 'react';
import { SeqRecord, SelectionArea, SearchResult } from '@/src/domain/bio/types';
import { getFeatureColor } from '@/services/bioUtils';
import { getOriginalPos } from '@/services/bioUtils';
import SearchPanel, { GroupedSearchResults } from './SearchPanel';

export interface SidebarProps {
  open: boolean;
  activeTab: 'alignment' | 'features';
  records: SeqRecord[];
  transposedRecords: SeqRecord[];
  activeSelection: SelectionArea | null;
  onSetActiveSelection: (sel: SelectionArea | null) => void;
  alignmentLength: number;
  onSetJumpTo: (pos: number) => void;
  featureColors: Record<string, string>;
  onSetFeatureColors: (colors: Record<string, string>) => void;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onAlignmentUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onAnnotationUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onProjectUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onExportSelection: () => void;
  onExportSelectionJson: () => void;
  onStartNewFeature: () => void;
  logs: string[];
  // Search panel props
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  searchMode: 'exact' | 'fuzzy';
  onSearchModeChange: (mode: 'exact' | 'fuzzy') => void;
  searchOptions: { minScore: number; strand: 'fwd' | 'rev' | 'both'; maxResults: number };
  onSearchOptionsChange: (opts: SidebarProps['searchOptions']) => void;
  isSearching: boolean;
  onSearch: () => void;
  filteredResults: SearchResult[];
  groupedSearchResults: GroupedSearchResults;
  currentSearchIdx: number;
  onSetCurrentIdx: (idx: number) => void;
  selectedSearchIndices: Set<number>;
  onSetSelectedIndices: (next: Set<number>) => void;
  maxScoreFound: number;
  onSetActiveTab: (tab: 'alignment' | 'features') => void;
  onToggleRecordSelection: (recordId: string, select: boolean) => void;
  onJoinAllInRecord: (recordId: string) => void;
  onJoinSelectedMatches: () => void;
  onAnnotateMatch: (recordId: string, start: number, end: number, name: string) => void;
  getSequenceContext: (recordId: string, start: number, end: number) => { pre: string; match: string; post: string };
  isProteinSession: boolean;
}

/**
 * Left sidebar containing selection inspector, record navigator, navigation,
 * feature-colour settings, ingestion controls, sequence search, and log terminal.
 */
const Sidebar: React.FC<SidebarProps> = ({
  open,
  activeTab,
  records,
  transposedRecords,
  activeSelection,
  onSetActiveSelection,
  alignmentLength,
  onSetJumpTo,
  featureColors,
  onSetFeatureColors,
  onFileUpload,
  onAlignmentUpload,
  onAnnotationUpload,
  onProjectUpload,
  onExportSelection,
  onExportSelectionJson,
  onStartNewFeature,
  logs,
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
  onSetActiveTab,
  onToggleRecordSelection,
  onJoinAllInRecord,
  onJoinSelectedMatches,
  onAnnotateMatch,
  getSequenceContext,
  isProteinSession,
}) => {
  const [width, setWidth] = useState(320);
  const sidebarRef = useRef<HTMLElement>(null);
  const widthRef = useRef(320);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = widthRef.current;
    if (sidebarRef.current) sidebarRef.current.style.transition = 'none';

    const onMouseMove = (ev: MouseEvent) => {
      const newWidth = Math.max(200, Math.min(560, startWidth + (ev.clientX - startX)));
      widthRef.current = newWidth;
      if (sidebarRef.current) sidebarRef.current.style.width = `${newWidth}px`;
    };

    const onMouseUp = () => {
      if (sidebarRef.current) sidebarRef.current.style.transition = '';
      setWidth(widthRef.current);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, []);

  return (
  <aside
    ref={sidebarRef}
    style={open ? { width } : { width: 0 }}
    className={`relative border-r border-slate-800/50 bg-[#020617] transition-all duration-300 flex flex-col shadow-inner overflow-hidden ${open ? 'p-5' : 'p-0 opacity-0 pointer-events-none'}`}
  >
    {open && (
      <div
        className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize z-20 group"
        onMouseDown={handleDragStart}
      >
        <div className="absolute inset-y-0 left-0 w-px bg-slate-700/60 group-hover:bg-sky-500/60 transition-colors" />
      </div>
    )}
    <div className="flex-1 overflow-y-auto custom-scrollbar-pro space-y-8 pr-1">

      {/* Selection Inspector */}
      {activeSelection && (
        <section className="animate-in slide-in-from-left-2 duration-300">
          <h3 className="text-[10px] font-black uppercase text-sky-500 tracking-widest mb-4 flex items-center justify-between">
            Selection Inspector <i className="fas fa-vector-square text-sky-600"></i>
          </h3>
          <div className="bg-sky-500/5 border border-sky-500/20 rounded-2xl p-4 space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-[9px] font-black text-slate-500 uppercase">Range</span>
              <span className="text-[10px] font-mono text-sky-400">
                {activeSelection.start.toLocaleString()} - {activeSelection.end.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[9px] font-black text-slate-500 uppercase">Length</span>
              <span className="text-[10px] font-mono text-sky-400">
                {Math.abs(activeSelection.end - activeSelection.start).toLocaleString()} bp
              </span>
            </div>

            <div className="pt-3 border-t border-sky-500/10 space-y-3">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[8px] font-black text-slate-500 uppercase">Manual Selection</span>
                <button onClick={() => onSetActiveSelection(null)} className="text-[7px] font-black text-rose-500 uppercase hover:text-rose-400">Clear</button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[7px] font-black text-slate-600 uppercase">Start</label>
                  <input
                    type="number"
                    value={activeSelection.start}
                    onChange={e => onSetActiveSelection({ ...activeSelection, start: parseInt(e.target.value) || 0 })}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[10px] font-mono text-sky-400 outline-none focus:border-sky-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[7px] font-black text-slate-600 uppercase">End</label>
                  <input
                    type="number"
                    value={activeSelection.end}
                    onChange={e => onSetActiveSelection({ ...activeSelection, end: parseInt(e.target.value) || 0 })}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[10px] font-mono text-sky-400 outline-none focus:border-sky-500"
                  />
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-sky-500/10 space-y-2">
              <span className="text-[8px] font-black text-slate-500 uppercase block mb-1">Original Coordinates</span>
              <div className="max-h-32 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar-pro">
                {transposedRecords.map(r => {
                  const s = getOriginalPos(r.alignedSequence || r.sequence, Math.min(activeSelection.start, activeSelection.end));
                  const e = getOriginalPos(r.alignedSequence || r.sequence, Math.max(activeSelection.start, activeSelection.end));
                  return (
                    <div key={r.id} className="flex justify-between items-center bg-black/20 px-2 py-1 rounded">
                      <span className="text-[8px] font-black text-slate-400 truncate max-w-[80px]">{r.id}</span>
                      <span className="text-[9px] font-mono text-slate-300">{s.toLocaleString()} - {e.toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-2">
              <button onClick={onExportSelection} className="py-2 rounded-lg bg-emerald-600/20 text-emerald-500 text-[8px] font-black uppercase hover:bg-emerald-600/30 transition-all" title="Export Selection as FASTA">
                <i className="fas fa-file-code mr-1"></i> FASTA
              </button>
              <button onClick={onExportSelectionJson} className="py-2 rounded-lg bg-indigo-600/20 text-indigo-500 text-[8px] font-black uppercase hover:bg-indigo-600/30 transition-all" title="Export Selection as JSON (Full Data)">
                <i className="fas fa-file-json mr-1"></i> JSON
              </button>
              <button onClick={onStartNewFeature} className="py-2 rounded-lg bg-sky-600/20 text-sky-500 text-[8px] font-black uppercase hover:bg-sky-600/30 transition-all" title="Create Annotation from Selection">
                <i className="fas fa-plus mr-1"></i> Annot
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Record Navigator */}
      {activeTab === 'alignment' && records.length > 0 && (
        <section className="animate-in slide-in-from-left-2 duration-300">
          <h3 className="text-[10px] font-black uppercase text-sky-500 tracking-widest mb-4 flex items-center justify-between">
            Record Navigator <i className="fas fa-list-ul text-[10px]"></i>
          </h3>
          <div className="bg-sky-500/5 border border-sky-500/20 rounded-2xl p-4 space-y-2 max-h-48 overflow-y-auto custom-scrollbar-pro">
            {records.map(r => (
              <button
                key={r.id}
                onClick={() => onSetActiveSelection({ start: 0, end: 0, recordIds: [r.id] })}
                className="w-full text-left px-3 py-2 rounded-xl bg-black/20 hover:bg-sky-500/20 border border-slate-800/50 hover:border-sky-500/50 transition-all group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-400 group-hover:text-sky-400 truncate max-w-[150px]">{r.id}</span>
                  <i className="fas fa-chevron-right text-[8px] text-slate-600 group-hover:text-sky-500"></i>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Navigation */}
      {activeTab === 'alignment' && records.length > 0 && (
        <section className="animate-in slide-in-from-left-2 duration-300">
          <h3 className="text-[10px] font-black uppercase text-emerald-500 tracking-widest mb-4 flex items-center justify-between">
            Navigation <i className="fas fa-compass text-[10px]"></i>
          </h3>
          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-4 space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => onSetJumpTo(0)} className="py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-[8px] font-black uppercase text-slate-400 transition-all flex items-center justify-center gap-2">
                <i className="fas fa-step-backward"></i> Start
              </button>
              <button onClick={() => onSetJumpTo(alignmentLength)} className="py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-[8px] font-black uppercase text-slate-400 transition-all flex items-center justify-center gap-2">
                End <i className="fas fa-step-forward"></i>
              </button>
            </div>
            <div className="space-y-2">
              <label className="text-[8px] font-black text-slate-500 uppercase">Go to Position (bp)</label>
              <div className="relative">
                <input
                  type="number"
                  placeholder="e.g. 5000"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-[11px] font-mono text-emerald-400 outline-none focus:border-emerald-500"
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      const val = parseInt((e.target as HTMLInputElement).value);
                      if (!isNaN(val)) onSetJumpTo(val);
                      (e.target as HTMLInputElement).value = '';
                    }
                  }}
                />
              </div>
            </div>
            <div className="pt-2 border-t border-emerald-500/10">
              <span className="text-[7px] font-black text-slate-600 uppercase block mb-2">Shortcuts</span>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[8px] font-bold text-slate-500 uppercase">
                <div className="flex justify-between"><span>Zoom</span> <span className="text-emerald-500">+ / -</span></div>
                <div className="flex justify-between"><span>Pan</span> <span className="text-emerald-500">Arrows</span></div>
                <div className="flex justify-between"><span>Fit</span> <span className="text-emerald-500">F</span></div>
                <div className="flex justify-between"><span>Center</span> <span className="text-emerald-500">C</span></div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Feature colours */}
      {activeTab === 'features' && (
        <section className="animate-in slide-in-from-left-2 duration-300">
          <h3 className="text-[10px] font-black uppercase text-amber-500 tracking-widest mb-4 flex items-center justify-between">
            Feature Colors <i className="fas fa-palette text-[10px]"></i>
          </h3>
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4 space-y-3">
            <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto pr-2 custom-scrollbar-pro">
              {['gene', 'CDS', 'mRNA', 'tRNA', 'rRNA', 'exon', 'intron', 'promoter', 'regulatory', 'misc_feature', 'primer', 'origin'].map(type => (
                <div key={type} className="flex items-center justify-between bg-black/20 p-2 rounded-lg border border-slate-800/50 group">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">{type}</span>
                  <input
                    type="color"
                    value={featureColors[type] || getFeatureColor(type)}
                    onChange={e => onSetFeatureColors({ ...featureColors, [type]: e.target.value })}
                    className="w-6 h-6 rounded border-none bg-transparent cursor-pointer"
                  />
                </div>
              ))}
            </div>
            <button
              onClick={() => onSetFeatureColors({})}
              className="w-full py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-[8px] font-black uppercase text-slate-400 transition-all mt-2"
            >
              Reset to Defaults
            </button>
          </div>
        </section>
      )}

      {/* Ingestion */}
      <section>
        <h3 className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-4 flex items-center justify-between">
          Ingestion <i className="fas fa-plus-circle text-sky-600"></i>
        </h3>
        <div className="bg-slate-900/40 rounded-3xl p-8 border-2 border-slate-800 border-dashed hover:border-sky-500/50 transition-all relative cursor-pointer text-center group mb-4">
          <input type="file" multiple accept=".gb,.genbank,.fasta,.fa" className="absolute inset-0 opacity-0 cursor-pointer" onChange={onFileUpload} />
          <i className="fas fa-folder-tree text-slate-700 group-hover:text-sky-500 mb-4 block text-4xl transition-colors"></i>
          <p className="text-[10px] font-black text-slate-500 uppercase group-hover:text-slate-300 tracking-tight">Drop Input Batch</p>
          <p className="text-[7px] font-medium text-slate-600 group-hover:text-slate-500 mt-1">(GenBank, FASTA)</p>
        </div>

        <div className={`bg-slate-900/40 rounded-3xl p-6 border-2 border-slate-800 border-dashed hover:border-emerald-500/50 transition-all relative cursor-pointer text-center group ${records.length === 0 ? 'opacity-30 pointer-events-none' : ''}`}>
          <input type="file" accept=".fasta,.fa" className="absolute inset-0 opacity-0 cursor-pointer" onChange={onAlignmentUpload} />
          <i className="fas fa-file-import text-slate-700 group-hover:text-emerald-500 mb-3 block text-3xl transition-colors"></i>
          <p className="text-[9px] font-black text-slate-500 uppercase group-hover:text-slate-300 tracking-tight">Upload Pre-aligned FASTA</p>
          <p className="text-[7px] font-bold text-slate-600 uppercase mt-1">IDs must match active records</p>
        </div>

        <div className={`bg-slate-900/40 rounded-3xl p-6 border-2 border-slate-800 border-dashed hover:border-sky-500/50 transition-all relative cursor-pointer text-center group mt-4 ${records.length === 0 ? 'opacity-30 pointer-events-none' : ''}`}>
          <input type="file" multiple accept=".bed,.gff,.gff3,.bedgraph" className="absolute inset-0 opacity-0 cursor-pointer" onChange={onAnnotationUpload} />
          <i className="fas fa-tags text-slate-700 group-hover:text-sky-500 mb-3 block text-3xl transition-colors"></i>
          <p className="text-[9px] font-black text-slate-500 uppercase group-hover:text-slate-300 tracking-tight">Import Annotations</p>
          <p className="text-[7px] font-bold text-slate-600 uppercase mt-1">BED, GFF3, or BedGraph</p>
        </div>

        <div className="bg-slate-900/40 rounded-3xl p-6 border-2 border-slate-800 border-dashed hover:border-amber-500/50 transition-all relative cursor-pointer text-center group mt-4">
          <input type="file" accept=".json" className="absolute inset-0 opacity-0 cursor-pointer" onChange={onProjectUpload} />
          <i className="fas fa-project-diagram text-slate-700 group-hover:text-amber-500 mb-3 block text-3xl transition-colors"></i>
          <p className="text-[9px] font-black text-slate-500 uppercase group-hover:text-slate-300 tracking-tight">Load Project JSON</p>
          <p className="text-[7px] font-bold text-slate-600 uppercase mt-1">Restore entire workspace</p>
        </div>
      </section>

      {/* Search panel */}
      <SearchPanel
        searchQuery={searchQuery}
        onSearchQueryChange={onSearchQueryChange}
        searchMode={searchMode}
        onSearchModeChange={onSearchModeChange}
        searchOptions={searchOptions}
        onSearchOptionsChange={onSearchOptionsChange}
        isSearching={isSearching}
        onSearch={onSearch}
        filteredResults={filteredResults}
        groupedSearchResults={groupedSearchResults}
        currentSearchIdx={currentSearchIdx}
        onSetCurrentIdx={onSetCurrentIdx}
        selectedSearchIndices={selectedSearchIndices}
        onSetSelectedIndices={onSetSelectedIndices}
        maxScoreFound={maxScoreFound}
        records={records}
        onSetActiveSelection={onSetActiveSelection}
        onSetActiveTab={onSetActiveTab}
        onToggleRecordSelection={onToggleRecordSelection}
        onJoinAllInRecord={onJoinAllInRecord}
        onJoinSelectedMatches={onJoinSelectedMatches}
        onAnnotateMatch={onAnnotateMatch}
        getSequenceContext={getSequenceContext}
        isProteinSession={isProteinSession}
      />

      {/* Log terminal */}
      <section className="h-48 flex flex-col shrink-0">
        <h3 className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-3 flex items-center justify-between">
          Log Terminal <i className="fas fa-terminal text-[8px]"></i>
        </h3>
        <div className="select-text flex-1 bg-black/60 rounded-2xl p-5 font-mono text-[9px] text-slate-500 overflow-y-auto border border-slate-800 shadow-inner">
          {logs.map((log, i) => (
            <div key={i} className="mb-2 pb-2 border-b border-slate-900/50 flex gap-3">
              <span className="text-emerald-500 font-black">#</span>
              <span className="flex-1">{log}</span>
            </div>
          ))}
        </div>
      </section>

    </div>
  </aside>
  );
};

export default Sidebar;

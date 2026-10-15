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

import { ALIGNMENT_LOCK_TIP, type RemoteAlignmentState } from '@/src/app/logic/remoteAlignment';
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { SeqRecord, SelectionArea, SearchResult } from '@/src/domain/bio/types';
import { getOriginalPos } from '@/src/domain/bio';
import HubIndex from './hub/HubIndex';
import type { useHubState } from '@/src/app/hooks/useHubState';
import SearchPanel, { GroupedSearchResults } from './SearchPanel';
import SectionTitle from './SectionTitle';
import WorkspaceTitleActions from './WorkspaceTitleActions';
import AlignmentSection from './AlignmentSection';
import DropZone from './DropZone';
import { useFileDragActive } from '@/src/app/hooks/useFileDragActive';

export interface SidebarProps {
  featureColors?: Record<string, string>;
  hubState?: ReturnType<typeof useHubState>;
  onToggleRecordVisibility?: (id: string) => void;
  open: boolean;
  activeTab: 'alignment' | 'features';
  records: SeqRecord[];
  transposedRecords: SeqRecord[];
  activeSelection: SelectionArea | null;
  onSetActiveSelection: (sel: SelectionArea | null) => void;
  alignmentLength: number;
  onSetJumpTo: (pos: number) => void;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onAlignmentUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onAlignRemote?: () => void;
  isAlignmentLocked?: boolean;
  remoteAlignmentState?: RemoteAlignmentState;
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
  onClearSearch: () => void;
  onSelectSearchResult: (selection: SelectionArea) => void;
  filteredResults: SearchResult[];
  groupedSearchResults: GroupedSearchResults;
  currentSearchIdx: number;
  onSetCurrentIdx: (idx: number) => void;
  selectedSearchIndices: Set<number>;
  onSetSelectedIndices: (next: Set<number>) => void;
  maxScoreFound: number;
  onSetActiveTab: (tab: 'alignment' | 'features') => void;
  onRemoveRecord: (recordId: string) => void;
  onToggleRecordSelection: (recordId: string, select: boolean) => void;
  onJoinAllInRecord: (recordId: string) => void;
  onJoinSelectedMatches: () => void;
  onAnnotateMatch: (recordId: string, start: number, end: number, name: string, segments?: { start: number; end: number }[], strand?: 1 | -1) => void;
  getSequenceContext: (recordId: string, start: number, end: number) => { pre: string; match: string; post: string };
  isProteinSession: boolean;
}

/**
 * Left sidebar containing selection inspector, record navigator, navigation,
 * ingestion controls, sequence search, and log terminal.
 */
const Sidebar: React.FC<SidebarProps> = ({
  open,
  hubState,
  featureColors,
  onToggleRecordVisibility,
  activeTab,
  records,
  transposedRecords,
  activeSelection,
  onSetActiveSelection,
  alignmentLength,
  onSetJumpTo,
  onFileUpload,
  onAlignmentUpload,
  onAlignRemote,
  isAlignmentLocked,
  remoteAlignmentState,
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
  onClearSearch,
  onSelectSearchResult,
  filteredResults,
  groupedSearchResults,
  currentSearchIdx,
  onSetCurrentIdx,
  selectedSearchIndices,
  onSetSelectedIndices,
  maxScoreFound,
  onSetActiveTab,
  onRemoveRecord,
  onToggleRecordSelection,
  onJoinAllInRecord,
  onJoinSelectedMatches,
  onAnnotateMatch,
  getSequenceContext,
  isProteinSession,
}) => {
  const fileDragActive = useFileDragActive();
  const [width, setWidth] = useState(320);
  const sidebarRef = useRef<HTMLElement>(null);
  const widthRef = useRef(320);
  const dragCleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => { dragCleanup.current?.(); }, []);
  const addSequencesInput = useRef<HTMLInputElement>(null);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragCleanup.current?.();
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
      dragCleanup.current?.();
    };

    dragCleanup.current = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      dragCleanup.current = null;
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, []);

  const logOutput = <div className="select-text flex-1 bg-black/60 rounded-2xl p-5 font-mono text-[11px] text-slate-400 overflow-y-auto custom-scrollbar-pro border border-slate-800 shadow-inner">
    {logs.map((log, i) => <div key={i} className="mb-2 pb-2 border-b border-slate-900/50 flex gap-3">
      <span className="text-emerald-500 font-bold">#</span><span className="flex-1">{log}</span>
    </div>)}
  </div>;

  return (
  <aside
    ref={sidebarRef}
    style={open ? { width } : { width: 0 }}
    className={`relative border-r border-slate-800/50 bg-slate-950 transition-all duration-300 flex flex-col shadow-inner overflow-hidden ${open ? 'p-5' : 'p-0 opacity-0 pointer-events-none'}`}
  >
    {open && (
      <div
        className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize z-20 group"
        onMouseDown={handleDragStart}
      >
        <div className="absolute inset-y-0 left-0 w-px bg-slate-700/60 group-hover:bg-env/60 transition-colors" />
      </div>
    )}
    <div className={activeTab === 'features' ? 'flex min-h-0 flex-1 flex-col gap-3 pr-1' : 'flex-1 overflow-y-auto custom-scrollbar-pro space-y-8 pr-1'}>

      <input ref={addSequencesInput} aria-label="Add sequences files" hidden disabled={isAlignmentLocked} type="file" accept=".gb,.genbank,.fasta,.fa" multiple onChange={onFileUpload} />
      {activeTab === 'features' && hubState && <><HubIndex records={records} featureColors={featureColors} state={hubState} addLocked={isAlignmentLocked} onAddSequences={() => { if (!isAlignmentLocked) addSequencesInput.current?.click(); }} /></>}
      {activeTab === 'alignment' && <>
      {/* Selection Inspector */}
      {activeSelection && (
        <section className="animate-in slide-in-from-left-2 duration-300">
          <SectionTitle icon="fa-vector-square">Selection Inspector</SectionTitle>
          <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-[11px] font-semibold text-slate-400">Range</span>
              <span className="text-[11px] font-mono text-sky-400">
                {activeSelection.start.toLocaleString()} - {activeSelection.end.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[11px] font-semibold text-slate-400">Length</span>
              <span className="text-[11px] font-mono text-sky-400">
                {Math.abs(activeSelection.end - activeSelection.start).toLocaleString()} {isProteinSession ? 'aa' : 'bp'}
              </span>
            </div>

            <div className="pt-3 border-t border-slate-800 space-y-3">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[11px] font-semibold text-slate-400">Manual selection</span>
                <button onClick={() => onSetActiveSelection(null)} data-tip="Clear the current selection" className="text-[11px] font-semibold text-rose-400 hover:text-rose-300 transition-colors">Clear</button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-400">Start</label>
                  <input
                    type="number"
                    value={activeSelection.start}
                    onChange={e => onSetActiveSelection({ ...activeSelection, start: parseInt(e.target.value) || 0 })}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[11px] font-mono text-sky-400 outline-none focus:border-env"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-400">End</label>
                  <input
                    type="number"
                    value={activeSelection.end}
                    onChange={e => onSetActiveSelection({ ...activeSelection, end: parseInt(e.target.value) || 0 })}
                    className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[11px] font-mono text-sky-400 outline-none focus:border-env"
                  />
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800 space-y-2">
              <span className="text-[11px] font-semibold text-slate-400 block mb-1">Original coordinates</span>
              <div className="max-h-32 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar-pro">
                {transposedRecords.map(r => {
                  const s = getOriginalPos(r.alignedSequence || r.sequence, Math.min(activeSelection.start, activeSelection.end));
                  const e = getOriginalPos(r.alignedSequence || r.sequence, Math.max(activeSelection.start, activeSelection.end));
                  return (
                    <div key={r.id} className="flex justify-between items-center bg-black/20 px-2 py-1 rounded">
                      <span className="text-[11px] font-semibold text-slate-400 truncate max-w-[96px]">{r.id}</span>
                      <span className="text-[11px] font-mono text-slate-300">{s.toLocaleString()} - {e.toLocaleString()}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-2">
              <button onClick={onExportSelection} className="py-2 rounded-lg bg-emerald-600/20 text-emerald-400 text-[11px] font-semibold hover:bg-emerald-600/30 transition-all" data-tip="Download the selected region of every visible record as FASTA">
                <i className="fas fa-file-code mr-1"></i> FASTA
              </button>
              <button onClick={onExportSelectionJson} className="py-2 rounded-lg bg-indigo-600/20 text-indigo-400 text-[11px] font-semibold hover:bg-indigo-600/30 transition-all" data-tip="Download the selection with its annotations as JSON">
                <i className="fas fa-file-json mr-1"></i> JSON
              </button>
              <button onClick={onStartNewFeature} className="py-2 rounded-lg bg-env/15 text-env text-[11px] font-semibold hover:bg-env/25 transition-all" data-tip="Create a new annotation spanning the selection">
                <i className="fas fa-plus mr-1"></i> Annot
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Record Navigator */}
      {activeTab === 'alignment' && records.length > 0 && (
        <section className="animate-in slide-in-from-left-2 duration-300 [container-type:inline-size]">
          <SectionTitle icon="fa-list-ul" trailing={<WorkspaceTitleActions onAddSequences={() => { if (!isAlignmentLocked) addSequencesInput.current?.click(); }} addLocked={isAlignmentLocked} />}>Record Navigator</SectionTitle>
          <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 space-y-2 max-h-48 overflow-y-auto custom-scrollbar-pro">
            {records.map(r => (
              <div
                key={r.id}
                data-navigator-record={r.id}
                data-state={r.visible === false ? 'hidden' : 'visible'}
                className={`w-full px-2 py-2 rounded-xl bg-black/20 border border-slate-800/50 hover:border-env/50 transition-all motion-reduce:transition-none group ${r.visible === false ? 'opacity-60' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <button aria-label={`${r.visible === false ? 'Show' : 'Hide'} ${r.id} in viewport`} data-tip={r.visible === false ? 'Show in viewport' : 'Hide in viewport'} onClick={() => onToggleRecordVisibility?.(r.id)} className="h-7 w-7 shrink-0 rounded-lg text-slate-400 hover:bg-env/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-env"><i aria-hidden="true" className={`fas ${r.visible === false ? 'fa-eye-slash' : 'fa-eye'}`} /></button>
                  <button
                    onClick={() => onSetActiveSelection({ start: 0, end: 0, recordIds: [r.id] })}
                    data-tip={r.name && r.name !== r.id ? `${r.name}: select this record` : 'Select this record'}
                    className="flex-1 min-w-0 text-left px-2 py-1 rounded-lg hover:bg-env/15 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-slate-300 group-hover:text-env truncate max-w-[150px]">{r.id}</span>
                      <i className="fas fa-chevron-right text-[8px] text-slate-500 group-hover:text-env"></i>
                    </div>
                  </button>
                  <button
                    disabled={isAlignmentLocked}
                    onClick={() => {
                      if (isAlignmentLocked) return;
                      if (window.confirm(`Remove sequence "${r.name || r.id}" from project?`)) {
                        onRemoveRecord(r.id);
                      }
                    }}
                    className="disabled:opacity-30 disabled:cursor-not-allowed w-7 h-7 shrink-0 rounded-lg text-slate-500 group-hover:text-rose-400/80 hover:bg-rose-500/15 hover:text-rose-400 focus-visible:text-rose-400 transition-colors"
                    aria-label={`Remove ${r.id}`}
                    data-tip={isAlignmentLocked ? ALIGNMENT_LOCK_TIP : "Remove this sequence from the project"}
                  >
                    <i className="fas fa-trash-alt text-[10px]"></i>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Navigation */}
      {activeTab === 'alignment' && records.length > 0 && (
        <section className="animate-in slide-in-from-left-2 duration-300">
          <SectionTitle icon="fa-compass">Navigation</SectionTitle>
          <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4 space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => onSetJumpTo(0)} data-tip="Jump to the first base" className="py-2 rounded-lg bg-slate-800 hover:bg-slate-700 hover:text-slate-200 text-[11px] font-semibold text-slate-400 transition-all flex items-center justify-center gap-2">
                <i className="fas fa-step-backward"></i> Start
              </button>
              <button onClick={() => onSetJumpTo(alignmentLength)} data-tip="Jump to the last base" className="py-2 rounded-lg bg-slate-800 hover:bg-slate-700 hover:text-slate-200 text-[11px] font-semibold text-slate-400 transition-all flex items-center justify-center gap-2">
                End <i className="fas fa-step-forward"></i>
              </button>
            </div>
            <div className="space-y-2">
              <label htmlFor="sidebar-goto-position" className="text-[11px] font-semibold text-slate-400">Go to position</label>
              <div className="relative">
                <input
                  id="sidebar-goto-position"
                  type="number"
                  placeholder="e.g. 5000"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-4 pr-10 py-2.5 text-[11px] font-mono text-slate-200 outline-none hover:border-slate-700 focus:border-[color:var(--env)] transition-colors"
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      const val = parseInt((e.target as HTMLInputElement).value);
                      if (!isNaN(val)) onSetJumpTo(val);
                      (e.target as HTMLInputElement).value = '';
                    }
                  }}
                />
                <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[11px] text-slate-500" aria-hidden="true">{isProteinSession ? 'aa' : 'bp'}</span>
              </div>
            </div>
            <div className="pt-2 border-t border-slate-800">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">Shortcuts</span>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] font-medium text-slate-400">
                <div className="flex justify-between"><span>Zoom</span> <span className="font-mono text-slate-300">+ / -</span></div>
                <div className="flex justify-between"><span>Pan</span> <span className="font-mono text-slate-300">Arrows</span></div>
                <div className="flex justify-between"><span>Fit</span> <span className="font-mono text-slate-300">F</span></div>
                <div className="flex justify-between"><span>Center</span> <span className="font-mono text-slate-300">C</span></div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Ingestion */}
      <section data-ingestion-section>
        <SectionTitle icon="fa-plus-circle">Ingestion</SectionTitle>
        <DropZone accent="sky" icon="fa-folder-tree" title="Drop input batch" hint="GB or FASTA" primary className="mb-4"
          accept=".gb,.genbank,.fasta,.fa" multiple onChange={onFileUpload} armed={fileDragActive} disabled={isAlignmentLocked}
          tip={isAlignmentLocked ? ALIGNMENT_LOCK_TIP : "Open GenBank (.gb) or FASTA files, or drop them here"} />

        <DropZone accent="emerald" icon="fa-file-import" title="Upload pre-aligned FASTA" hint="IDs must match active records"
          accept=".fasta,.fa" onChange={onAlignmentUpload} armed={fileDragActive} disabled={isAlignmentLocked} unavailable={records.length === 0}
          tip={isAlignmentLocked ? ALIGNMENT_LOCK_TIP : "Overlay an alignment: a FASTA whose IDs match the loaded records"} />

        <DropZone accent="sky" icon="fa-tags" title="Import annotations" hint="BED, GFF3, or BedGraph" className="mt-4"
          accept=".bed,.gff,.gff3,.bedgraph" multiple onChange={onAnnotationUpload} armed={fileDragActive} unavailable={records.length === 0}
          tip="Add annotations or data tracks from BED, GFF3 or BedGraph files" />

        <DropZone accent="amber" icon="fa-project-diagram" title="Load project JSON" hint="Restore entire workspace" className="mt-4"
          accept=".json" onChange={onProjectUpload} armed={fileDragActive} disabled={isAlignmentLocked}
          tip={isAlignmentLocked ? ALIGNMENT_LOCK_TIP : "Restore a workspace saved with Save Project"} />
      </section>

      <AlignmentSection count={records.length} state={remoteAlignmentState} onOpen={onAlignRemote} />

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
        onClearSearch={onClearSearch}
        filteredResults={filteredResults}
        groupedSearchResults={groupedSearchResults}
        currentSearchIdx={currentSearchIdx}
        onSetCurrentIdx={onSetCurrentIdx}
        selectedSearchIndices={selectedSearchIndices}
        onSetSelectedIndices={onSetSelectedIndices}
        maxScoreFound={maxScoreFound}
        records={records}
        onSetActiveSelection={onSelectSearchResult}
        onSetActiveTab={onSetActiveTab}
        onToggleRecordSelection={onToggleRecordSelection}
        onJoinAllInRecord={onJoinAllInRecord}
        onJoinSelectedMatches={onJoinSelectedMatches}
        onAnnotateMatch={onAnnotateMatch}
        getSequenceContext={getSequenceContext}
        isProteinSession={isProteinSession}
      />

      </>}
      {activeTab === 'features' && hubState && <button data-hub-focus aria-haspopup="dialog" onClick={() => hubState.setShortcutsOpen(true)} className="flex shrink-0 items-center gap-2 border-t border-slate-800 pt-3 text-left text-xs text-slate-400 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500"><i className="fas fa-keyboard" aria-hidden="true" />Keyboard shortcuts<kbd className="ml-auto rounded border border-slate-800 px-1 font-mono text-[10px]">?</kbd></button>}
      {/* One disclosure for both workspaces, so its open state carries across tab switches. */}
      <details data-log-terminal className="group shrink-0 border-t border-slate-800 pt-3 text-xs text-slate-400">
        <summary aria-label="Log Terminal" className="cursor-pointer list-none rounded focus-visible:ring-2 focus-visible:ring-env [&::-webkit-details-marker]:hidden"><SectionTitle icon="fa-terminal" trailing={<i aria-hidden="true" className="fas fa-chevron-up text-[10px] text-slate-500 transition-transform group-open:rotate-180 motion-reduce:transition-none" />}>Log Terminal</SectionTitle></summary>
        <div className="flex h-48 flex-col">{logOutput}</div>
      </details>

    </div>
  </aside>
  );
};

export default Sidebar;

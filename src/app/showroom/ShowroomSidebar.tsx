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

import type { MouseEvent } from 'react';
import AlignmentSection from '@/src/app/components/AlignmentSection';
import SearchPanel from '@/src/app/components/SearchPanel';
import SectionTitle from '@/src/app/components/SectionTitle';
import type { RemoteAlignmentState } from '@/src/app/logic/remoteAlignment';
import type { SeqRecord } from '@/src/domain/bio/types';
import type { ExplainId } from './explanations';
import type { ShowroomWorkspace } from './useShowroomWorkspace';

type Explain = (id: ExplainId, anchor?: DOMRect) => void;

const rectOf = (event: MouseEvent<HTMLElement>) => event.currentTarget.getBoundingClientRect();

/* Classes, labels and order follow components/Sidebar.tsx and DropZone.tsx. */

function RecordNavigator({ workspace, onExplain }: { workspace: ShowroomWorkspace; onExplain: Explain }) {
  const add = <button type="button" aria-label="Add sequences…" onClick={event => onExplain('ingest-sequences', rectOf(event))}
    className="ml-1 inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md border border-slate-800 text-slate-300 hover:border-env hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-env">
    <i aria-hidden="true" className="fas fa-plus text-[10px]" />
  </button>;
  return (
    <section>
      <SectionTitle icon="fa-list-ul" trailing={add}>Record Navigator</SectionTitle>
      <div className="custom-scrollbar-pro max-h-48 space-y-2 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900/40 p-3">
        {workspace.records.map(record => <NavigatorRow key={record.id} record={record} workspace={workspace} onExplain={onExplain} />)}
      </div>
    </section>
  );
}

function NavigatorRow({ record, workspace, onExplain }: { record: SeqRecord; workspace: ShowroomWorkspace; onExplain: Explain }) {
  const hidden = record.visible === false;
  return (
    <div data-navigator-record={record.id} data-state={hidden ? 'hidden' : 'visible'}
      className={`group w-full rounded-xl border border-slate-800/50 bg-black/20 px-2 py-1.5 hover:border-env/50 ${hidden ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-2">
        <button type="button" aria-label={`${hidden ? 'Show' : 'Hide'} ${record.id} in viewport`} onClick={() => workspace.setRecordVisible(record.id, hidden)}
          className="h-7 w-7 shrink-0 rounded-lg text-slate-400 hover:bg-env/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-env">
          <i aria-hidden="true" className={`fas ${hidden ? 'fa-eye-slash' : 'fa-eye'}`} />
        </button>
        <button type="button" onClick={() => workspace.setActiveSelection({ start: 0, end: 0, recordIds: [record.id] })}
          className="min-w-0 flex-1 rounded-lg px-2 py-1 text-left hover:bg-env/15">
          <span className="flex items-center justify-between">
            <span className="max-w-[150px] truncate text-[11px] font-semibold text-slate-300 group-hover:text-env">{record.id}</span>
            <i aria-hidden="true" className="fas fa-chevron-right text-[8px] text-slate-500 group-hover:text-env" />
          </span>
        </button>
        <button type="button" aria-label={`Remove ${record.id}`} onClick={event => onExplain('remove-record', rectOf(event))}
          className="h-7 w-7 shrink-0 rounded-lg text-slate-500 hover:bg-rose-500/15 hover:text-rose-400 focus-visible:text-rose-400 group-hover:text-rose-400/80">
          <i aria-hidden="true" className="fas fa-trash-alt text-[10px]" />
        </button>
      </div>
    </div>
  );
}

function Navigation({ alignmentLength, onJump }: { alignmentLength: number; onJump: (position: number) => void }) {
  const jumpButton = 'flex items-center justify-center gap-2 rounded-lg bg-slate-800 py-2 text-[11px] font-semibold text-slate-400 hover:bg-slate-700 hover:text-slate-200';
  return (
    <section>
      <SectionTitle icon="fa-compass">Navigation</SectionTitle>
      <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => onJump(0)} className={jumpButton}><i aria-hidden="true" className="fas fa-step-backward" /> Start</button>
          <button type="button" onClick={() => onJump(alignmentLength)} className={jumpButton}>End <i aria-hidden="true" className="fas fa-step-forward" /></button>
        </div>
        <div className="space-y-2">
          <label htmlFor="showroom-goto-position" className="text-[11px] font-semibold text-slate-400">Go to position</label>
          <div className="relative">
            <input id="showroom-goto-position" type="number" inputMode="numeric" placeholder="e.g. 5000"
              className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2.5 pl-4 pr-10 font-mono text-[11px] text-slate-200 outline-none hover:border-slate-700 focus:border-[color:var(--env)]"
              onKeyDown={event => {
                if (event.key !== 'Enter') return;
                const value = parseInt(event.currentTarget.value);
                if (!isNaN(value)) onJump(value);
                event.currentTarget.value = '';
              }} />
            <span aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[11px] text-slate-500">bp</span>
          </div>
        </div>
        <div className="border-t border-slate-800 pt-2">
          <span className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Shortcuts</span>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] font-medium text-slate-400">
            <div className="flex justify-between"><span>Zoom</span> <span className="font-mono text-slate-300">+ / -</span></div>
            <div className="flex justify-between"><span>Pan</span> <span className="font-mono text-slate-300">Arrows</span></div>
            <div className="flex justify-between"><span>Fit</span> <span className="font-mono text-slate-300">F</span></div>
            <div className="flex justify-between"><span>Center</span> <span className="font-mono text-slate-300">C</span></div>
          </div>
        </div>
      </div>
    </section>
  );
}

const CARDS = [
  { id: 'ingest-sequences', icon: 'fa-folder-tree', title: 'Drop input batch', hint: 'GB or FASTA', hover: 'hover:border-sky-500/50', iconHover: 'group-hover:text-sky-500', primary: true },
  { id: 'ingest-alignment', icon: 'fa-file-import', title: 'Upload pre-aligned FASTA', hint: 'IDs must match active records', hover: 'hover:border-emerald-500/50', iconHover: 'group-hover:text-emerald-500' },
  { id: 'ingest-annotations', icon: 'fa-tags', title: 'Import annotations', hint: 'BED, GFF3, or BedGraph', hover: 'hover:border-sky-500/50', iconHover: 'group-hover:text-sky-500' },
  { id: 'ingest-project', icon: 'fa-project-diagram', title: 'Load project JSON', hint: 'Restore entire workspace', hover: 'hover:border-amber-500/50', iconHover: 'group-hover:text-amber-500' },
] as const;

function Ingestion({ onExplain }: { onExplain: Explain }) {
  return (
    <section>
      <SectionTitle icon="fa-plus-circle">Ingestion</SectionTitle>
      <div className="space-y-3">
        {CARDS.map(card => (
          <button key={card.id} type="button" onClick={event => onExplain(card.id, rectOf(event))}
            className={`group block w-full rounded-3xl border-2 border-dashed border-slate-800 bg-slate-900/40 text-center ${'primary' in card ? 'p-6' : 'p-4'} ${card.hover}`}>
            <i aria-hidden="true" className={`fas ${card.icon} block text-slate-700 ${card.iconHover} ${'primary' in card ? 'mb-3 text-3xl' : 'mb-2 text-2xl'}`} />
            <span className="block text-[11px] font-semibold text-slate-400 group-hover:text-slate-300">{card.title}</span>
            <span className="mt-1 block text-[11px] font-medium text-slate-500">{card.hint}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/** The real `SearchPanel` over the in-page search; annotating and joining matches explain. */
function Search({ workspace, onExplain }: { workspace: ShowroomWorkspace; onExplain: Explain }) {
  const { search } = workspace;
  return (
    <SearchPanel
      searchQuery={search.query}
      onSearchQueryChange={search.setQuery}
      searchMode={search.mode}
      onSearchModeChange={search.setMode}
      searchOptions={search.options}
      onSearchOptionsChange={search.setOptions}
      isSearching={false}
      onSearch={search.run}
      onClearSearch={search.clear}
      searchResults={search.results}
      groupedSearchResults={search.grouped}
      currentSearchIdx={search.currentIdx}
      onSetCurrentIdx={search.setCurrentIdx}
      selectedSearchIndices={search.selected}
      onSetSelectedIndices={search.setSelected}
      records={workspace.records}
      onSetActiveSelection={search.select}
      onSetActiveTab={() => {}}
      onToggleRecordSelection={search.toggleRecord}
      onJoinAllInRecord={() => onExplain('join-hits')}
      onJoinSelectedMatches={() => onExplain('join-hits')}
      onAnnotateMatch={() => onExplain('annotate-hit')}
      getSequenceContext={search.context}
      isProteinSession={false}
    />
  );
}

interface ShowroomSidebarProps {
  open: boolean;
  onClose: () => void;
  workspace: ShowroomWorkspace;
  alignmentLength: number;
  alignmentState: RemoteAlignmentState;
  onOpenAlignment: () => void;
  onExplain: Explain;
}

/** The workbench sidebar as a drawer over the viewer, closed by default. */
export function ShowroomSidebar({ open, onClose, workspace, alignmentLength, alignmentState, onOpenAlignment, onExplain }: ShowroomSidebarProps) {
  return <>
    {open && <div aria-hidden="true" onClick={onClose} className="absolute inset-0 z-30 bg-slate-950/50" />}
    <aside aria-label="Sidebar" hidden={!open}
      className="custom-scrollbar-pro absolute inset-y-0 left-0 z-40 w-[320px] max-w-[85%] overflow-y-auto border-r border-slate-800/50 bg-slate-950 p-4 shadow-2xl">
      <div className="space-y-7">
        <RecordNavigator workspace={workspace} onExplain={onExplain} />
        <Navigation alignmentLength={alignmentLength} onJump={workspace.setJumpTo} />
        <Ingestion onExplain={onExplain} />
        <AlignmentSection count={workspace.records.length} state={alignmentState} onOpen={onOpenAlignment} />
        <Search workspace={workspace} onExplain={onExplain} />
      </div>
    </aside>
  </>;
}

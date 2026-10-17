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

import { useEffect, useRef, useState, type MouseEvent, type RefObject } from 'react';
import type { ExplainId } from './explanations';
import type { ShowroomWorkspace } from './useShowroomWorkspace';

type Explain = (id: ExplainId, anchor?: DOMRect) => void;

const rectOf = (event: MouseEvent<HTMLElement>) => event.currentTarget.getBoundingClientRect();

/* Classes, labels and order follow components/TopNav.tsx, scaled from its 64 px bar to 44 px. */

const DRAG_MODES = [
  { mode: 'pan', icon: 'fa-hand', label: 'Pan mode' },
  { mode: 'select', icon: 'fa-vector-square', label: 'Select mode' },
] as const;

function WorkspaceSwitcher({ onExplain }: { onExplain: Explain }) {
  const tile = 'w-5 h-5 rounded-md flex items-center justify-center text-[9px]';
  const label = 'text-[10px] font-bold uppercase whitespace-nowrap';
  return (
    <div role="group" aria-label="Workspace" className="mx-auto flex shrink-0 gap-0.5 rounded-xl border border-slate-800 bg-slate-950 p-0.5 shadow-xl">
      <button type="button" aria-pressed="true" className="flex items-center gap-1.5 rounded-lg bg-env-strong py-1 pl-1 pr-2 shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-env/60">
        <span className={`${tile} bg-white/15 text-white`}><i className="fas fa-crosshairs" aria-hidden="true" /></span>
        <span className={`${label} text-white`}>Visual Viewport</span>
      </button>
      <button type="button" aria-pressed="false" onClick={event => onExplain('hub', rectOf(event))} className="group flex items-center gap-1.5 rounded-lg py-1 pl-1 pr-2 hover:bg-slate-800/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-env/60">
        <span className={`${tile} bg-slate-800 text-slate-400 group-hover:text-slate-300`}><i className="fas fa-table-list" aria-hidden="true" /></span>
        <span className={`${label} text-slate-400 group-hover:text-slate-200`}>Annotation Hub</span>
      </button>
    </div>
  );
}

function DragModes({ dragMode, onChange }: { dragMode: 'pan' | 'select'; onChange: (mode: 'pan' | 'select') => void }) {
  return (
    <div role="group" aria-label="Drag mode" className="flex shrink-0 rounded-lg border border-slate-800 bg-slate-950 p-0.5">
      {DRAG_MODES.map(m => (
        <button key={m.mode} type="button" onClick={() => onChange(m.mode)} aria-pressed={dragMode === m.mode} aria-label={m.label}
          className={`flex h-7 w-7 items-center justify-center rounded-md text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-env/60 ${dragMode === m.mode ? 'bg-white text-env-strong shadow-lg' : 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-200'}`}>
          <i className={`fas ${m.icon}`} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

type Layer = { label: string; on: boolean; dot: string; toggle: (anchor: DOMRect) => void; disabledReason?: string };

function LayersMenu({ layers }: { layers: Layer[] }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const count = layers.filter(layer => layer.on).length;
  return (
    <div ref={box} className="relative shrink-0">
      <button type="button" aria-label={`Layers ${count}/${layers.length}`} aria-expanded={open} onClick={() => setOpen(value => !value)}
        className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950 px-2 text-xs text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500">
        Layers {count}/{layers.length}
        <span className="flex gap-1 max-[859px]:hidden" aria-hidden="true">{layers.map(layer => <span key={layer.label} className={`h-1.5 w-1.5 rounded-full ${layer.on && !layer.disabledReason ? layer.dot : 'bg-slate-600'}`} />)}</span>
      </button>
      {open && <div role="group" aria-label="Layer options" onKeyDown={event => { if (event.key === 'Escape') { setOpen(false); box.current?.querySelector('button')?.focus(); } }}
        className="absolute right-0 top-full mt-1.5 w-64 rounded-xl border border-slate-800 bg-slate-950 p-1.5 shadow-xl">
        {layers.map(layer => <div key={layer.label}>
          <button type="button" aria-pressed={layer.on} aria-disabled={Boolean(layer.disabledReason)} onClick={event => layer.toggle(rectOf(event))}
            className="flex w-full items-center gap-2 rounded-lg p-2 text-left text-xs text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500">
            <span className={`h-1.5 w-1.5 rounded-full ${layer.on ? layer.dot : 'bg-slate-600'}`} />{layer.label}
          </button>
          {layer.disabledReason && <p className="px-2 pb-2 text-xs text-slate-400">{layer.disabledReason}</p>}
        </div>)}
      </div>}
    </div>
  );
}

function AppActions({ onExplain, onExit }: { onExplain: Explain; onExit: () => void }) {
  return <>
    <span aria-hidden="true" className="mx-0.5 h-5 w-px shrink-0 bg-slate-700" />
    <button type="button" aria-label="Project and options" data-tip="Project and options" aria-haspopup="dialog" onClick={event => onExplain('project', rectOf(event))}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-700/30 bg-slate-800/50 text-slate-400 hover:bg-slate-700 hover:text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-env/60">
      <i aria-hidden="true" className="fas fa-gear text-[15px]" />
    </button>
    <div className="ml-1 flex h-8 shrink-0 items-center overflow-hidden rounded-lg border border-sky-400/70">
      <span className="px-1.5 text-[11px] font-semibold text-sky-300">Test drive</span>
      <button type="button" onClick={onExit}
        className="h-full border-l border-sky-400/40 px-2 text-xs font-semibold text-slate-100 hover:bg-sky-400/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-400">
        Exit
      </button>
    </div>
  </>;
}

interface ShowroomTopBarProps {
  workspace: ShowroomWorkspace;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  sidebarToggleRef: RefObject<HTMLButtonElement | null>;
  isAlignmentLoaded: boolean;
  onExplain: Explain;
  onExit: () => void;
}

/**
 * The workbench `TopNav` rebuilt at phone height: the switcher, Pan/Select and
 * Layers work; the rest explains. It keeps the spec's controls only, so the bar
 * fits 740 px; the wordmark gives way first.
 */
export function ShowroomTopBar({ workspace, sidebarOpen, onToggleSidebar, sidebarToggleRef, isAlignmentLoaded, onExplain, onExit }: ShowroomTopBarProps) {
  const layers: Layer[] = [
    { label: 'Annotations', on: workspace.showAnnotations, dot: 'bg-sky-400 text-sky-400', toggle: () => workspace.toggle('annotations') },
    { label: 'Tracks', on: workspace.showTracks, dot: 'bg-indigo-400 text-indigo-400', toggle: () => workspace.toggle('tracks') },
    { label: 'Translation', on: workspace.showTranslation, dot: 'bg-emerald-400 text-emerald-400', toggle: () => workspace.toggle('translation') },
    { label: 'Conservation', on: workspace.showConservation, dot: 'bg-amber-400 text-amber-400',
      toggle: anchor => (isAlignmentLoaded ? workspace.toggle('conservation') : onExplain('conservation', anchor)),
      disabledReason: isAlignmentLoaded ? undefined : 'Conservation needs an alignment: upload a pre-aligned FASTA first' },
  ];
  return (
    <nav data-theme="clean" aria-label="Workbench" className="app-nav relative z-50 h-11 shrink-0 border-b border-slate-800/80 bg-slate-900">
      <div className="hf-env" aria-hidden="true" />
      <div className="relative z-[1] flex h-full items-center gap-1.5 px-1.5">
        <button ref={sidebarToggleRef} type="button" onClick={onToggleSidebar} aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'} aria-expanded={sidebarOpen}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-700/30 bg-slate-800/50 text-slate-400 hover:bg-slate-700 hover:text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/60">
          <i aria-hidden="true" className={`fas ${sidebarOpen ? 'fa-arrow-left-long' : 'fa-bars-staggered'}`} />
        </button>
        <span className="shrink-0 text-[14px] font-black uppercase italic tracking-wide text-white max-[799px]:hidden">Dunceious</span>
        <WorkspaceSwitcher onExplain={onExplain} />
        <DragModes dragMode={workspace.dragMode} onChange={workspace.setDragMode} />
        <LayersMenu layers={layers} />
        <AppActions onExplain={onExplain} onExit={onExit} />
      </div>
    </nav>
  );
}

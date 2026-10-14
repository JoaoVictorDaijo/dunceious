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

import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { SelectionArea } from '@/src/domain/bio/types';
import OptionsPanel from './OptionsPanel';
import type { ThemeKey } from '@/src/app/logic/theme';

const DRAG_MODES = [
  { mode: 'pan', icon: 'fa-hand', label: 'Pan mode', tip: 'Pan: drag to scroll along the sequence' },
  { mode: 'select', icon: 'fa-vector-square', label: 'Select mode', tip: 'Select: drag to select a region' },
] as const;

export interface TopNavProps {
  toolsRef?: (element: HTMLDivElement | null) => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  activeTab: 'alignment' | 'features';
  onTabChange: (tab: 'alignment' | 'features') => void;
  featureColors: Record<string, string>;
  onSetFeatureColors: (colors: Record<string, string>) => void;
  themeKey: ThemeKey;
  onSetThemeKey: (key: ThemeKey) => void;
  /** Show the alignment-specific toolbar buttons (true when records are loaded in alignment view) */
  showAlignmentControls: boolean;
  dragMode: 'pan' | 'select';
  onDragModeChange: (mode: 'pan' | 'select') => void;
  activeSelection: SelectionArea | null;
  onClearSelection: () => void;
  showAnnotations: boolean;
  onToggleAnnotations: () => void;
  showTracks: boolean;
  onToggleTracks: () => void;
  showTranslation: boolean;
  onToggleTranslation: () => void;
  showConservation: boolean;
  onToggleConservation: () => void;
  isAlignmentLoaded: boolean;
  sessionMoleculeType: 'nucleotide' | 'protein' | null;
}

/**
 * Top navigation bar with app branding, tab switcher, and alignment toolbar.
 */
const TopNav: React.FC<TopNavProps> = ({
  toolsRef,
  sidebarOpen,
  onToggleSidebar,
  activeTab,
  onTabChange,
  featureColors,
  onSetFeatureColors,
  themeKey,
  onSetThemeKey,
  showAlignmentControls,
  dragMode,
  onDragModeChange,
  activeSelection,
  onClearSelection,
  showAnnotations,
  onToggleAnnotations,
  showTracks,
  onToggleTracks,
  showTranslation,
  onToggleTranslation,
  showConservation,
  onToggleConservation,
  isAlignmentLoaded,
  sessionMoleculeType,
}) => {
  const [layersOpen, setLayersOpen] = useState(false);
  const [inlineLayers, setInlineLayers] = useState(() => typeof window !== 'undefined' && (window.matchMedia?.('(min-width: 1536px)').matches ?? window.innerWidth >= 1536));
  const nav = useRef<HTMLElement>(null);
  const switcher = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = switcher.current;
    if (!element) return;
    const measure = () => nav.current?.style.setProperty('--switcher-half', `${element.getBoundingClientRect().width / 2}px`);
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const cluster = useRef<HTMLDivElement>(null);
  const workspaceTools = useRef<HTMLDivElement>(null);
  const viewportControls = useRef<HTMLDivElement>(null);
  const inlineTray = useRef<HTMLDivElement>(null);
  const setToolsElement = useCallback((element: HTMLDivElement | null) => { workspaceTools.current = element; toolsRef?.(element); }, [toolsRef]);
  useLayoutEffect(() => {
    const bounded = cluster.current, tools = workspaceTools.current, controls = viewportControls.current, tray = inlineTray.current;
    if (!showAlignmentControls || !bounded || !tools || !controls || !tray) return;
    const measure = () => {
      // A collapsed tray still needs its natural width to decide when it can return.
      const previousDisplay = tray.style.display;
      tray.style.display = 'flex';
      const naturalWidth = tray.getBoundingClientRect().width;
      tray.style.display = previousDisplay;
      const available = tools.getBoundingClientRect().width;
      if (!naturalWidth || !available) return;
      const otherTools = [...controls.children].filter(element => element !== tray && element !== layersElement.current);
      const gap = Number.parseFloat(getComputedStyle(controls).columnGap) || 8;
      const required = naturalWidth + otherTools.reduce((sum, element) => sum + Math.max(element.getBoundingClientRect().width, (element as HTMLElement).offsetWidth), 0) + gap * otherTools.length;
      const fits = required <= available;
      setInlineLayers(fits);
      if (fits) setLayersOpen(false);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') { window.addEventListener('resize', measure); return () => window.removeEventListener('resize', measure); }
    const observer = new ResizeObserver(measure);
    observer.observe(bounded);
    observer.observe(tray);
    return () => observer.disconnect();
  }, [activeSelection, showAlignmentControls]);
  const layersElement = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!layersOpen) return;
    const outside = (event: PointerEvent) => { if (!layersElement.current?.contains(event.target as Node)) setLayersOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [layersOpen]);
  const layers = [
    { label: 'Annotations', on: showAnnotations, onToggle: onToggleAnnotations, dot: 'bg-sky-400 text-sky-400',
      tip: 'the annotation lanes above each sequence' },
    { label: 'Tracks', on: showTracks, onToggle: onToggleTracks, dot: 'bg-indigo-400 text-indigo-400',
      tip: 'imported quantitative data tracks' },
    { label: 'Translation', on: showTranslation, onToggle: onToggleTranslation, dot: 'bg-emerald-400 text-emerald-400',
      tip: 'the amino-acid translation of CDS features, forward strand above the bases and reverse below',
      disabledReason: sessionMoleculeType === 'protein' ? 'Translation does not apply to a peptide session' : undefined },
    { label: 'Conservation', on: showConservation, onToggle: onToggleConservation, dot: 'bg-amber-400 text-amber-400',
      tip: 'the per-column conservation heatmap',
      disabledReason: isAlignmentLoaded ? undefined : 'Conservation needs an alignment: upload a pre-aligned FASTA first' },
  ];

  // No backdrop-filter on the nav: it would become the backdrop root for the
  // Options popover, whose own blur then samples only the nav and lets the page
  // behind show through unblurred.
  return (
  <nav ref={nav} data-theme={themeKey} className="app-nav relative h-16 border-b border-slate-800/80 bg-slate-900 shrink-0 z-50">
    <div className="hf-env" aria-hidden="true" />
    <div className="relative z-[1] h-full flex items-center justify-between px-6">
    <div className="flex items-center gap-6">
      <button
        onClick={onToggleSidebar}
        aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
        data-tip={sidebarOpen ? 'Hide the sidebar to widen the workspace' : 'Show the sidebar (records, navigation, search)'}
        className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-800/50 hover:bg-slate-700 hover:text-slate-200 text-slate-400 transition-all motion-reduce:transition-none border border-slate-700/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/60"
      >
        <i className={`fas ${sidebarOpen ? 'fa-arrow-left-long' : 'fa-bars-staggered'}`}></i>
      </button>
      <div className="flex flex-col">
        <div className="flex items-center gap-3">
          {/* Indented past the slogan on purpose: the original offset is part of the wordmark. */}
          <span className="ml-3 text-xl font-black tracking-wide uppercase italic text-white">Dunceious</span>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-400 italic leading-none mt-1">
          Because geniality is overpriced.
        </span>
      </div>
    </div>

    <div data-workspace-switcher ref={switcher} style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', width: 'max-content' }}>
      {/* Mode switcher — two workspaces, not two views. The active mode wears the
          session accent (resolveEnvAccent turns it amber in the Hub); the viewport
          takes the deep tone so it can keep white text, amber keeps dark text. */}
      <div role="group" aria-label="Workspace" className="flex bg-slate-950 p-1 rounded-2xl border border-slate-800 shadow-xl gap-1">
        <button
          onClick={() => onTabChange('alignment')}
          aria-pressed={activeTab === 'alignment'}
          data-tip="Visual Viewport: browse the sequences, annotations and data tracks"
          className={`group flex items-center gap-2.5 pl-2 pr-4 py-1.5 rounded-xl transition-all motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-env/60 ${activeTab === 'alignment' ? 'bg-env-strong shadow-lg' : 'hover:bg-slate-800/50'}`}
        >
          <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs transition-all motion-reduce:transition-none ${activeTab === 'alignment' ? 'bg-white/15 text-white' : 'bg-slate-800 text-slate-400 group-hover:text-slate-300'}`}>
            <i className="fas fa-crosshairs"></i>
          </span>
          <span className={`text-[11px] font-bold uppercase tracking-wide ${activeTab === 'alignment' ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'}`}>Visual Viewport</span>
        </button>
        <button
          onClick={() => onTabChange('features')}
          aria-pressed={activeTab === 'features'}
          data-tip="Annotation Hub: list, edit, export and jump to every annotation"
          className={`group flex items-center gap-2.5 pl-2 pr-4 py-1.5 rounded-xl transition-all motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-env/60 ${activeTab === 'features' ? 'bg-env shadow-lg' : 'hover:bg-slate-800/50'}`}
        >
          <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs transition-all motion-reduce:transition-none ${activeTab === 'features' ? 'bg-slate-950/15 text-slate-950' : 'bg-slate-800 text-slate-400 group-hover:text-slate-300'}`}>
            <i className="fas fa-table-list"></i>
          </span>
          <span className={`text-[11px] font-bold uppercase tracking-wide ${activeTab === 'features' ? 'text-slate-950' : 'text-slate-400 group-hover:text-slate-200'}`}>Annotation Hub</span>
        </button>
      </div>

    </div>
    <div ref={cluster} aria-label="Workspace tools and options" className="ml-auto flex min-w-0 items-center justify-end gap-2" style={{ width: 'calc(50% - var(--switcher-half) - 16px)', maxWidth: 'calc(50% - var(--switcher-half) - 16px)' }}>
      <div ref={setToolsElement} aria-label="Workspace tools" data-hub-focus={activeTab === 'features' ? true : undefined} className="flex min-w-0 flex-1 items-center justify-end gap-2">
      {/* Workspace tools share a bounded cluster to protect the centred switcher. */}
      {showAlignmentControls && (
        <div ref={viewportControls} className="flex min-w-0 items-center gap-2">
          <div className="flex shrink-0 bg-slate-950 p-1 rounded-xl border border-slate-800" role="group" aria-label="Drag mode">
            {DRAG_MODES.map(m => (
              <button
                key={m.mode}
                onClick={() => onDragModeChange(m.mode)}
                aria-pressed={dragMode === m.mode}
                aria-label={m.label}
                data-tip={m.tip}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-env/60 ${dragMode === m.mode ? 'bg-white text-env-strong shadow-lg' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/70'}`}
              >
                <i className={`fas ${m.icon}`}></i>
              </button>
            ))}
          </div>
          
          {activeSelection && (
            <button
              onClick={onClearSelection}
              className="h-10 shrink-0 px-4 rounded-xl text-[10px] font-bold uppercase tracking-wider border border-rose-500/40 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 hover:text-rose-300 transition-all motion-reduce:transition-none animate-in fade-in zoom-in-95 duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/60"
              data-tip="Clear the current selection"
            >
              <i className="fas fa-xmark mr-1.5"></i>Clear
            </button>
          )}
          {/* Layer toggles share one style; each layer keeps its identity colour as a dot. */}
          <div ref={inlineTray} style={{ display: inlineLayers ? undefined : 'none' }} className="flex w-max shrink-0 bg-slate-950 p-1 rounded-xl border border-slate-800 gap-1" role="group" aria-label="Viewport layers">
            {layers.map(l => (
              <button
                key={l.label}
                onClick={() => { if (!l.disabledReason) l.onToggle(); }}
                aria-pressed={l.on}
                aria-disabled={l.disabledReason ? true : undefined}
                data-tip={l.disabledReason ?? `${l.on ? 'Hide' : 'Show'} ${l.tip}`}
                className={`h-8 flex items-center gap-1.5 px-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-env/60 ${
                  l.disabledReason
                    ? 'text-slate-500 cursor-not-allowed'
                    : l.on
                      ? 'bg-slate-800 text-slate-100 shadow-inner'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full transition-all motion-reduce:transition-none ${l.on && !l.disabledReason ? l.dot : 'bg-slate-600'}`}
                  style={l.on && !l.disabledReason ? { boxShadow: '0 0 6px currentColor' } : undefined}
                  aria-hidden="true"
                ></span>
                {l.label}
              </button>
            ))}
          </div>
          <div ref={layersElement} style={{ display: inlineLayers ? 'none' : undefined }} className="relative shrink-0">
            <button aria-label={`Layers ${layers.filter(layer => layer.on).length}/4`} aria-expanded={layersOpen} data-tip="Choose viewport layers" onClick={() => setLayersOpen(open => !open)} className="h-10 flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950 px-3 text-xs text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500">
              Layers {layers.filter(layer => layer.on).length}/4
              <span className="flex gap-1" aria-hidden="true">{layers.map(layer => <span key={layer.label} className={`h-1.5 w-1.5 rounded-full ${layer.on && !layer.disabledReason ? layer.dot : 'bg-slate-600'}`} />)}</span>
            </button>
            {layersOpen && <div role="group" aria-label="Layer options" onKeyDown={event => { if (event.key === 'Escape') { setLayersOpen(false); event.currentTarget.parentElement?.querySelector('button')?.focus(); } }} className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-slate-800 bg-slate-950 p-2 shadow-xl">
              {layers.map(layer => <div key={layer.label}><button aria-pressed={layer.on} aria-disabled={Boolean(layer.disabledReason)} data-tip={layer.disabledReason ?? layer.tip} onClick={() => { if (!layer.disabledReason) layer.onToggle(); }} className="flex w-full items-center gap-2 rounded-lg p-2 text-left text-xs text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500"><span className={`h-1.5 w-1.5 rounded-full ${layer.on ? layer.dot : 'bg-slate-600'}`} />{layer.label}</button>{layer.disabledReason && <p className="px-2 pb-2 text-xs text-slate-400">{layer.disabledReason}</p>}</div>)}
            </div>}
          </div>
        </div>
      )}

      </div>
      <div className="shrink-0"><OptionsPanel
        featureColors={featureColors}
        onSetFeatureColors={onSetFeatureColors}
        themeKey={themeKey}
        onSetThemeKey={onSetThemeKey}
      /></div>
    </div>
    </div>
  </nav>
  );
};

export default TopNav;

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
import { SelectionArea } from '@/src/domain/bio/types';
import OptionsPanel from './OptionsPanel';
import type { ThemeKey } from '@/src/app/logic/theme';

const DRAG_MODES = [
  { mode: 'pan', icon: 'fa-hand', label: 'Pan mode', tip: 'Pan: drag to scroll along the sequence' },
  { mode: 'select', icon: 'fa-vector-square', label: 'Select mode', tip: 'Select: drag to select a region' },
] as const;

export interface TopNavProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  activeTab: 'alignment' | 'features';
  onTabChange: (tab: 'alignment' | 'features') => void;
  featureColors: Record<string, string>;
  onSetFeatureColors: (colors: Record<string, string>) => void;
  skipClearAllConfirmation: boolean;
  onSetSkipClearAllConfirmation: (value: boolean) => void;
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
  sidebarOpen,
  onToggleSidebar,
  activeTab,
  onTabChange,
  featureColors,
  onSetFeatureColors,
  skipClearAllConfirmation,
  onSetSkipClearAllConfirmation,
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
  const layers = [
    { label: 'Annotations', on: showAnnotations, onToggle: onToggleAnnotations, dot: 'bg-sky-400 text-sky-400',
      tip: 'the annotation lanes above each sequence' },
    { label: 'Tracks', on: showTracks, onToggle: onToggleTracks, dot: 'bg-indigo-400 text-indigo-400',
      tip: 'imported quantitative data tracks' },
    { label: 'Translation', on: showTranslation, onToggle: onToggleTranslation, dot: 'bg-emerald-400 text-emerald-400',
      tip: 'the amino-acid translation of CDS features (frames F1–F3, R1–R3)',
      disabledReason: sessionMoleculeType === 'protein' ? 'Translation does not apply to a peptide session' : undefined },
    { label: 'Conservation', on: showConservation, onToggle: onToggleConservation, dot: 'bg-amber-400 text-amber-400',
      tip: 'the per-column conservation heatmap',
      disabledReason: isAlignmentLoaded ? undefined : 'Conservation needs an alignment: upload a pre-aligned FASTA first' },
  ];

  // No backdrop-filter on the nav: it would become the backdrop root for the
  // Options popover, whose own blur then samples only the nav and lets the page
  // behind show through unblurred.
  return (
  <nav className="app-nav relative h-16 border-b border-slate-800/80 bg-slate-900 shrink-0 z-50">
    <div className="hf-env" aria-hidden="true" />
    <div className="relative z-[1] h-full flex items-center justify-between px-6">
    <div className="flex items-center gap-6">
      <button
        onClick={onToggleSidebar}
        aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
        data-tip={sidebarOpen ? 'Hide the sidebar to widen the workspace' : 'Show the sidebar (records, navigation, search)'}
        className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-800/50 hover:bg-slate-700 hover:text-slate-200 text-slate-400 transition-all border border-slate-700/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/60"
      >
        <i className={`fas ${sidebarOpen ? 'fa-arrow-left-long' : 'fa-bars-staggered'}`}></i>
      </button>
      <div className="flex flex-col">
        <div className="flex items-center gap-3">
          {/* Same tile as the favicon; it takes the environment accent. */}
          <span
            className="w-7 h-7 rounded-lg flex items-center justify-center bg-slate-950 border transition-colors duration-700 motion-reduce:transition-none"
            style={{ color: 'var(--env)', borderColor: 'color-mix(in srgb, var(--env) 35%, transparent)' }}
            aria-hidden="true"
          >
            <i className="fas fa-dna text-[13px]"></i>
          </span>
          <span className="text-xl font-black tracking-tightest uppercase italic text-white">Dunceious</span>
        </div>
        <span className="text-[8px] font-semibold uppercase tracking-[0.4em] text-slate-500 italic leading-none mt-1">
          Because geniality is overpriced.
        </span>
      </div>
    </div>

    <div className="flex items-center gap-4">
      {/* Mode switcher — two workspaces, not two views: each mode carries its own
          icon, verb, and accent (sky = look, amber = manage) */}
      <div className="flex bg-slate-950 p-1 rounded-2xl border border-slate-800 shadow-xl mr-4 gap-1">
        <button
          onClick={() => onTabChange('alignment')}
          aria-pressed={activeTab === 'alignment'}
          data-tip="Visual Viewport: browse the sequences, annotations and data tracks"
          className={`group flex items-center gap-2.5 pl-2 pr-4 py-1.5 rounded-xl transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60 ${activeTab === 'alignment' ? 'bg-sky-600 shadow-lg' : 'hover:bg-slate-800/50'}`}
        >
          <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs transition-all ${activeTab === 'alignment' ? 'bg-white/15 text-white' : 'bg-slate-800 text-slate-500 group-hover:text-slate-300'}`}>
            <i className="fas fa-crosshairs"></i>
          </span>
          <span className="flex flex-col items-start leading-none">
            <span className={`text-[8px] font-semibold uppercase tracking-[0.28em] ${activeTab === 'alignment' ? 'text-sky-100' : 'text-slate-400'}`}>View</span>
            <span className={`text-[10px] font-semibold uppercase tracking-tight mt-0.5 ${activeTab === 'alignment' ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'}`}>Visual Viewport</span>
          </span>
        </button>
        <button
          onClick={() => onTabChange('features')}
          aria-pressed={activeTab === 'features'}
          data-tip="Annotation Hub: list, edit, export and jump to every annotation"
          className={`group flex items-center gap-2.5 pl-2 pr-4 py-1.5 rounded-xl transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60 ${activeTab === 'features' ? 'bg-amber-500 shadow-lg' : 'hover:bg-slate-800/50'}`}
        >
          <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs transition-all ${activeTab === 'features' ? 'bg-slate-950/15 text-slate-900' : 'bg-slate-800 text-slate-500 group-hover:text-slate-300'}`}>
            <i className="fas fa-table-list"></i>
          </span>
          <span className="flex flex-col items-start leading-none">
            <span className={`text-[8px] font-semibold uppercase tracking-[0.28em] ${activeTab === 'features' ? 'text-amber-950' : 'text-slate-400'}`}>Manage</span>
            <span className={`text-[10px] font-semibold uppercase tracking-tight mt-0.5 ${activeTab === 'features' ? 'text-slate-950' : 'text-slate-400 group-hover:text-slate-200'}`}>Annotation Hub</span>
          </span>
        </button>
      </div>

      {/* Viewport-specific controls — only visible in alignment tab with records loaded */}
      {showAlignmentControls && (
        <div className="flex items-center gap-3 animate-in fade-in slide-in-from-top-1 duration-300">
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800" role="group" aria-label="Drag mode">
            {DRAG_MODES.map(m => (
              <button
                key={m.mode}
                onClick={() => onDragModeChange(m.mode)}
                aria-pressed={dragMode === m.mode}
                aria-label={m.label}
                data-tip={m.tip}
                className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60 ${dragMode === m.mode ? 'bg-white text-sky-600 shadow-lg' : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800/70'}`}
              >
                <i className={`fas ${m.icon}`}></i>
              </button>
            ))}
          </div>
          <div className="h-8 w-px bg-slate-800 mx-1"></div>
          {activeSelection && (
            <button
              onClick={onClearSelection}
              className="h-10 px-4 rounded-xl text-[9px] font-semibold uppercase tracking-wider border border-rose-500/40 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 hover:text-rose-300 transition-all animate-in fade-in zoom-in-95 duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/60"
              data-tip="Clear the current selection"
            >
              <i className="fas fa-xmark mr-1.5"></i>Clear
            </button>
          )}
          {/* Layer toggles share one style; each layer keeps its identity colour as a dot. */}
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 gap-1" role="group" aria-label="Viewport layers">
            {layers.map(l => (
              <button
                key={l.label}
                onClick={() => { if (!l.disabledReason) l.onToggle(); }}
                aria-pressed={l.on}
                aria-disabled={l.disabledReason ? true : undefined}
                data-tip={l.disabledReason ?? `${l.on ? 'Hide' : 'Show'} ${l.tip}`}
                className={`h-8 flex items-center gap-2 px-3 rounded-lg text-[9px] font-semibold uppercase tracking-wider transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60 ${
                  l.disabledReason
                    ? 'text-slate-600 cursor-not-allowed'
                    : l.on
                      ? 'bg-slate-800 text-slate-100 shadow-inner'
                      : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full transition-all ${l.on && !l.disabledReason ? l.dot : 'bg-slate-600'}`}
                  style={l.on && !l.disabledReason ? { boxShadow: '0 0 6px currentColor' } : undefined}
                  aria-hidden="true"
                ></span>
                {l.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <OptionsPanel
        featureColors={featureColors}
        onSetFeatureColors={onSetFeatureColors}
        skipClearAllConfirmation={skipClearAllConfirmation}
        onSetSkipClearAllConfirmation={onSetSkipClearAllConfirmation}
        themeKey={themeKey}
        onSetThemeKey={onSetThemeKey}
      />
    </div>
    </div>
  </nav>
  );
};

export default TopNav;

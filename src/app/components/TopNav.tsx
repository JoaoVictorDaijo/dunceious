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
  return (
  <nav className="app-nav relative h-16 border-b border-slate-800/80 bg-slate-900/95 backdrop-blur-md shrink-0 z-50">
    <div className="hf-env" aria-hidden="true" />
    <div className="relative z-[1] h-full flex items-center justify-between px-6">
    <div className="flex items-center gap-6">
      <button
        onClick={onToggleSidebar}
        className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-800/50 hover:bg-slate-700 text-slate-400 transition-all border border-slate-700/30"
      >
        <i className={`fas ${sidebarOpen ? 'fa-arrow-left-long' : 'fa-bars-staggered'}`}></i>
      </button>
      <div className="flex flex-col">
        <div className="flex items-center gap-3">
          <i
            className="fas fa-helix text-xl animate-spin-slow transition-colors duration-700 motion-reduce:transition-none"
            style={{ color: 'var(--env)' }}
          ></i>
          <span className="text-xl font-black tracking-tightest uppercase italic text-white">Dunceious</span>
        </div>
        <span className="text-[8px] font-black uppercase tracking-[0.4em] text-slate-500 italic leading-none mt-1">
          Because intelligence is overpriced.
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
          title="Visual Viewport — look at the molecule"
          className={`group flex items-center gap-2.5 pl-2 pr-4 py-1.5 rounded-xl transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60 ${activeTab === 'alignment' ? 'bg-sky-600 shadow-lg' : 'hover:bg-slate-800/50'}`}
        >
          <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs transition-all ${activeTab === 'alignment' ? 'bg-white/15 text-white' : 'bg-slate-800 text-slate-500 group-hover:text-slate-300'}`}>
            <i className="fas fa-crosshairs"></i>
          </span>
          <span className="flex flex-col items-start leading-none">
            <span className={`text-[7px] font-black uppercase tracking-[0.28em] ${activeTab === 'alignment' ? 'text-sky-100' : 'text-slate-400'}`}>View</span>
            <span className={`text-[10px] font-black uppercase tracking-tight mt-0.5 ${activeTab === 'alignment' ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'}`}>Visual Viewport</span>
          </span>
        </button>
        <button
          onClick={() => onTabChange('features')}
          aria-pressed={activeTab === 'features'}
          title="Database Hub — manage records & data"
          className={`group flex items-center gap-2.5 pl-2 pr-4 py-1.5 rounded-xl transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60 ${activeTab === 'features' ? 'bg-amber-500 shadow-lg' : 'hover:bg-slate-800/50'}`}
        >
          <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs transition-all ${activeTab === 'features' ? 'bg-slate-950/15 text-slate-900' : 'bg-slate-800 text-slate-500 group-hover:text-slate-300'}`}>
            <i className="fas fa-table-list"></i>
          </span>
          <span className="flex flex-col items-start leading-none">
            <span className={`text-[7px] font-black uppercase tracking-[0.28em] ${activeTab === 'features' ? 'text-amber-950' : 'text-slate-400'}`}>Manage</span>
            <span className={`text-[10px] font-black uppercase tracking-tight mt-0.5 ${activeTab === 'features' ? 'text-slate-950' : 'text-slate-400 group-hover:text-slate-200'}`}>Database Hub</span>
          </span>
        </button>
      </div>

      {/* Viewport-specific controls — only visible in alignment tab with records loaded */}
      {showAlignmentControls && (
        <div className="flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => onDragModeChange('pan')}
              className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${dragMode === 'pan' ? 'bg-white text-sky-600 shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
              title="Pan Mode"
            >
              <i className="fas fa-hand-paper"></i>
            </button>
            <button
              onClick={() => onDragModeChange('select')}
              className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${dragMode === 'select' ? 'bg-white text-sky-600 shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
              title="Select Mode"
            >
              <i className="fas fa-vector-square"></i>
            </button>
          </div>
          <div className="h-8 w-px bg-slate-800 mx-2"></div>
          <div className="flex gap-2">
            {activeSelection && (
              <button
                onClick={onClearSelection}
                className="px-4 py-2.5 rounded-xl text-[9px] font-black uppercase border border-rose-500/50 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-all"
                title="Clear Current Selection"
              >
                Clear
              </button>
            )}
            <button
              onClick={onToggleAnnotations}
              className={`px-4 py-2.5 rounded-xl text-[9px] font-black uppercase border transition-all ${showAnnotations ? 'bg-sky-500/10 border-sky-500/50 text-sky-400' : 'bg-slate-800 border-slate-700 text-slate-500'}`}
              title="Toggle Annotations"
            >
              Annotations
            </button>
            <button
              onClick={onToggleTracks}
              className={`px-4 py-2.5 rounded-xl text-[9px] font-black uppercase border transition-all ${showTracks ? 'bg-indigo-500/10 border-indigo-500/50 text-indigo-400' : 'bg-slate-800 border-slate-700 text-slate-500'}`}
              title="Toggle Tracks"
            >
              Tracks
            </button>
            <button
              disabled={sessionMoleculeType === 'protein'}
              onClick={onToggleTranslation}
              className={`px-4 py-2.5 rounded-xl text-[9px] font-black uppercase border transition-all ${sessionMoleculeType === 'protein' ? 'opacity-30 cursor-not-allowed grayscale' : ''} ${showTranslation ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-500'}`}
              title={sessionMoleculeType === 'protein' ? 'Not applicable for peptide sessions' : 'Toggle Translation'}
            >
              Translation
            </button>
            <button
              disabled={!isAlignmentLoaded}
              onClick={onToggleConservation}
              className={`px-4 py-2.5 rounded-xl text-[9px] font-black uppercase border transition-all ${!isAlignmentLoaded ? 'opacity-30 cursor-not-allowed grayscale' : ''} ${showConservation ? 'bg-amber-500/10 border-amber-500/50 text-amber-400' : 'bg-slate-800 border-slate-700 text-slate-500'}`}
              title="Toggle Conservation Heatmap (Requires Alignment)"
            >
              Conservation
            </button>
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

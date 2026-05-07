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

export interface TopNavProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  activeTab: 'alignment' | 'features';
  onTabChange: (tab: 'alignment' | 'features') => void;
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
}) => (
  <>
  <nav className="h-16 border-b border-slate-800/80 bg-slate-900/95 backdrop-blur-md flex items-center justify-between px-6 shrink-0 z-50">
    <div className="flex items-center gap-6">
      <button
        onClick={onToggleSidebar}
        className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-800/50 hover:bg-slate-700 text-slate-400 transition-all border border-slate-700/30"
      >
        <i className={`fas ${sidebarOpen ? 'fa-arrow-left-long' : 'fa-bars-staggered'}`}></i>
      </button>
      <div className="flex flex-col">
        <div className="flex items-center gap-3">
          <i className="fas fa-helix text-sky-500 text-xl animate-spin-slow"></i>
          <span className="text-xl font-black tracking-tightest uppercase italic text-white">Dunceious</span>
        </div>
        <span className="text-[8px] font-black uppercase tracking-[0.4em] text-slate-500 italic leading-none mt-1">
          Because intelligence is overpriced.
        </span>
      </div>
    </div>

    <div className="flex items-center gap-4">
      {/* Tab toggle */}
      <div className="flex bg-slate-950 p-1 rounded-2xl border border-slate-800 shadow-xl mr-4">
        <button
          onClick={() => onTabChange('alignment')}
          className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${activeTab === 'alignment' ? 'bg-sky-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
        >
          Visual Viewport
        </button>
        <button
          onClick={() => onTabChange('features')}
          className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${activeTab === 'features' ? 'bg-sky-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
        >
          Database Hub
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
    </div>
  </nav>
  <div className={`h-0.5 shrink-0 transition-colors duration-700 ${
    sessionMoleculeType === 'protein'    ? 'bg-violet-500/70' :
    sessionMoleculeType === 'nucleotide' ? 'bg-sky-500/70'    : 'bg-transparent'
  }`} />
  </>
);

export default TopNav;

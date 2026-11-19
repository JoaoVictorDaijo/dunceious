/*
 * Dunceious
 * Copyright (C) 2026 João Victor Daijo and Murilo Cassiano
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
import GenomeViewer from '@/src/app/viewer/GenomeViewer';
import AnnotationHubPanel from '@/src/app/components/AnnotationHubPanel';
import HubReturnPill from '@/src/app/components/HubReturnPill';
import { hubPanelProps, viewerProps } from './panelProps';
import type { Workbench } from './useWorkbench';

function EmptyWorkspace() {
  return (
    <div className="relative z-10 flex-1 flex flex-col items-center justify-center text-slate-800 animate-in fade-in duration-700">
      <i className="fas fa-dna text-9xl opacity-10 animate-pulse mb-10"></i>
      <p className="text-[12px] font-bold uppercase tracking-[0.8em] text-slate-700">Workspace Empty</p>
      <p className="text-[10px] font-bold text-slate-500 mt-4 italic">"Spend money on Coffee and Personal, not with expensive genial software."</p>
    </div>
  );
}

/** The Visual Viewport or the Annotation Hub, with the way back to the Hub after a Focus jump. */
export function WorkbenchMain({ w }: { w: Workbench }) {
  const { nav, hubState } = w;
  const { activeTab, hubFocus } = nav;
  return (
    <main className="flex-1 bg-slate-900 relative flex flex-col min-h-0 min-w-0 p-1.5">
      {w.bio.records.length === 0 && activeTab === 'alignment' ? <EmptyWorkspace /> : (
        <div className="relative z-10 flex-1 flex flex-col min-h-0 min-w-0 bg-white rounded-xl shadow-2xl overflow-hidden border border-slate-800/50">
          {activeTab === 'alignment' && nav.showHubReturn && hubFocus && (
            <HubReturnPill
              label={hubFocus.label}
              onReturn={() => { hubState.setJumpTarget(prev => ({ key: hubFocus.key, serial: (prev?.serial ?? 0) + 1 })); nav.changeTab('features'); }}
              onDismiss={() => nav.setShowHubReturn(false)}
            />
          )}
          {/* Keyed by mode so each switch replays a short fade instead of a hard cut. */}
          <div key={activeTab} className="flex-1 flex flex-col min-h-0 min-w-0 animate-in fade-in duration-300 motion-reduce:animate-none">
            {activeTab === 'alignment' ? <GenomeViewer {...viewerProps(w)} /> : <AnnotationHubPanel {...hubPanelProps(w)} />}
          </div>
        </div>
      )}
    </main>
  );
}

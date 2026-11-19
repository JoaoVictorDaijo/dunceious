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
import Sidebar from './components/Sidebar';
import StatusBar from './components/StatusBar';
import TooltipLayer from './components/TooltipLayer';
import TopNav from './components/TopNav';
import { TrackTooltipProvider } from './components/hub/TrackTooltip';
import { useWorkbench } from './workbench/useWorkbench';
import { WorkbenchOverlays } from './workbench/WorkbenchOverlays';
import { WorkbenchMain } from './workbench/WorkbenchMain';
import { sidebarProps, topNavProps } from './workbench/chromeProps';

/**
 * Composition root of the workbench: `useWorkbench` wires the hooks together, and the
 * `workbench/` components and prop builders render what it returns.
 */
const App: React.FC = () => {
  const w = useWorkbench();
  return (
    <TrackTooltipProvider>
      <div
        className="app-root flex flex-col h-screen bg-slate-900 text-slate-200 overflow-hidden font-sans select-none"
        data-env={w.envAccent}
        style={w.themeStyle}
      >
        <WorkbenchOverlays w={w} />
        <TopNav {...topNavProps(w)} />
        <div className="flex-1 flex overflow-hidden">
          <Sidebar {...sidebarProps(w)} />
          <WorkbenchMain w={w} />
        </div>
        <StatusBar sessionMoleculeType={w.derived.sessionMoleculeType} importNotes={w.bio.importNotes} onClearImportNotes={w.bio.clearImportNotes} />
        <TooltipLayer />
      </div>
    </TrackTooltipProvider>
  );
};

export default App;

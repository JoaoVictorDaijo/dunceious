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

interface HubReturnPillProps {
  /** Name of the hub row the Focus jump came from. */
  label: string;
  onReturn: () => void;
  onDismiss: () => void;
}

/**
 * Floating way back to the Annotation Hub after a Focus jump. Sits at the bottom
 * of the canvas, away from the ruler and toolbar, and carries the hub's amber.
 */
const HubReturnPill: React.FC<HubReturnPillProps> = ({ label, onReturn, onDismiss }) => (
  <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 p-1 rounded-full bg-slate-900/95 backdrop-blur-md border border-slate-700/70 shadow-2xl shadow-slate-900/40 animate-in fade-in slide-in-from-bottom-3 duration-300">
    <button
      onClick={onReturn}
      data-tip="Return to the hub with this row highlighted"
      className="group flex items-center gap-2.5 pl-1 pr-3 py-1 rounded-full text-slate-200 hover:bg-slate-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60"
    >
      <span className="w-6 h-6 rounded-full bg-amber-500 text-slate-950 flex items-center justify-center transition-transform group-hover:-translate-x-0.5">
        <i className="fas fa-arrow-left text-[10px]"></i>
      </span>
      <span className="text-[10px] font-bold uppercase tracking-wider">Back to Annotation Hub</span>
      <span className="max-w-[220px] truncate text-[11px] font-medium text-amber-300/90 normal-case">{label}</span>
    </button>
    <button
      onClick={onDismiss}
      aria-label="Dismiss"
      data-tip="Dismiss"
      className="w-7 h-7 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/60"
    >
      <i className="fas fa-xmark text-[11px]"></i>
    </button>
  </div>
);

export default HubReturnPill;

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

import { useState, type ReactNode } from 'react';
import type { useHubState } from '@/src/app/hooks/useHubState';
export interface HubToolbarProps {
  state: ReturnType<typeof useHubState>; matchIndex: number; matchCount: number;
  onNavigate: (direction: number) => void; onAdd: () => void; more: ReactNode; locked?: boolean;
  onExport: () => void;
}
export default function HubToolbar({ state, matchIndex, matchCount, onNavigate, onAdd, more, locked, onExport }: HubToolbarProps) {
  const [focused, setFocused] = useState(false);
  return <div className="flex min-w-0 flex-1 items-center justify-end gap-2 text-slate-200">
    <div className="flex h-10 min-w-[200px] max-w-[440px] flex-1 items-center gap-1 rounded-xl border border-slate-800 bg-slate-950 px-2 focus-within:ring-1 focus-within:ring-amber-500">
      <i className="fas fa-magnifying-glass text-xs text-slate-500" aria-hidden="true" />
      <input id="hub-annotation-search" type="search" aria-label="Search annotations" data-tip="Search annotations" data-tip-kbd="/" placeholder="Search annotations" value={state.filters.query} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onChange={e => state.setFilters(f => ({ ...f, query: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onNavigate(e.shiftKey ? -1 : 1); } }} className="min-w-0 flex-1 bg-transparent text-xs text-slate-100 placeholder:text-slate-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500" />
      {!state.filters.query && !focused ? <kbd className="rounded border border-slate-800 px-1 font-mono text-[10px]">/</kbd> : <span className={`whitespace-nowrap font-mono text-[11px] ${matchCount ? 'text-amber-200' : 'text-slate-400'}`} aria-live="polite">{matchCount ? matchIndex + 1 : 0} / {matchCount}</span>}
      <button aria-label="Previous match" data-tip="Previous match" data-tip-kbd="Shift Enter" disabled={!matchCount} onClick={() => onNavigate(-1)} className="h-6 w-6 shrink-0 rounded-md hover:bg-slate-800 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500"><i className="fas fa-chevron-up text-xs" aria-hidden="true" /></button>
      <button aria-label="Next match" data-tip="Next match" data-tip-kbd="Enter" disabled={!matchCount} onClick={() => onNavigate(1)} className="h-6 w-6 shrink-0 rounded-md hover:bg-slate-800 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500"><i className="fas fa-chevron-down text-xs" aria-hidden="true" /></button>
    </div>
    <button aria-label="Add annotation" data-tip="Add annotation" disabled={locked} onClick={onAdd} className="flex h-10 w-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-950 text-xs disabled:opacity-40 2xl:w-auto 2xl:px-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500"><i className="fas fa-plus" aria-hidden="true" /><span className="hidden whitespace-nowrap 2xl:inline">Add annotation</span></button>
    <button aria-haspopup="dialog" onClick={onExport} className="flex h-10 shrink-0 items-center gap-2 rounded-xl bg-env px-3 text-xs font-semibold text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500"><i className="fas fa-file-export" aria-hidden="true" />Export…</button>{more}
  </div>;
}

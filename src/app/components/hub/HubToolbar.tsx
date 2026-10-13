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

import { useRef, type ReactNode } from 'react';
import type { useHubState } from '@/src/app/hooks/useHubState';
export interface HubToolbarProps {
  state: ReturnType<typeof useHubState>; summary: string; matchIndex: number; matchCount: number;
  onNavigate: (direction: number) => void; onAdd: () => void; more: ReactNode; locked?: boolean;
  onExport: () => void;
}
export default function HubToolbar({ state, summary, matchIndex, matchCount, onNavigate, onAdd, more, locked, onExport }: HubToolbarProps) {
  const search = useRef<HTMLInputElement>(null);
  return <div className="flex flex-wrap items-center gap-4 border-b border-slate-200 px-5 py-4">
    <div className="mr-auto"><h1 className="text-lg font-semibold text-slate-900">Annotation Hub</h1><p className="text-xs text-slate-500">{summary}</p></div>
    <div className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2">
      <input ref={search} id="hub-annotation-search" type="search" aria-label="Search annotations" placeholder="Search annotations" value={state.filters.query} onChange={e => state.setFilters(f => ({ ...f, query: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onNavigate(e.shiftKey ? -1 : 1); } }} className="w-48 bg-transparent text-xs text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500" />
      <span className="min-w-12 text-xs tabular-nums text-slate-500" aria-live="polite">{matchCount ? matchIndex + 1 : 0} / {matchCount}</span>
      <button aria-label="Previous match" disabled={!matchCount} onClick={() => onNavigate(-1)} className="p-1 disabled:opacity-40">↑</button><button aria-label="Next match" disabled={!matchCount} onClick={() => onNavigate(1)} className="p-1 disabled:opacity-40">↓</button>
    </div>
    <button disabled={locked} onClick={onAdd} className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-700 disabled:opacity-40">Add annotation</button>
    <button aria-haspopup="dialog" onClick={onExport} className="rounded-lg bg-slate-800 px-3 py-2 text-xs text-white">Export…</button>{more}
  </div>;
}

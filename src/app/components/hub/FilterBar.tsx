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

import type { useHubState } from '@/src/app/hooks/useHubState';
export default function FilterBar({ state, types, keys }: { state: ReturnType<typeof useHubState>; types: Map<string, number>; keys: string[] }) {
  const filtering = Boolean(state.filters.query.trim() || state.filters.types.size || state.filters.strand !== 'all' || state.filters.sequenceQuery || state.filters.needsAttention || state.filters.onlyIds || state.onlyProblems && state.tab === 'features');
  const foldAll = (fold: boolean) => {
    if (filtering) state.setSearchFolds(new Set(fold ? keys.map(key => `${state.tab}:${key}`) : []));
    else state.setCollapsed(prev => ({ ...prev, [state.tab]: new Set(fold ? keys : []) }));
  };
  return <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-5 py-2 text-xs text-slate-600">
    {[...types].map(([type, count]) => <button key={type} aria-pressed={state.filters.types.has(type)} onClick={() => state.setFilters(prev => { const next = new Set(prev.types); if (next.has(type)) next.delete(type); else next.add(type); return { ...prev, types: next }; })} className={`rounded border px-2 py-1 ${state.filters.types.has(type) ? 'border-slate-600 bg-slate-700 text-white' : 'border-slate-200 bg-white'}`}>{type} {count}</button>)}
    <label className="ml-auto">Strand <select aria-label="Strand" className="rounded border border-slate-200 bg-white p-1" value={state.filters.strand} onChange={e => state.setFilters(f => ({ ...f, strand: e.target.value as typeof f.strand }))}><option value="all">All strands</option><option value="fwd">Forward →</option><option value="rev">Reverse ←</option></select></label>
    <label>Density <select className="rounded border border-slate-200 bg-white p-1" value={state.density} onChange={e => state.setDensity(e.target.value as typeof state.density)}><option value="compact">Compact</option><option value="comfortable">Comfortable</option></select></label>
    {state.tab === 'features' && <label className="flex gap-1"><input type="checkbox" checked={state.onlyProblems} onChange={e => state.setOnlyProblems(e.target.checked)} />Only missing or odd length</label>}
    <button onClick={() => foldAll(false)} className="px-2 py-1">Expand all</button><button onClick={() => foldAll(true)} className="px-2 py-1">Collapse all</button>
  </div>;
}

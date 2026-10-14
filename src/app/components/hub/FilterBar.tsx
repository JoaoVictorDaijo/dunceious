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

import type { FeatureGroup } from '@/src/app/logic/featureComparison';
import { PresenceLegend } from './presence';
import { ExpandAllIcon, CollapseAllIcon } from './icons';
import { getFeatureColor } from '@/src/app/viewer/colors';
import type { useHubState } from '@/src/app/hooks/useHubState';
export default function FilterBar({ state, types, keys, featureColors, groups = [], editedCount = 0 }: { state: ReturnType<typeof useHubState>; types: Map<string, number>; keys: string[]; featureColors?: Record<string, string>; groups?: FeatureGroup[]; editedCount?: number }) {
  const filtering = Boolean(state.filters.query.trim() || state.filters.types.size || state.filters.strand !== 'all' || state.filters.editedOnly || state.filters.sequenceQuery || state.filters.needsAttention || state.filters.onlyIds || state.onlyProblems && state.tab === 'features');
  const foldAll = (fold: boolean) => {
    if (filtering) state.setSearchFolds(new Set(fold ? keys.map(key => `${state.tab}:${key}`) : []));
    else state.setCollapsed(prev => ({ ...prev, [state.tab]: new Set(fold ? keys : []) }));
  };
  return <div className="flex items-start gap-2 border-b border-slate-200 bg-slate-50 px-5 py-2 text-xs text-slate-600">
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
      {[...types].map(([type, count]) => <button key={type} aria-pressed={state.filters.types.has(type)} onClick={() => state.setFilters(prev => { const next = new Set(prev.types); if (next.has(type)) next.delete(type); else next.add(type); return { ...prev, types: next }; })} className={`flex h-7 items-center gap-1.5 rounded-lg border px-2 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500 ${state.filters.types.has(type) ? 'border-amber-400 bg-amber-50 text-slate-800' : 'border-slate-200 bg-white'}`}><span data-type-swatch aria-hidden="true" className="h-[9px] w-[9px] rounded" style={{ backgroundColor: getFeatureColor(type, featureColors) }} />{type} <span className="font-mono text-[11px] text-slate-500">{count}</span></button>)}
      <button aria-label="Edited in Dunceious" aria-pressed={Boolean(state.filters.editedOnly)} onClick={() => state.setFilters(previous => ({ ...previous, editedOnly: !previous.editedOnly }))} className={`flex h-7 items-center gap-1.5 rounded-lg border px-2 text-amber-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-env ${state.filters.editedOnly ? 'border-env bg-amber-50' : 'border-amber-200 bg-white'}`}><i aria-hidden="true" className="fas fa-pen" />Edited in Dunceious<span className="font-mono">{editedCount}</span></button>
      {state.tab === 'features' && <PresenceLegend groups={groups} featureColors={featureColors} />}
    </div>
    <div className="ml-auto flex flex-none flex-nowrap items-start justify-end gap-2 whitespace-nowrap">
      <div role="group" aria-label="Strand" className="flex rounded-lg border border-slate-300 bg-white p-0.5">
        {([['all', 'All', 'All strands'], ['fwd', '→', 'Forward strand only'], ['rev', '←', 'Reverse strand only']] as const).map(([value, glyph, label]) => <button key={value} aria-label={label} data-tip={label} aria-pressed={state.filters.strand === value} onClick={() => state.setFilters(filters => ({ ...filters, strand: value }))} className={`h-6 min-w-7 rounded-md px-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500 ${state.filters.strand === value ? 'bg-slate-900 text-white' : 'text-slate-500'}`}>{glyph}</button>)}
      </div>
      <div role="group" aria-label="Density" className="flex rounded-lg border border-slate-300 bg-white p-0.5">
        {(['compact', 'comfortable'] as const).map(value => <button key={value} aria-pressed={state.density === value} onClick={() => state.setDensity(value)} className={`h-6 rounded-md px-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500 ${state.density === value ? 'bg-slate-900 text-white' : 'text-slate-500'}`}>{value === 'compact' ? 'Compact' : 'Comfortable'}</button>)}
      </div>
      {state.tab === 'features' && <button aria-pressed={state.onlyProblems} onClick={() => state.setOnlyProblems(!state.onlyProblems)} className={`rounded-full border px-2 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500 ${state.onlyProblems ? 'border-amber-400 bg-amber-50 text-amber-800' : 'border-slate-300'}`}>Only missing or odd length</button>}
      <button aria-label="Expand all" data-tip="Expand all" onClick={() => foldAll(false)} className="h-[30px] w-[30px] rounded-lg border border-slate-300 bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500"><ExpandAllIcon /></button>
      <button aria-label="Collapse all" data-tip="Collapse all" onClick={() => foldAll(true)} className="h-[30px] w-[30px] rounded-lg border border-slate-300 bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500"><CollapseAllIcon /></button>
    </div>
  </div>;
}

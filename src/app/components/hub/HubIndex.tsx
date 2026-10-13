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

import { useEffect, useMemo, useRef } from 'react';
import type { SeqRecord } from '@/src/domain/bio/types';
import type { useHubState } from '@/src/app/hooks/useHubState';
import { buildSequenceSections } from '@/src/app/logic/hubModel';
import { buildFeatureGroups } from '@/src/app/logic/featureComparison';
import { isEdited, isPartial, isUnannotated, isolateOf } from '@/src/domain/bio/recordStatus';
import GroupByControl from './GroupByControl';
import GenomeStrip from './GenomeStrip';
export default function HubIndex({ records, state, onToggleRecordVisibility }: { records: SeqRecord[]; state: ReturnType<typeof useHubState>; onToggleRecordVisibility: (id: string) => void }) {
  const sections = useMemo(() => buildSequenceSections(records, state.filters, state.grouped ? { grouped: true, field: state.groupField } : { grouped: false }, state.sort), [records, state.filters, state.grouped, state.groupField, state.sort]);
  const features = useMemo(() => buildFeatureGroups(records, state.filters, state.onlyProblems), [records, state.filters, state.onlyProblems]);
  const foldKey = (group: string) => `${state.tab}:${state.groupField}:${group}`;
  const folds = state.indexFolds;
  const setFolds = state.setIndexFolds;
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = container.current;
    const active = el?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!el || !active) return;
    const bounds = el.getBoundingClientRect(), item = active.getBoundingClientRect();
    if (item.top < bounds.top) el.scrollTop += item.top - bounds.top;
    else if (item.bottom > bounds.bottom) el.scrollTop += item.bottom - bounds.bottom;
  }, [state.currentSectionKey]);
  const jump = (key: string) => state.setJumpTarget(prev => ({ key, serial: (prev?.serial ?? 0) + 1 }));
  const groups = state.tab === 'features' ? [...new Set(features.map(f => f.organism))] : [...new Set(sections.map(s => s.group))];
  return <section aria-label="Hub index" data-hub-focus tabIndex={0} className="flex min-h-0 flex-col gap-4 text-xs text-slate-300">
    <label>{state.tab === 'features' ? 'Limit to sequences' : 'Find sequence'}<input className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 p-2 focus-visible:ring-2 focus-visible:ring-env" value={state.filters.sequenceQuery} onChange={e => state.setFilters(f => ({ ...f, sequenceQuery: e.target.value }))} /></label>
    {state.tab === 'sequences' && <GroupByControl records={records} state={state} />}
    <label className="flex gap-2"><input type="checkbox" checked={state.filters.needsAttention} onChange={e => state.setFilters(f => ({ ...f, needsAttention: e.target.checked }))} />Needs attention</label>
    <label>Sort <select className="bg-slate-900 p-1" value={state.sort} onChange={e => state.setSort(e.target.value as typeof state.sort)}><option value="load">Load order</option><option value="accession">Accession</option><option value="fewest">Fewest annotations</option></select></label>
    <div ref={container} className="max-h-[55vh] overflow-y-auto custom-scrollbar-pro" aria-label="Index entries">
      {groups.map(group => <div key={group ?? 'list'}>
        {group && <button aria-label={`Fold index group ${group}`} aria-expanded={!folds.has(foldKey(group))} className="w-full py-3 text-left font-semibold" onClick={() => setFolds(prev => { const next = new Set(prev); if (next.has(foldKey(group))) next.delete(foldKey(group)); else next.add(foldKey(group)); return next; })}>{group} · {state.tab === 'features' ? features.filter(f => f.organism === group).length : sections.filter(s => s.group === group).length}</button>}
        {(!group || !folds.has(foldKey(group))) && (state.tab === 'features' ? features.filter(f => f.organism === group).map(f => <button key={f.key} aria-current={state.currentSectionKey === f.key} onClick={() => jump(f.key)} className="block w-full rounded-lg p-3 text-left aria-[current=true]:bg-slate-800">{f.identity} · in {f.counts.present} of {f.counts.pool}</button>) : sections.filter(s => s.group === group).map(({ record, rows, total }) => <div key={record.id} className={`mb-2 rounded-lg border border-slate-800 p-3 ${record.visible === false ? 'opacity-60' : ''}`}>
          <div className="flex items-center gap-2"><input type="checkbox" aria-label={`Select sequence ${record.id}`} checked={state.selectedRecords.has(record.id)} onChange={() => state.setSelectedRecords(prev => { const next = new Set(prev); if (next.has(record.id)) next.delete(record.id); else next.add(record.id); return next; })} />
            <button aria-label={`Jump to sequence ${record.id}`} aria-current={state.currentSectionKey === record.id} onClick={() => jump(record.id)} className="min-w-0 flex-1 text-left font-semibold aria-[current=true]:text-env">{record.label || record.accession || record.id}</button>
            <button aria-label={`${record.visible === false ? 'Show' : 'Hide'} ${record.id} in viewport`} onClick={() => onToggleRecordVisibility(record.id)} className="p-1"><i aria-hidden="true" className={`fas ${record.visible === false ? 'fa-eye-slash' : 'fa-eye'}`} /></button></div>
          <p className="mt-1 truncate text-slate-400">{isolateOf(record)}</p>
          <p className="my-2 text-slate-400">{rows.length === total ? total : `${rows.length}/${total}`} annotations {isUnannotated(record) && '· Unannotated'} {isPartial(record) && '· Partial'} {isEdited(record) && '· Edited'} {record.visible === false && '· hidden in viewport'}</p>
          <GenomeStrip record={record} highlight={feature => rows.includes(feature)} onPick={feature => jump(`${record.id}:${record.features.indexOf(feature)}`)} />
        </div>))}
      </div>)}
    </div>
    <p className="text-slate-500">/ Search · J/K Rows · [/ ] Groups · X Select · O Fold · Esc Clear</p>
  </section>;
}

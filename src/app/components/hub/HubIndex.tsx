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

import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef } from 'react';
import type { BioFeature, SeqRecord } from '@/src/domain/bio/types';
import type { useHubState } from '@/src/app/hooks/useHubState';
import { buildSequenceSections, type SequenceSection } from '@/src/app/logic/hubModel';
import { buildFeatureGroups, type FeatureGroup } from '@/src/app/logic/featureComparison';
import { isEdited, isPartial, isUnannotated, isolateOf } from '@/src/domain/bio/recordStatus';
import GroupByControl from './GroupByControl';
import GenomeStrip from './GenomeStrip';
import DisplayName from './DisplayName';
type IndexEntryProps = {
  section: SequenceSection; selected: boolean; current: boolean; featureColors?: Record<string, string>;
  setSelectedRecords: ReturnType<typeof useHubState>['setSelectedRecords'];
  jump: (key: string) => void; onToggleRecordVisibility: (id: string) => void;
};
const SequenceIndexEntry = memo(function SequenceIndexEntry({ section, selected, current, featureColors, setSelectedRecords, jump, onToggleRecordVisibility }: IndexEntryProps) {
  const { record, rows, total } = section;
  const highlight = useCallback((feature: BioFeature) => rows.includes(feature), [rows]);
  const pick = useCallback((feature: BioFeature) => jump(`${record.id}:${record.features.indexOf(feature)}`), [record, jump]);
  return <div className={`mb-2 rounded-lg border border-slate-800 p-3 ${record.visible === false ? 'opacity-60' : ''}`}>
          <div className="flex items-center gap-2"><input type="checkbox" aria-label={`Select sequence ${record.id}`} checked={selected} onChange={() => setSelectedRecords(prev => { const next = new Set(prev); if (next.has(record.id)) next.delete(record.id); else next.add(record.id); return next; })} />
            <button aria-label={`Jump to sequence ${record.id}`} aria-current={current} data-section-key={record.id} onClick={() => jump(record.id)} className="min-w-0 flex-1 text-left font-semibold aria-[current=true]:text-env"><DisplayName record={record} /></button>
            <button aria-label={`${record.visible === false ? 'Show' : 'Hide'} ${record.id} in viewport`} onClick={() => onToggleRecordVisibility(record.id)} className="p-1"><i aria-hidden="true" className={`fas ${record.visible === false ? 'fa-eye-slash' : 'fa-eye'}`} /></button></div>
          <p className="mt-1 truncate text-slate-400">{isolateOf(record)}</p>
          <p className="my-2 text-slate-400">{rows.length === total ? total : `${rows.length}/${total}`} annotations {isUnannotated(record) && '· Unannotated'} {isPartial(record) && '· Partial'} {isEdited(record) && '· Edited'} {record.visible === false && '· hidden in viewport'}</p>
          <GenomeStrip record={record} featureColors={featureColors} highlight={highlight} onPick={pick} />
        </div>;
});

const FeatureIndexEntry = memo(function FeatureIndexEntry({ group, current, jump }: { group: FeatureGroup; current: boolean; jump: (key: string) => void }) {
  return <button aria-current={current} data-section-key={group.key} onClick={() => jump(group.key)} className="block w-full rounded-lg p-3 text-left aria-[current=true]:bg-slate-800">{group.identity} · in {group.counts.present} of {group.counts.pool}</button>;
});

export default function HubIndex({ records, state, onToggleRecordVisibility, featureColors }: { records: SeqRecord[]; featureColors?: Record<string, string>; state: ReturnType<typeof useHubState>; onToggleRecordVisibility: (id: string) => void }) {
  const query = useDeferredValue(state.filters.query);
  const { types, strand, sequenceQuery, needsAttention, onlyIds } = state.filters;
  const filters = useMemo(() => ({ query, types, strand, sequenceQuery, needsAttention, onlyIds }), [query, types, strand, sequenceQuery, needsAttention, onlyIds]);
  const sections = useMemo(() => state.tab === 'sequences' ? buildSequenceSections(records, filters, state.grouped ? { grouped: true, field: state.groupField } : { grouped: false }, state.sort) : [], [records, filters, state.tab, state.grouped, state.groupField, state.sort]);
  const features = useMemo(() => state.tab === 'features' ? buildFeatureGroups(records, filters, state.onlyProblems) : [], [records, filters, state.tab, state.onlyProblems]);
  const foldKey = (group: string) => `${state.tab}:${state.groupField}:${group}`;
  const folds = state.indexFolds;
  const setFolds = state.setIndexFolds;
  const container = useRef<HTMLDivElement>(null);
  const geometry = useRef({ height: 0, entries: new Map<string, { top: number; bottom: number }>() });
  const currentKey = useRef(state.currentSectionKey);
  const reveal = useCallback((key: string | null) => {
    const el = container.current;
    const entry = key ? geometry.current.entries.get(key) : undefined;
    if (!el || !entry) return;
    if (entry.top < el.scrollTop) el.scrollTop = entry.top;
    else if (entry.bottom > el.scrollTop + geometry.current.height) el.scrollTop = entry.bottom - geometry.current.height;
  }, []);
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    // Layout reads stay outside scroll spy, which runs for every section transition.
    const measure = () => {
      const entries = new Map<string, { top: number; bottom: number }>();
      for (const entry of el.querySelectorAll<HTMLElement>('[data-section-key]')) {
        let top = entry.offsetTop;
        let parent = entry.offsetParent as HTMLElement | null;
        while (parent && parent !== el) { top += parent.offsetTop; parent = parent.offsetParent as HTMLElement | null; }
        entries.set(entry.dataset.sectionKey!, { top, bottom: top + entry.offsetHeight });
      }
      geometry.current = { height: el.clientHeight, entries };
      reveal(currentKey.current);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [sections, features, folds, reveal]);
  useEffect(() => {
    currentKey.current = state.currentSectionKey;
    reveal(state.currentSectionKey);
  }, [state.currentSectionKey, reveal]);
  const setJumpTarget = state.setJumpTarget;
  const jump = useCallback((key: string) => setJumpTarget(prev => ({ key, serial: (prev?.serial ?? 0) + 1 })), [setJumpTarget]);
  const groups = state.tab === 'features' ? [...new Set(features.map(f => f.organism))] : [...new Set(sections.map(s => s.group))];
  return <section aria-label="Hub index" data-hub-focus tabIndex={0} className="flex min-h-0 flex-col gap-4 text-xs text-slate-300">
    <label>{state.tab === 'features' ? 'Limit to sequences' : 'Find sequence'}<input className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 p-2 focus-visible:ring-2 focus-visible:ring-env" value={state.filters.sequenceQuery} onChange={e => state.setFilters(f => ({ ...f, sequenceQuery: e.target.value }))} /></label>
    {state.tab === 'sequences' && <GroupByControl records={records} state={state} />}
    <label className="flex gap-2"><input type="checkbox" checked={state.filters.needsAttention} onChange={e => state.setFilters(f => ({ ...f, needsAttention: e.target.checked }))} />Needs attention</label>
    <label>Sort <select className="bg-slate-900 p-1" value={state.sort} onChange={e => state.setSort(e.target.value as typeof state.sort)}><option value="load">Load order</option><option value="accession">Accession</option><option value="fewest">Fewest annotations</option></select></label>
    <div ref={container} className="relative max-h-[55vh] overflow-y-auto custom-scrollbar-pro" aria-label="Index entries">
      {groups.map(group => <div key={group ?? 'list'}>
        {group && <button aria-label={`Fold index group ${group}`} aria-expanded={!folds.has(foldKey(group))} className="w-full py-3 text-left font-semibold" onClick={() => setFolds(prev => { const next = new Set(prev); if (next.has(foldKey(group))) next.delete(foldKey(group)); else next.add(foldKey(group)); return next; })}>{group} · {state.tab === 'features' ? features.filter(f => f.organism === group).length : sections.filter(s => s.group === group).length}</button>}
        {(!group || !folds.has(foldKey(group))) && (state.tab === 'features' ? features.filter(f => f.organism === group).map(f => <FeatureIndexEntry key={f.key} group={f} current={state.currentSectionKey === f.key} jump={jump} />) : sections.filter(s => s.group === group).map(section => <SequenceIndexEntry key={section.record.id} section={section} selected={state.selectedRecords.has(section.record.id)} current={state.currentSectionKey === section.record.id} setSelectedRecords={state.setSelectedRecords} jump={jump} onToggleRecordVisibility={onToggleRecordVisibility} featureColors={featureColors} />))}
      </div>)}
    </div>
    <p className="text-slate-500">/ Search · J/K Rows · [/ ] Groups · X Select · O Fold · Esc Clear</p>
  </section>;
}

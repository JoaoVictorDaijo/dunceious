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

import { memo, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { VariableSizeList } from 'react-window';
import type { BioFeature, SeqRecord } from '@/src/domain/bio/types';
import type { useHubState } from '@/src/app/hooks/useHubState';
import { buildSequenceSections, type SequenceSection } from '@/src/app/logic/hubModel';
import { withHiddenCells } from '@/src/app/logic/hubVisibility';
import { buildFeatureGroups, type FeatureGroup } from '@/src/app/logic/featureComparison';
import { isEdited, isPartial, isUnannotated, isolateOf, needsAttention } from '@/src/domain/bio/recordStatus';
import { hubEditSummary } from '@/src/app/logic/hubEdits';
import SectionTitle from '../SectionTitle';
import GroupByControl from './GroupByControl';
import GenomeStrip from './GenomeStrip';
import DisplayName from './DisplayName';
import type { TrackWindow } from './trackWindow';
import { getFeatureColor } from '@/src/app/viewer/colors';
import { PRESENCE_CLASSES, presenceLabel, presenceStyle } from './presence';
type IndexEntryProps = {
  section: SequenceSection; selected: boolean; current: boolean; featureColors?: Record<string, string>; position: number; count: number; trackWindow: TrackWindow;
  setSelectedRecords: ReturnType<typeof useHubState>['setSelectedRecords'];
  hidden: boolean; jump: (key: string) => void; onToggleHubHidden: (id: string) => void;
};
const SequenceIndexEntry = memo(function SequenceIndexEntry({ section, selected, current, featureColors, setSelectedRecords, jump, hidden, onToggleHubHidden, position, count, trackWindow }: IndexEntryProps) {
  const { record, rows, total } = section;
  const highlight = useCallback((feature: BioFeature) => rows.includes(feature), [rows]);
  const pick = useCallback((feature: BioFeature) => jump(`${record.id}:${record.features.indexOf(feature)}`), [record, jump]);
  return <div data-index-card onClick={event => { if (!(event.target as Element).closest('input, button')) jump(record.id); }} role="listitem" aria-current={current} aria-setsize={count} aria-posinset={position} className={`relative mx-0.5 mb-2 flex cursor-pointer h-[110px] flex-col gap-1 rounded-2xl border bg-slate-900 p-2.5 transition-transform hover:-translate-y-0.5 motion-reduce:transition-none ${current ? 'border-amber-500/65 shadow-lg shadow-amber-500/15' : 'border-slate-800'} ${hidden ? 'opacity-60' : ''}`}>
    {current && <span aria-hidden="true" className="absolute inset-y-3 left-0 w-[3px] rounded-r bg-env" />}
    <div className="flex min-w-0 items-center gap-1.5">
      <input type="checkbox" aria-label={`Select sequence ${record.id}`} checked={selected} onChange={() => setSelectedRecords(prev => { const next = new Set(prev); if (next.has(record.id)) next.delete(record.id); else next.add(record.id); return next; })} />
      <button aria-label={`Jump to sequence ${record.id}`} aria-current={current} data-section-key={record.id} onClick={() => jump(record.id)} className={`min-w-0 flex-1 text-left font-mono font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500 ${current ? 'text-amber-200' : 'text-slate-100'}`}><DisplayName record={record} /></button>
      {needsAttention(record) && <span aria-label="Needs attention" data-tip="This sequence needs attention" className="text-[10px] text-amber-300"><i aria-hidden="true" className="fas fa-triangle-exclamation" /></span>}
      <span className="whitespace-nowrap font-mono text-[10px] text-slate-400">{rows.length === total ? total : `${rows.length}/${total}`} annot.</span>
      <button aria-label={`${hidden ? 'Show' : 'Hide'} ${record.id} in hub`} data-tip={hidden ? 'Show in hub' : 'Hide in hub'} onClick={() => onToggleHubHidden(record.id)} className="p-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500"><i aria-hidden="true" className={`fas ${hidden ? 'fa-eye-slash' : 'fa-eye'}`} /></button>
    </div>
    <div className="min-w-0 text-[10px] text-slate-400"><p className="truncate">{isolateOf(record)} · <span className="font-mono">{record.sequence.length.toLocaleString('en-US')} {record.moleculeType === 'protein' ? 'aa' : 'bp'}</span></p>
      <div className="flex h-4 gap-1 overflow-hidden"><span className="shrink-0 font-mono text-amber-200">{hubEditSummary(record.features)}</span>{[isUnannotated(record) && 'Unannotated', isPartial(record) && 'Partial', isEdited(record) && 'Edited', hidden && 'Hidden in hub'].filter(Boolean).map(flag => <span key={String(flag)} className="whitespace-nowrap rounded bg-slate-800 px-1 text-[9px]">{flag}</span>)}</div>
    </div>
    <GenomeStrip trackWindow={trackWindow} record={record} featureColors={featureColors} highlight={highlight} onPick={pick} />
  </div>;
});
const FEATURE_INDEX_HEIGHT = 64;
function presencePreviewCount(total: number, width: number): number {
  let count = Math.min(total, 24);
  while (count > 0) {
    const omitted = total - count;
    const suffixWidth = omitted ? (String(omitted).length + 1) * 6 + 2 : 0;
    if (count * 8 + (count - 1) * 2 + suffixWidth <= width) break;
    count--;
  }
  return count;
}
const FeatureIndexEntry = memo(function FeatureIndexEntry({ group, current, jump, position, count, featureColors, width }: { group: FeatureGroup; current: boolean; jump: (key: string) => void; position: number; count: number; featureColors?: Record<string, string>; width: number }) {
  const color = group.types.length === 1 ? getFeatureColor(group.types[0], featureColors) : undefined;
  // Reserve the list gutter and card chrome so the overflow count stays visible.
  const previewCount = presencePreviewCount(group.cells.length, width - 34);
  const omitted = group.cells.length - previewCount;
  return <div role="listitem" aria-setsize={count} aria-posinset={position}>
    <button aria-label={`${group.identity} · in ${group.counts.present} of ${group.counts.pool}`} aria-current={current} data-section-key={group.key} onClick={() => jump(group.key)} style={{ height: FEATURE_INDEX_HEIGHT - 8 }} className={`relative mx-0.5 mb-2 flex w-[calc(100%-4px)] flex-col justify-center gap-1.5 rounded-2xl border bg-slate-900 px-2.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500 ${current ? 'border-amber-500/65 shadow-lg shadow-amber-500/15' : 'border-slate-800 hover:border-slate-700'}`}>
      {current && <span aria-hidden="true" className="absolute inset-y-3 left-0 w-[3px] rounded-r bg-env" />}
      <span className="flex w-full min-w-0 items-center gap-1.5">
        <span data-tip={group.identity} className={`min-w-0 flex-1 truncate font-mono font-semibold ${current ? 'text-amber-200' : 'text-slate-100'}`}>{group.identity}</span>
        <span className="flex min-w-0 gap-1 overflow-hidden">{group.types.map(type => <span key={type} data-type-swatch data-tip={type} aria-hidden="true" className="h-[9px] w-[9px] shrink-0 rounded" style={{ backgroundColor: getFeatureColor(type, featureColors) }} />)}</span>
        <span className="ml-auto shrink-0 font-mono text-[10px] text-slate-400">{group.counts.present}/{group.counts.pool}</span>
      </span>
      {hubEditSummary(group.rows.map(row => row.feature)) && <span className="font-mono text-[10px] text-amber-200">{hubEditSummary(group.rows.map(row => row.feature))}</span>}
      <span className="flex h-3 w-full items-center gap-0.5 overflow-hidden">
        {group.cells.slice(0, previewCount).map(cell => <span key={cell.recordId} data-presence-state={cell.state} data-tip={`${cell.recordId}: ${presenceLabel(cell.state)}`} aria-hidden="true" className={`shrink-0 rounded-sm ${PRESENCE_CLASSES[cell.state]}`} style={{ ...presenceStyle(cell.state, color), width: 8, height: 8 }} />)}
        {omitted > 0 && <span style={{ width: (String(omitted).length + 1) * 6 }} className="shrink-0 font-mono text-[9px] text-slate-400">+{omitted}</span>}
      </span>
    </button>
  </div>;
});
type IndexItem = { key: string; size: number } & ({ type: 'group'; group: string; count: number; foldKey: string } | { type: 'sequence'; section: SequenceSection; position: number } | { type: 'feature'; group: FeatureGroup; position: number });
function IndexRow({ index, style, data }: { index: number; style: React.CSSProperties; data: (index: number, style: React.CSSProperties) => React.ReactNode }) { return data(index, style); }
export default function HubIndex({ records, state, featureColors }: { records: SeqRecord[]; featureColors?: Record<string, string>; state: ReturnType<typeof useHubState> }) {
  const query = useDeferredValue(state.filters.query);
  const { types, strand, sequenceQuery, needsAttention: attention, onlyIds, editedOnly } = state.filters;
  const filters = useMemo(() => ({ query, types, strand, sequenceQuery, needsAttention: attention, onlyIds, editedOnly }), [query, types, strand, sequenceQuery, attention, onlyIds, editedOnly]);
  const sections = useMemo(() => state.tab === 'sequences' ? buildSequenceSections(records, filters, state.grouped ? { grouped: true, field: state.groupField } : { grouped: false }, state.sort) : [], [records, filters, state.tab, state.grouped, state.groupField, state.sort]);
  const hubRecords = useMemo(() => records.filter(record => !state.hubHidden.has(record.id)), [records, state.hubHidden]);
  const features = useMemo(() => state.tab === 'features' ? withHiddenCells(buildFeatureGroups(hubRecords, filters, state.onlyProblems), records, state.hubHidden, filters) : [], [hubRecords, records, state.hubHidden, filters, state.tab, state.onlyProblems]);
  const folds = state.indexFolds;
  const attentionCount = useMemo(() => records.filter(needsAttention).length, [records]);
  const visibleCount = state.tab === 'sequences' ? sections.filter(section => !state.hubHidden.has(section.key)).length : new Set(features.flatMap(group => group.rows.map(row => row.record.id))).size;
  const entries = useMemo(() => {
    const buckets = new Map<string | null, (SequenceSection | FeatureGroup)[]>();
    for (const item of state.tab === 'sequences' ? sections : features) {
      const group = state.tab === 'sequences' ? (item as SequenceSection).group : (item as FeatureGroup).organism;
      const values = buckets.get(group) ?? []; values.push(item); buckets.set(group, values);
    }
    const result: IndexItem[] = [];
    let position = 0;
    for (const [group, values] of buckets) {
      const foldKey = `${state.tab}:${state.groupField}:${group}`;
      if (group) result.push({ type: 'group', key: `group:${group}`, group, foldKey, count: values.length, size: 36 });
      for (const item of values) {
        position++;
        if (group && folds.has(foldKey)) continue;
        result.push(state.tab === 'sequences' ? { type: 'sequence', key: item.key, section: item as SequenceSection, position, size: 118 } : { type: 'feature', key: item.key, group: item as FeatureGroup, position, size: FEATURE_INDEX_HEIGHT });
      }
    }
    return result;
  }, [sections, features, state.tab, state.groupField, folds]);
  const container = useRef<HTMLDivElement>(null);
  const list = useRef<VariableSizeList>(null);
  const scrollElement = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  const [height, setHeight] = useState(600);
  const reveal = useCallback((key: string | null) => {
    const index = entries.findIndex(entry => entry.key === key);
    if (index < 0) return;
    const firstInGroup = entries[index - 1]?.type === 'group';
    list.current?.scrollToItem(firstInGroup ? index - 1 : index, firstInGroup ? 'start' : 'smart');
  }, [entries]);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const measure = () => {
      if (element.clientHeight) setHeight(element.clientHeight);
      const viewport = scrollElement.current;
      const scrollbarWidth = viewport ? Math.max(0, viewport.offsetWidth - viewport.clientWidth) : 0;
      if (element.clientWidth) setWidth(element.clientWidth - scrollbarWidth);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') { window.addEventListener('resize', measure); return () => window.removeEventListener('resize', measure); }
    const observer = new ResizeObserver(measure); observer.observe(element); return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => { list.current?.resetAfterIndex(0); reveal(state.currentSectionKey); }, [entries, height, state.currentSectionKey, reveal]);
  const setJumpTarget = state.setJumpTarget;
  const showInHub = state.showInHub;
  const jump = useCallback((key: string) => { if (state.tab === 'sequences') { const record = records.find(record => key === record.id || record.features.some((_, index) => key === `${record.id}:${index}`)); if (record) showInHub(record.id); } reveal(key); setJumpTarget(prev => ({ key, serial: (prev?.serial ?? 0) + 1 })); }, [setJumpTarget, reveal, state.tab, records, showInHub]);
  const renderEntry = (index: number, style: React.CSSProperties) => {
    const entry = entries[index];
    if (entry.type === 'group') return <div style={style}><button aria-label={`Fold index group ${entry.group}`} aria-expanded={!folds.has(entry.foldKey)} data-tip={entry.group} className="flex h-9 w-full items-center gap-2 text-left font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500" onClick={() => state.setIndexFolds(prev => { const next = new Set(prev); if (next.has(entry.foldKey)) next.delete(entry.foldKey); else next.add(entry.foldKey); return next; })}><i aria-hidden="true" className={`fas fa-chevron-down text-[9px] transition-transform motion-reduce:transition-none ${folds.has(entry.foldKey) ? '-rotate-90' : ''}`} /><span className="min-w-0 flex-1 truncate">{entry.group}</span><span className="rounded-full bg-slate-900 px-1.5 font-mono text-[10px] text-slate-400">{entry.count}</span></button></div>;
    if (entry.type === 'feature') return <div style={style}><FeatureIndexEntry group={entry.group} width={width} featureColors={featureColors} current={state.currentSectionKey === entry.key} jump={jump} position={entry.position} count={features.length} /></div>;
    return <div style={style}><SequenceIndexEntry section={entry.section} selected={state.selectedRecords.has(entry.key)} current={state.currentSectionKey === entry.key} setSelectedRecords={state.setSelectedRecords} jump={jump} hidden={state.hubHidden.has(entry.key)} onToggleHubHidden={state.toggleHubHidden} featureColors={featureColors} trackWindow={state.trackWindow} position={entry.position} count={sections.length} /></div>;
  };
  return <section aria-label="Hub index" data-hub-focus tabIndex={0} className="flex min-h-0 flex-1 flex-col gap-3 text-xs text-slate-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500">
    <SectionTitle icon="fa-list-ul" trailing={<span className="font-mono text-[11px] text-slate-500">{visibleCount}</span>}>Sequence index</SectionTitle>
    <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3"><i className="fas fa-magnifying-glass text-slate-500" aria-hidden="true" /><input aria-label={state.tab === 'features' ? 'Limit to sequences' : 'Find sequence'} placeholder={state.tab === 'features' ? 'Limit to sequences' : 'Find sequence'} className="h-9 min-w-0 flex-1 bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500" value={state.filters.sequenceQuery} onChange={e => state.setFilters(f => ({ ...f, sequenceQuery: e.target.value }))} /></div>
    {state.tab === 'sequences' && <GroupByControl records={records} state={state} />}
    <div className="flex flex-wrap items-center gap-2"><button aria-label="Needs attention" aria-pressed={state.filters.needsAttention} onClick={() => state.setFilters(f => ({ ...f, needsAttention: !f.needsAttention }))} className={`flex items-center gap-1.5 rounded-full border px-2 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500 ${state.filters.needsAttention ? 'border-amber-500/60 bg-amber-500/10 text-amber-200' : 'border-slate-800 text-slate-400'}`}><i className="fas fa-triangle-exclamation" aria-hidden="true" />Needs attention <span className="font-mono">{attentionCount}</span></button>
    <label className="ml-auto text-slate-500">Sort <select aria-label="Sort" className="rounded-lg border border-slate-800 bg-slate-900 p-1 text-[10px] text-slate-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500" value={state.sort} onChange={e => state.setSort(e.target.value as typeof state.sort)}><option value="load">Load order</option><option value="accession">Accession</option><option value="fewest">Fewest annotations</option></select></label></div>
    {state.hubHidden.size > 0 && <button onClick={() => state.setHubHidden(new Set())} className="self-start rounded-full border border-amber-500/60 bg-amber-500/10 px-2 py-1 text-amber-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500">{state.hubHidden.size} hidden · Show all</button>}
    <div ref={container} className="relative min-h-0 flex-1" aria-label="Index entries"><VariableSizeList ref={list} outerRef={scrollElement} height={height} width="100%" itemCount={entries.length} itemSize={index => entries[index].size} itemKey={index => entries[index].key} itemData={renderEntry} overscanCount={4} className="custom-scrollbar-pro" style={{ scrollbarGutter: 'stable', paddingRight: 8 }}>{IndexRow}</VariableSizeList></div>
  </section>;
}

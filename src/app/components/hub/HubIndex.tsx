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

import { forwardRef, memo, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { VariableSizeList } from 'react-window';
import type { BioFeature, SeqRecord } from '@/src/domain/bio/types';
import type { useHubState } from '@/src/app/hooks/useHubState';
import { buildSequenceSections, type SequenceSection, type SortOrder } from '@/src/app/logic/hubModel';
import { withHiddenCells } from '@/src/app/logic/hubVisibility';
import { buildFeatureGroups, type FeatureGroup } from '@/src/app/logic/featureComparison';
import { isEdited, isPartial, isUnannotated, isolateOf, needsAttention } from '@/src/domain/bio/recordStatus';
import { hubEditSummary } from '@/src/app/logic/hubEdits';
import WorkspaceTitleActions from '../WorkspaceTitleActions';
import SectionTitle from '../SectionTitle';
import GroupByControl from './GroupByControl';
import GenomeStrip from './GenomeStrip';
import DisplayName from './DisplayName';
import type { TrackWindow } from './trackWindow';
import { getFeatureColor } from '@/src/app/viewer/colors';
type IndexEntryProps = {
  section: SequenceSection; selected: boolean; current: boolean; featureColors?: Record<string, string>; position: number; count: number; trackWindow: TrackWindow;
  setSelectedRecords: ReturnType<typeof useHubState>['setSelectedRecords'];
  hidden: boolean; jump: (key: string) => void; onToggleHubHidden: (id: string) => void;
};
const SequenceIndexEntry = memo(function SequenceIndexEntry({ section, selected, current, featureColors, setSelectedRecords, jump, hidden, onToggleHubHidden, position, count, trackWindow }: IndexEntryProps) {
  const { record, rows, total } = section;
  const editSummary = hubEditSummary(record.features);
  const flags = [isUnannotated(record) && 'Unannotated', isPartial(record) && 'Partial', isEdited(record) && 'Edited', hidden && 'Hidden in hub'].filter(Boolean);
  const highlight = useCallback((feature: BioFeature) => rows.includes(feature), [rows]);
  const pick = useCallback((feature: BioFeature) => jump(`${record.id}:${record.features.indexOf(feature)}`), [record, jump]);
  return <div data-index-card data-sequence-id={record.id} data-state={hidden ? 'hidden' : 'visible'} onClick={event => { if (!(event.target as Element).closest('input, button')) jump(record.id); }} role="listitem" aria-current={current} aria-setsize={count} aria-posinset={position} className={`relative mx-0.5 mb-2 flex cursor-pointer h-[110px] flex-col gap-1 rounded-2xl border bg-slate-900 p-2.5 transition-transform hover:-translate-y-0.5 motion-reduce:transition-none ${current ? 'border-amber-500/65 shadow-lg shadow-amber-500/15' : 'border-slate-800'} ${hidden ? 'opacity-60' : ''}`}>
    {current && <span aria-hidden="true" className="absolute inset-y-3 left-0 w-[3px] rounded-r bg-env" />}
    <div className="flex min-w-0 items-center gap-1.5">
      <input type="checkbox" aria-label={`Select sequence ${record.id}`} checked={selected} onChange={() => setSelectedRecords(prev => { const next = new Set(prev); if (next.has(record.id)) next.delete(record.id); else next.add(record.id); return next; })} />
      <button aria-label={`Jump to sequence ${record.id}`} aria-current={current} data-section-key={record.id} onClick={() => jump(record.id)} className={`min-w-0 flex-1 text-left font-mono font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500 ${current ? 'text-amber-200' : 'text-slate-100'}`}><DisplayName record={record} /></button>
      {needsAttention(record) && <span aria-label="Needs attention" data-tip="This sequence needs attention" className="text-[10px] text-amber-300"><i aria-hidden="true" className="fas fa-triangle-exclamation" /></span>}
      <span className="whitespace-nowrap font-mono text-[10px] text-slate-400">{rows.length === total ? total : `${rows.length}/${total}`} annot.</span>
      <button aria-label={`${hidden ? 'Show' : 'Hide'} ${record.id} in hub`} data-tip={hidden ? 'Show in hub' : 'Hide in hub'} onClick={() => onToggleHubHidden(record.id)} className="p-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500"><i aria-hidden="true" className={`fas ${hidden ? 'fa-eye-slash' : 'fa-eye'}`} /></button>
    </div>
    <div className="min-w-0 text-[10px] text-slate-400"><p className="truncate">{isolateOf(record)} · <span className="font-mono">{record.sequence.length.toLocaleString('en-US')} {record.moleculeType === 'protein' ? 'aa' : 'bp'}</span></p>
      <div className="flex h-4 gap-1 overflow-hidden">{editSummary && <span className="shrink-0 font-mono text-amber-200">{editSummary}{flags.length > 0 && ' · '}</span>}{flags.map(flag => <span key={String(flag)} className="whitespace-nowrap rounded bg-slate-800 px-1 text-[9px]">{flag}</span>)}</div>
    </div>
    <GenomeStrip trackWindow={trackWindow} record={record} featureColors={featureColors} highlight={highlight} onPick={pick} />
  </div>;
});
// One compact line per feature: about three times as many fit on screen as the earlier cards.
const FEATURE_INDEX_HEIGHT = 32;
const FeatureIndexEntry = memo(function FeatureIndexEntry({ group, current, jump, position, count, featureColors }: { group: FeatureGroup; current: boolean; jump: (key: string) => void; position: number; count: number; featureColors?: Record<string, string> }) {
  const edits = hubEditSummary(group.rows.map(row => row.feature));
  return <div role="listitem" aria-setsize={count} aria-posinset={position}>
    <button aria-label={`${group.identity} · in ${group.counts.present} of ${group.counts.pool}`} aria-current={current} data-state={current ? 'current' : 'default'} data-section-key={group.key} data-tip={group.identity} onClick={() => jump(group.key)} style={{ height: FEATURE_INDEX_HEIGHT - 2 }} className={`mx-0.5 flex w-[calc(100%-4px)] items-center gap-2 rounded-lg border px-2.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500 ${current ? 'border-env bg-env/10' : 'border-transparent hover:bg-slate-900'}`}>
      <span className={`min-w-0 flex-1 truncate font-mono font-semibold ${current ? 'text-amber-200' : 'text-slate-100'}`}>{group.identity}</span>
      {edits && <i data-edit-mark data-tip={edits} aria-label={edits} className="fas fa-pen shrink-0 text-[9px] text-amber-300" />}
      <span className="flex shrink-0 gap-1">{group.types.map(type => <span key={type} data-type-swatch data-tip={type} aria-hidden="true" className="h-[7px] w-[7px] rounded-full" style={{ backgroundColor: getFeatureColor(type, featureColors) }} />)}</span>
      <span className="w-8 shrink-0 text-right font-mono text-[10px] text-slate-400">{group.counts.present}/{group.counts.pool}</span>
    </button>
  </div>;
});
type IndexItem = { key: string; size: number } & ({ type: 'group'; group: string; count: number; foldKey: string } | { type: 'sequence'; section: SequenceSection; position: number } | { type: 'feature'; group: FeatureGroup; position: number });
const SEQUENCE_SORTS: [SortOrder, string][] = [['load', 'Load order'], ['accession', 'Accession (A–Z)'], ['fewest', 'Fewest annotations first']];
function SequenceSort({ state }: { state: ReturnType<typeof useHubState> }) {
  return <label data-sequence-sort data-tip="Order of the sequences in the index and the list" className="ml-auto flex h-[26px] min-w-0 items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900 pl-2.5 pr-1 text-slate-400 focus-within:outline focus-within:outline-2 focus-within:outline-amber-500">
    <i aria-hidden="true" className="fas fa-arrow-down-wide-short text-[11px]" />
    <select aria-label="Sort sequences" className="min-w-0 max-w-full cursor-pointer truncate bg-transparent pr-1 text-xs text-slate-200 focus:outline-none" value={state.sort} onChange={e => state.setSort(e.target.value as SortOrder)}>{SEQUENCE_SORTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
  </label>;
}

const IndexViewport = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(function IndexViewport(props, ref) { return <div {...props} ref={ref} data-index-viewport />; });
function IndexRow({ index, style, data }: { index: number; style: React.CSSProperties; data: (index: number, style: React.CSSProperties) => React.ReactNode }) { return data(index, style); }
export default function HubIndex({ records, state, featureColors, onAddSequences, addLocked = false, onExportProjectJson, onClearAll, locked = false, empty = records.length === 0 }: { records: SeqRecord[]; featureColors?: Record<string, string>; state: ReturnType<typeof useHubState>; onAddSequences?: () => void; addLocked?: boolean; onExportProjectJson?: () => void; onClearAll?: () => void; locked?: boolean; empty?: boolean }) {
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
    };
    measure();
    if (typeof ResizeObserver === 'undefined') { window.addEventListener('resize', measure); return () => window.removeEventListener('resize', measure); }
    const observer = new ResizeObserver(measure); observer.observe(element); return () => observer.disconnect();
  }, []);
  const previousReveal = useRef<{ revision: number; tab: typeof state.tab; grouped: boolean; groupField: typeof state.groupField } | null>(null);
  const pendingContextReveal = useRef(true);
  useLayoutEffect(() => { list.current?.resetAfterIndex(0); }, [entries, height]);
  useLayoutEffect(() => {
    const previous = previousReveal.current;
    if (!previous || previous.tab !== state.tab || previous.grouped !== state.grouped || previous.groupField !== state.groupField) pendingContextReveal.current = true;
    if (previous && previous.revision !== state.currentSectionRevealRevision) {
      reveal(state.currentSectionKey);
      pendingContextReveal.current = false;
    } else if (pendingContextReveal.current && entries.some(entry => entry.key === state.currentSectionKey)) {
      // A tab can restore its current section after the index has rendered its new entries.
      reveal(state.currentSectionKey);
      pendingContextReveal.current = false;
    }
    previousReveal.current = { revision: state.currentSectionRevealRevision, tab: state.tab, grouped: state.grouped, groupField: state.groupField };
  }, [state.currentSectionKey, state.currentSectionRevealRevision, state.tab, state.grouped, state.groupField, entries, reveal]);
  const setJumpTarget = state.setJumpTarget;
  const showInHub = state.showInHub;
  const jump = useCallback((key: string) => { if (state.tab === 'sequences') { const record = records.find(record => key === record.id || record.features.some((_, index) => key === `${record.id}:${index}`)); if (record) showInHub(record.id); } reveal(key); setJumpTarget(prev => ({ key, serial: (prev?.serial ?? 0) + 1 })); }, [setJumpTarget, reveal, state.tab, records, showInHub]);
  const renderEntry = (index: number, style: React.CSSProperties) => {
    const entry = entries[index];
    if (entry.type === 'group') return <div data-index-row={entry.key} style={style}><button aria-label={`Fold index group ${entry.group}`} aria-expanded={!folds.has(entry.foldKey)} data-tip={entry.group} className="flex h-9 w-full items-center gap-2 text-left font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500" onClick={() => state.setIndexFolds(prev => { const next = new Set(prev); if (next.has(entry.foldKey)) next.delete(entry.foldKey); else next.add(entry.foldKey); return next; })}><i aria-hidden="true" className={`fas fa-chevron-down text-[9px] transition-transform motion-reduce:transition-none ${folds.has(entry.foldKey) ? '-rotate-90' : ''}`} /><span className="min-w-0 flex-1 truncate">{entry.group}</span><span className="rounded-full bg-slate-900 px-1.5 font-mono text-[10px] text-slate-400">{entry.count}</span></button></div>;
    if (entry.type === 'feature') return <div data-index-row={entry.key} style={style}><FeatureIndexEntry group={entry.group} featureColors={featureColors} current={state.currentSectionKey === entry.key} jump={jump} position={entry.position} count={features.length} /></div>;
    return <div data-index-row={entry.key} style={style}><SequenceIndexEntry section={entry.section} selected={state.selectedRecords.has(entry.key)} current={state.currentSectionKey === entry.key} setSelectedRecords={state.setSelectedRecords} jump={jump} hidden={state.hubHidden.has(entry.key)} onToggleHubHidden={state.toggleHubHidden} featureColors={featureColors} trackWindow={state.trackWindow} position={entry.position} count={sections.length} /></div>;
  };
  return <section aria-label="Hub index" data-hub-focus tabIndex={0} className="hub-index flex min-h-0 flex-1 flex-col gap-3 text-xs text-slate-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500">
    <SectionTitle fixedHeight icon="fa-list-ul" trailing={<span className="flex min-w-0 items-center gap-1 whitespace-nowrap font-mono text-[11px] text-slate-500">{state.hubHidden.size > 0 && <button aria-label="Show all" data-tip="Show all" onClick={() => state.setHubHidden(new Set())} className="hub-hidden-chip inline-flex h-[22px] shrink-0 items-center gap-1 rounded-full border border-env/50 bg-env/10 px-1.5 font-sans text-[10px] text-amber-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-env"><i aria-hidden="true" className="fas fa-eye-slash" /><span>{state.hubHidden.size}<span className="hub-hidden-words"> hidden</span></span><span className="hub-hidden-words font-semibold text-white underline">Show all</span></button>}<span>{state.hubHidden.size ? `${visibleCount}/${records.length}` : visibleCount}</span><WorkspaceTitleActions onAddSequences={onAddSequences} addLocked={addLocked} onExportProjectJson={onExportProjectJson} onClearAll={onClearAll} locked={locked} empty={empty} /></span>}>Sequence index</SectionTitle>
    <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3"><i className="fas fa-magnifying-glass text-slate-500" aria-hidden="true" /><input aria-label={state.tab === 'features' ? 'Limit to sequences' : 'Find sequence'} placeholder={state.tab === 'features' ? 'Limit to sequences' : 'Find sequence'} className="h-9 min-w-0 flex-1 bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500" value={state.filters.sequenceQuery} onChange={e => state.setFilters(f => ({ ...f, sequenceQuery: e.target.value }))} /></div>
    {state.tab === 'sequences' && <GroupByControl records={records} state={state} />}
    <div className="flex items-center gap-2"><button aria-label="Needs attention" aria-pressed={state.filters.needsAttention} onClick={() => state.setFilters(f => ({ ...f, needsAttention: !f.needsAttention }))} className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500 ${state.filters.needsAttention ? 'border-amber-500/60 bg-amber-500/10 text-amber-200' : 'border-slate-800 text-slate-400'}`}><i className="fas fa-triangle-exclamation" aria-hidden="true" />Needs attention <span className="font-mono">{attentionCount}</span></button>{state.tab === 'sequences' && <SequenceSort state={state} />}</div>

    <div ref={container} className="relative min-h-0 flex-1" aria-label="Index entries"><VariableSizeList ref={list} outerRef={scrollElement} outerElementType={IndexViewport} height={height} width="100%" itemCount={entries.length} itemSize={index => entries[index].size} itemKey={index => entries[index].key} itemData={renderEntry} overscanCount={4} className="custom-scrollbar-pro" style={{ scrollbarGutter: 'stable', paddingRight: 8 }}>{IndexRow}</VariableSizeList></div>
  </section>;
}

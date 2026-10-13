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

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { VariableSizeList } from 'react-window';
import { buildSequenceSections, matchesSequenceFilters, type SequenceSection } from '@/src/app/logic/hubModel';
import type { FeatureGroup } from '@/src/app/logic/featureComparison';
import type { useHubState } from '@/src/app/hooks/useHubState';
import type { BioFeature, SeqRecord, QuantitativeTrack, SequenceDetails } from '@/src/domain/bio/types';
import { featureFocusTarget, type FocusTarget } from '@/src/app/logic/focusTarget';
import type { HubFocusOrigin } from '../AnnotationHubPanel';
import SequenceSectionHeader from './SequenceSectionHeader';
import FeatureSectionHeader, { featureSectionHeight } from './FeatureSectionHeader';
import AnnotationRow from './AnnotationRow';
import OverviewRail from './OverviewRail';
import DetailsEditor from './DetailsEditor';
import { DisplayNameEditor } from './DisplayName';

type HubState = ReturnType<typeof useHubState>;
type Entry = { key: string; sectionKey: string; size: number } & (
  { type: 'header'; item: SequenceSection | FeatureGroup } | { type: 'divider'; label: string; count: number }
  | { type: 'row'; record: SeqRecord; feature: BioFeature } | { type: 'track'; record: SeqRecord; track: QuantitativeTrack }
  | { type: 'empty'; record: SeqRecord } | { type: 'spacer' } | { type: 'editor'; record: SeqRecord; editor: 'details' | 'name' });
export interface HubListProps {
  items: SequenceSection[] | FeatureGroup[]; kind: 'sequences' | 'features'; state: HubState;
  records?: SeqRecord[]; onNotice?: (message: string) => void;
  height?: number; featureColors?: Record<string, string>; lastFocusedKey?: string | null; currentRowKey?: string | null;
  isAlignmentLocked?: boolean;
  onSetRecordDetails?: (id: string, details: SequenceDetails) => void;
  onSetRecordLabel?: (id: string, label: string) => void;
  onFocusItem?: (target: FocusTarget, origin: HubFocusOrigin) => void;
  onViewFeatureDetails?: (recordId: string, feature: BioFeature) => void;
  onEditFeature?: (recordId: string, index: number, feature: BioFeature) => void;
  onRemoveFeature?: (recordId: string, index: number) => void;
  onToggleRecordVisibility?: (id: string) => void; onImportAnnotations?: () => void;
  onCurrentRow?: (key: string) => void; addLog?: (message: string) => void;
}
function VirtualRow({ index, style, data }: { index: number; style: React.CSSProperties; data: (index: number, style: React.CSSProperties) => React.ReactNode }) {
  return data(index, style);
}

export default function HubList({ items, kind, state, records = [], onNotice, height: providedHeight, featureColors, lastFocusedKey, currentRowKey, isAlignmentLocked, onFocusItem, onViewFeatureDetails, onEditFeature, onRemoveFeature, onToggleRecordVisibility, onImportAnnotations, onCurrentRow, addLog, onSetRecordDetails, onSetRecordLabel }: HubListProps) {
  const list = useRef<VariableSizeList>(null);
  const container = useRef<HTMLDivElement>(null);
  const [measuredHeight, setMeasuredHeight] = useState(600);
  const [hovered, setHovered] = useState<BioFeature | null>(null);
  const [editingName, setEditingName] = useState<string | null>(null);
  const editor = useMemo(() => state.editingDetails ? { id: state.editingDetails, kind: 'details' as const } : editingName ? { id: editingName, kind: 'name' as const } : null, [state.editingDetails, editingName]);
  const closeEditor = () => { state.setEditingDetails(null); setEditingName(null); };
  const height = providedHeight ?? measuredHeight;
  const filtering = Boolean(state.filters.query.trim() || state.filters.types.size || state.filters.strand !== 'all' || state.filters.sequenceQuery || state.filters.needsAttention || state.filters.onlyIds || state.onlyProblems && kind === 'features');
  const folded = useCallback((key: string) => filtering ? state.searchFolds.has(`${kind}:${key}`) : state.collapsed[kind].has(key), [filtering, state.searchFolds, state.collapsed, kind]);
  const fold = (key: string) => {
    const toggle = (prev: Set<string>, target: string) => { const next = new Set(prev); if (next.has(target)) next.delete(target); else next.add(target); return next; };
    if (filtering) state.setSearchFolds(prev => toggle(prev, `${kind}:${key}`));
    else state.setCollapsed(prev => ({ ...prev, [kind]: toggle(prev[kind], key) }));
  };
  const entries = useMemo(() => {
    const result: Entry[] = [];
    let previousGroup: string | null = null;
    for (const item of items) {
      const group = kind === 'sequences' ? (item as SequenceSection).group : (item as FeatureGroup).organism;
      if (group && group !== previousGroup) {
        result.push({ type: 'divider', key: `divider:${group}`, sectionKey: item.key, size: 32, label: group, count: items.filter(other => (kind === 'sequences' ? (other as SequenceSection).group : (other as FeatureGroup).organism) === group).length });
      }
      previousGroup = group;
      result.push({ type: 'header', key: item.key, sectionKey: item.key, size: kind === 'features' ? featureSectionHeight(item as FeatureGroup, folded(item.key)) : folded(item.key) ? 96 : state.density === 'compact' ? 132 : 148, item });
      if (kind === 'sequences' && editor?.id === item.key) result.push({ type: 'editor', key: `${item.key}:editor`, sectionKey: item.key, size: editor.kind === 'details' ? 440 : 112, record: (item as SequenceSection).record, editor: editor.kind });
      if (folded(item.key)) continue;
      const rowSize = state.density === 'compact' ? 44 : 64;
      if (kind === 'sequences') {
        const section = item as SequenceSection;
        (section.tracks ?? section.record.tracks ?? []).forEach(track => result.push({ type: 'track', key: `${section.record.id}:track:${track.id}`, sectionKey: item.key, size: rowSize, record: section.record, track }));
        section.rows.forEach(feature => result.push({ type: 'row', key: `${section.record.id}:${section.record.features.indexOf(feature)}`, sectionKey: item.key, size: rowSize, record: section.record, feature }));
        if (!section.total) result.push({ type: 'empty', key: `${item.key}:empty`, sectionKey: item.key, size: 60, record: section.record });
      } else (item as FeatureGroup).rows.forEach(({ record, feature }) => result.push({ type: 'row', key: `${record.id}:${record.features.indexOf(feature)}`, sectionKey: item.key, size: rowSize, record, feature }));
    }
    const lastHeader = result.map(entry => entry.type).lastIndexOf('header');
    const lastSize = result.slice(lastHeader).reduce((sum, entry) => sum + entry.size, 0);
    if (lastHeader >= 0 && lastSize < height) result.push({ type: 'spacer', key: 'end-space', sectionKey: result[lastHeader].sectionKey, size: height - lastSize });
    return result;
  }, [items, kind, folded, state.density, height, editor]);
  const starts = useMemo(() => { let start = 0; return entries.map(entry => { const value = start; start += entry.size; return value; }); }, [entries]);
  const total = entries.reduce((sum, entry) => sum + entry.size, 0);
  const maxOffset = Math.max(0, total - height);
  const offset = Math.min(state.scrollOffset[kind], maxOffset);
  let pinnedIndex = entries.findIndex(entry => entry.type === 'header');
  for (let i = 0; i < entries.length; i++) if (starts[i] <= offset && entries[i].type === 'header') pinnedIndex = i;
  const pinned = entries[pinnedIndex];
  useEffect(() => {
    if (providedHeight !== undefined || !container.current) return;
    const observer = new ResizeObserver(values => { if (values[0]?.contentRect.height) setMeasuredHeight(values[0].contentRect.height); });
    observer.observe(container.current); return () => observer.disconnect();
  }, [providedHeight]);
  useLayoutEffect(() => { list.current?.resetAfterIndex(0); }, [entries]);
  useLayoutEffect(() => { list.current?.scrollTo(offset); }, [offset]);
  useEffect(() => { state.setCurrentSectionKey(pinned?.sectionKey ?? null); }, [pinned?.sectionKey, state.setCurrentSectionKey]);
  const open = useCallback((key: string) => {
    state.setCollapsed(prev => { const next = new Set(prev[kind]); next.delete(key); return { ...prev, [kind]: next }; });
    state.setSearchFolds(prev => { const next = new Set(prev); next.delete(`${kind}:${key}`); return next; });
  }, [kind, state.setCollapsed, state.setSearchFolds]);
  const pending = state.jumpTarget?.key;
  useEffect(() => {
    if (!pending) return;
    let sectionKey = items.find(item => item.key === pending)?.key;
    if (!sectionKey) for (const item of items) {
      const rows = kind === 'sequences' ? (item as SequenceSection).rows.map(feature => ({ record: (item as SequenceSection).record, feature })) : (item as FeatureGroup).rows;
      if (rows.some(({ record, feature }) => `${record.id}:${record.features.indexOf(feature)}` === pending) || kind === 'sequences' && (item as SequenceSection).record.tracks?.some(t => `${item.key}:track:${t.id}` === pending)) { sectionKey = item.key; break; }
    }
    if (sectionKey && folded(sectionKey)) { open(sectionKey); return; }
    const index = entries.findIndex(entry => entry.key === pending);
    if (index >= 0) {
      const entry = entries[index];
      const headerIndex = entries.findIndex(other => other.type === 'header' && other.key === entry.sectionKey);
      const headerHeight = entries[headerIndex]?.size ?? 0;
      const position = entry.type === 'header' ? starts[index] : starts[index] - headerHeight - Math.max(0, (height - headerHeight - entry.size) / 2);
      list.current?.scrollTo(Math.max(starts[headerIndex] ?? 0, Math.min(position, maxOffset)));
      state.setJumpTarget(null);
    }
  }, [pending, state.jumpTarget?.serial, entries, items, kind, folded, open, starts, height, maxOffset, state.setJumpTarget]);
  const jump = (key: string) => state.setJumpTarget(prev => ({ key, serial: (prev?.serial ?? 0) + 1 }));
  const sequenceJump = (key: string) => {
    const record = records.find(record => record.id === key);
    if (record) {
      const sequenceHidden = !matchesSequenceFilters(record, state.filters);
      const noSequenceFilters = { ...state.filters, sequenceQuery: '', needsAttention: false, onlyIds: undefined };
      const annotationHidden = !buildSequenceSections([record], noSequenceFilters, { grouped: false }, 'load').length;
      if (sequenceHidden || annotationHidden) {
        state.setFilters(prev => ({ ...prev,
          ...(annotationHidden ? { query: '', types: new Set<string>(), strand: 'all' as const } : {}),
          ...(sequenceHidden ? { sequenceQuery: '', needsAttention: false, onlyIds: undefined } : {}),
        }));
        const cleared = annotationHidden ? sequenceHidden ? 'Search, type and sequence filters' : 'Search and type filters' : 'Sequence filters';
        onNotice?.(`${cleared} cleared to show ${record.label || record.accession || record.id}`);
      }
    }
    state.setTab('sequences'); jump(key);
  };
  const edit = (id: string, kind: 'details' | 'name') => {
    open(id); state.setEditingDetails(kind === 'details' ? id : null); setEditingName(kind === 'name' ? id : null); jump(id);
  };
  const header = (entry: Entry) => {
    if (entry.type !== 'header') return null;
    if (kind === 'features') return <FeatureSectionHeader records={records} group={entry.item as FeatureGroup} folded={folded(entry.key)} onFold={() => fold(entry.key)} onSequence={sequenceJump} />;
    const section = entry.item as SequenceSection;
    return <SequenceSectionHeader section={section} featureColors={featureColors} folded={folded(entry.key)} selected={state.selectedRecords.has(section.record.id)} onFold={() => fold(entry.key)} onSelect={() => state.setSelectedRecords(prev => { const next = new Set(prev); if (next.has(section.record.id)) next.delete(section.record.id); else next.add(section.record.id); return next; })} onVisibility={() => onToggleRecordVisibility?.(section.record.id)} highlight={hovered} onEditDetails={onSetRecordDetails ? () => edit(section.record.id, 'details') : undefined} onRename={onSetRecordLabel ? () => edit(section.record.id, 'name') : undefined} onPick={feature => jump(`${section.record.id}:${section.record.features.indexOf(feature)}`)} />;
  };
  const renderEntry = (index: number, style: React.CSSProperties) => {
    const entry = entries[index];
    if (entry.type === 'editor') return <div style={style}>{entry.editor === 'details' ? <DetailsEditor record={entry.record} onSave={details => { onSetRecordDetails?.(entry.record.id, details); closeEditor(); }} onCancel={closeEditor} /> : <DisplayNameEditor record={entry.record} onSave={label => { onSetRecordLabel?.(entry.record.id, label); closeEditor(); }} onCancel={closeEditor} />}</div>;
    if (entry.type === 'spacer') return <div style={style} />;
    if (entry.type === 'header') return <div style={{ ...style, visibility: index === pinnedIndex ? 'hidden' : undefined }}>{header(entry)}</div>;
    if (entry.type === 'divider') return <div style={style} className="bg-slate-100 px-5 py-2 text-xs font-semibold text-slate-600">{entry.label} · {entry.count}</div>;
    if (entry.type === 'empty') return <div style={style} className="px-5 py-4 text-xs text-slate-500">No annotations on this sequence <button className="ml-3 text-amber-700 underline" onClick={onImportAnnotations}>Import annotations…</button></div>;
    if (entry.type === 'track') {
      const start = entry.track.data.length ? Math.min(...entry.track.data.map(point => point.start)) : 0;
      const end = entry.track.data.length ? Math.max(...entry.track.data.map(point => point.end)) : 0;
      return <div style={style} data-row-key={entry.key} className="flex items-center gap-4 border-b border-slate-100 px-5 text-xs text-slate-600"><span>track</span><strong className="flex-1">{entry.track.name}{lastFocusedKey === entry.key && <span className="ml-2 text-amber-700">Last focused</span>}</strong><span>{entry.track.data.length} data points</span><button aria-label={`Inspect track ${entry.track.name}`} onClick={() => addLog?.(`Track: ${entry.track.name} · ${entry.track.data.length} data points`)}>Inspect</button><button onClick={() => onFocusItem?.({ recordId: entry.record.id, start, end, label: entry.track.name, length: end - start }, { key: entry.key, label: entry.track.name })}>Open in viewport</button></div>;
    }
    const indexOfFeature = entry.record.features.indexOf(entry.feature);
    return <div style={style}><AnnotationRow record={entry.record} feature={entry.feature} rowKey={entry.key} kind={kind} selected={state.selectedRows.has(entry.key)} current={currentRowKey === entry.key} lastFocused={lastFocusedKey === entry.key} featureColors={featureColors} locked={isAlignmentLocked} onCurrent={() => onCurrentRow?.(entry.key)} onHover={setHovered} onSelect={() => state.setSelectedRows(prev => { const next = new Set(prev); if (next.has(entry.key)) next.delete(entry.key); else next.add(entry.key); return next; })} onInspect={() => onViewFeatureDetails?.(entry.record.id, entry.feature)} onEdit={() => onEditFeature?.(entry.record.id, indexOfFeature, entry.feature)} onDelete={() => onRemoveFeature?.(entry.record.id, indexOfFeature)} onFocus={() => onFocusItem?.(featureFocusTarget(entry.record, entry.feature), { key: entry.key, label: entry.feature.name })} /></div>;
  };
  const blocks = entries.flatMap((entry, i) => entry.type === 'header' ? [{ key: entry.key, label: kind === 'sequences' ? (entry.item as SequenceSection).record.id : (entry.item as FeatureGroup).identity, start: starts[i], size: (starts[entries.findIndex((other, j) => j > i && other.type === 'header')] ?? total) - starts[i] }] : []);
  return <div ref={container} className="relative flex min-h-0 flex-1" style={providedHeight ? { height } : undefined}>
    <div className="relative min-w-0 flex-1">
      <VariableSizeList ref={list} height={height} width="100%" itemCount={entries.length} itemSize={index => entries[index].size} itemKey={index => entries[index].key} initialScrollOffset={offset} itemData={renderEntry} onScroll={({ scrollOffset }) => state.setScrollOffset(prev => prev[kind] === scrollOffset ? prev : { ...prev, [kind]: scrollOffset })} className="custom-scrollbar-pro scrollbar-on-light">{VirtualRow}</VariableSizeList>
      {pinned?.type === 'header' && <div role="region" aria-label="Pinned section" className="absolute left-0 right-0 top-0 z-10 shadow-sm" style={{ height: pinned.size, top: Math.max(0, starts[pinnedIndex] - offset) }}>{header(pinned)}</div>}
    </div>
    <OverviewRail blocks={blocks} total={total} offset={offset} height={height} hits={state.filters.query ? entries.flatMap((entry, i) => entry.type === 'row' || entry.type === 'track' ? [starts[i]] : []) : []} onJump={value => { state.setJumpTarget(null); list.current?.scrollTo(value); }} />
  </div>;
}

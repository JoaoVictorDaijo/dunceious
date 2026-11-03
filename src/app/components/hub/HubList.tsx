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

import { useUiEffects } from '@/src/app/components/uiEffects';
import { forwardRef, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { VariableSizeList } from 'react-window';
import { buildSequenceSections, matchesSequenceFilters, type SequenceSection } from '@/src/app/logic/hubModel';
import type { FeatureGroup } from '@/src/app/logic/featureComparison';
import type { useHubState } from '@/src/app/hooks/useHubState';
import type { BioFeature, SeqRecord, QuantitativeTrack, SequenceDetails, DetailKey } from '@/src/domain/bio/types';
import { splitWrapAround } from '@/src/domain/bio/intervals';
import { readDetails } from '@/src/domain/bio/details';
import { isolateOf } from '@/src/domain/bio/recordStatus';
import { featureFocusTarget, type FocusTarget } from '@/src/app/logic/focusTarget';
import type { HubFocusOrigin } from '../AnnotationHubPanel';
import SequenceSectionHeader, { sequenceSectionHeight } from './SequenceSectionHeader';
import FeatureSectionHeader, { featureSectionHeight } from './FeatureSectionHeader';
import AnnotationRow from './AnnotationRow';
import SlimSectionBar from './SlimSectionBar';
import { COMPACT_HEADER_GAP, HEADER_GAP, SLIM_BAR_HEIGHT, slimBarHeight, listBounds, sectionsAt as computeSections, cardBounds, pinnedGeometry, jumpOffset } from '@/src/app/logic/hubListGeometry';
import GroupedInner, { CardContext } from './GroupedInner';
import OverviewRail, { railThumb } from './OverviewRail';
import DetailsEditor, { detailsEditorHeight } from './DetailsEditor';
import { DisplayNameEditor } from './DisplayName';

type HubState = ReturnType<typeof useHubState>;
type Entry = { key: string; sectionKey: string; size: number } & (
  { type: 'header'; item: SequenceSection | FeatureGroup } | { type: 'divider'; label: string; count: number }
  | { type: 'row'; record: SeqRecord; feature: BioFeature } | { type: 'track'; record: SeqRecord; track: QuantitativeTrack }
  | { type: 'empty'; record: SeqRecord } | { type: 'spacer' } | { type: 'editor'; record: SeqRecord; editor: 'details' | 'name' });
export interface HubListProps {
  items: SequenceSection[] | FeatureGroup[]; kind: 'sequences' | 'features'; state: HubState;
  filtersPending?: boolean; records?: SeqRecord[]; onNotice?: (message: string) => void;
  height?: number; featureColors?: Record<string, string>; lastFocusedKey?: string | null; currentRowKey?: string | null;
  isAlignmentLocked?: boolean;
  onSetRecordDetails?: (id: string, details: SequenceDetails) => void;
  onSetRecordLabel?: (id: string, label: string) => void;
  onFocusItem?: (target: FocusTarget, origin: HubFocusOrigin) => void;
  onViewFeatureDetails?: (recordId: string, feature: BioFeature) => void;
  onEditFeature?: (recordId: string, index: number, feature: BioFeature) => void;
  onRemoveFeature?: (recordId: string, index: number) => void;
  onImportAnnotations?: () => void;
  onCurrentRow?: (key: string) => void; addLog?: (message: string) => void;
}
const trackBoundsCache = new WeakMap<QuantitativeTrack, { start: number; end: number }>();
function trackBounds(track: QuantitativeTrack) {
  const cached = trackBoundsCache.get(track);
  if (cached) return cached;
  let start = track.data.length ? Infinity : 0;
  let end = track.data.length ? -Infinity : 0;
  for (const point of track.data) {
    start = Math.min(start, point.start);
    end = Math.max(end, point.end);
  }
  const bounds = { start, end };
  trackBoundsCache.set(track, bounds);
  return bounds;
}

function VirtualRow({ index, style, data }: { index: number; style: React.CSSProperties; data: (index: number, style: React.CSSProperties) => React.ReactNode }) {
  return data(index, style);
}

const ScrollRegion = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(function ScrollRegion(props, ref) {
  return <div {...props} ref={ref} data-hub-scroll-region tabIndex={0} role="region" aria-label="Annotations" />;
});

function HubList({ items, kind, state, filtersPending, records = [], onNotice, height: providedHeight, featureColors, lastFocusedKey, currentRowKey, isAlignmentLocked, onFocusItem, onViewFeatureDetails, onEditFeature, onRemoveFeature, onImportAnnotations, onCurrentRow, addLog, onSetRecordDetails, onSetRecordLabel }: HubListProps) {
  const { confirm, compactHubCards } = useUiEffects();
  // A phone's Hub gets the slim strip and a thin gutter so annotation rows reach the first
  // screen; `DEFAULT_UI_EFFECTS` keeps the workbench on the full card.
  const headerGap = compactHubCards ? COMPACT_HEADER_GAP : HEADER_GAP;
  const slimStrip = compactHubCards;
  const [wideDetails, setWideDetails] = useState(() => window.matchMedia?.('(min-width: 1280px)').matches ?? false);
  useEffect(() => {
    const media = window.matchMedia?.('(min-width: 1280px)');
    if (!media) return;
    const update = () => setWideDetails(media.matches);
    update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const workspaceRevision = useRef(state.workspaceRevision.current);
  workspaceRevision.current = state.workspaceRevision.current;
  const scrollOffset = useRef(state.scrollOffset[kind]);
  const savedOffsets = useRef(state.scrollOffset);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinnedElement = useRef<HTMLDivElement>(null);
  const expandedLayer = useRef<HTMLDivElement>(null);
  const compactLayer = useRef<HTMLDivElement>(null);
  const scrollElement = useRef<HTMLDivElement>(null);
  const railIndicator = useRef<HTMLDivElement>(null);
  const [, setSections] = useState<{ bar: string | null; current: string | null } | null>(null);
  const jumpLanding = useRef<{ key: string; offset: number } | null>(null);
  if (state.scrollOffset !== savedOffsets.current) {
    savedOffsets.current = state.scrollOffset;
    scrollOffset.current = state.scrollOffset[kind];
  }
  const list = useRef<VariableSizeList>(null);
  const container = useRef<HTMLDivElement>(null);
  const [listWidth, setListWidth] = useState(1000);
  useLayoutEffect(() => {
    const element = scrollElement.current;
    if (!element) return;
    const measure = () => { if (element.clientWidth) setListWidth(element.clientWidth); };
    measure();
    if (typeof ResizeObserver === 'undefined') { window.addEventListener('resize', measure); return () => window.removeEventListener('resize', measure); }
    const observer = new ResizeObserver(measure); observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const cardWidth = Math.max(0, listWidth - 30);
  const [measuredHeight, setMeasuredHeight] = useState(600);
  const [hovered, setHovered] = useState<BioFeature | null>(null);
  const { editingName, setEditingName, draft, setDraft } = state;
  const editor = useMemo(() => state.editingDetails ? { id: state.editingDetails, kind: 'details' as const } : editingName ? { id: editingName, kind: 'name' as const } : null, [state.editingDetails, editingName]);
  const closeEditor = () => { state.setEditingDetails(null); setEditingName(null); setDraft(null); };
  const height = providedHeight ?? measuredHeight;
  const filtering = Boolean(state.filters.query.trim() || state.filters.types.size || state.filters.strand !== 'all' || state.filters.editedOnly || state.filters.sequenceQuery || state.filters.needsAttention || state.filters.onlyIds || state.onlyProblems && kind === 'features');
  const folded = useCallback((key: string) => filtering ? state.searchFolds.has(`${kind}:${key}`) : state.collapsed[kind].has(key), [filtering, state.searchFolds, state.collapsed, kind]);
  const fold = useCallback((key: string) => {
    const toggle = (prev: Set<string>, target: string) => { const next = new Set(prev); if (next.has(target)) next.delete(target); else next.add(target); return next; };
    if (filtering) state.setSearchFolds(prev => toggle(prev, `${kind}:${key}`));
    else state.setCollapsed(prev => ({ ...prev, [kind]: toggle(prev[kind], key) }));
  }, [filtering, kind, state.setSearchFolds, state.setCollapsed]);
  const entries = useMemo(() => {
    const result: Entry[] = [];
    let previousGroup: string | null = null;
    for (const item of items) {
      const group = kind === 'sequences' ? (item as SequenceSection).group : (item as FeatureGroup).organism;
      if (group && group !== previousGroup) {
        result.push({ type: 'divider', key: `divider:${group}`, sectionKey: item.key, size: 32, label: group, count: items.filter(other => (kind === 'sequences' ? (other as SequenceSection).group : (other as FeatureGroup).organism) === group).length });
      }
      previousGroup = group;
      result.push({ type: 'header', key: item.key, sectionKey: item.key, size: kind === 'features' ? featureSectionHeight(item as FeatureGroup, folded(item.key), cardWidth, headerGap) : sequenceSectionHeight(item as SequenceSection, folded(item.key), featureColors, state.density, headerGap, slimStrip), item });
      if (kind === 'sequences' && editor?.id === item.key) result.push({ type: 'editor', key: `${item.key}:editor`, sectionKey: item.key, size: editor.kind === 'details' ? detailsEditorHeight((item as SequenceSection).record, draft?.id === item.key ? draft.details ?? {} : {}, wideDetails) : 112, record: (item as SequenceSection).record, editor: editor.kind });
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
  }, [items, kind, folded, state.density, height, editor, featureColors, draft, wideDetails, cardWidth, headerGap, slimStrip]);
  const sectionKeys = useMemo(() => new Set(items.map(item => item.key)), [items]);
  const { starts, total, maxOffset } = useMemo(() => listBounds(entries, height), [entries, height]);
  const offset = Math.min(scrollOffset.current, maxOffset);
  scrollOffset.current = offset;
  const sectionsAt = (value: number) => {
    const next = computeSections(entries, starts, sectionKeys, height, value, jumpLanding.current);
    jumpLanding.current = next.jumpLanding;
    return next;
  };
  const sections = sectionsAt(offset);
  const pinnedIndex = sections.barIndex;
  const pinned = entries[pinnedIndex];
  const currentSection = sections.current;
  const activeSections = useRef(sections);
  activeSections.current = sections;
  const saveOffset = useCallback(() => {
    // A reset can unmount the list before it receives the new workspace offsets.
    if (workspaceRevision.current !== state.workspaceRevision.current) return;
    const value = scrollOffset.current;
    state.setScrollOffset(prev => prev[kind] === value ? prev : { ...prev, [kind]: value });
  }, [kind, state.setScrollOffset, state.workspaceRevision]);
  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveOffset();
  }, [saveOffset]);
  const cards = useMemo(() => cardBounds(entries, starts, folded), [entries, starts, folded]);
  const barHeight = (index: number) => entries[index]?.type === 'header' ? slimBarHeight(entries[index].item as SequenceSection | FeatureGroup, kind, featureColors) : SLIM_BAR_HEIGHT;
  const geometry = (index: number, value: number) => pinnedGeometry(entries, starts, cards, index, value, barHeight(index), entries[index] ? folded(entries[index].key) : false, headerGap);
  const paintBar = (index: number, value: number) => {
    const element = pinnedElement.current;
    if (!element) return;
    const { compactProgress: progress, visible, top, overlayHeight } = geometry(index, value);
    element.style.display = visible ? '' : 'none';
    element.style.top = `${top}px`;
    element.style.height = `${overlayHeight}px`;
    element.dataset.compact = String(progress >= 0.5);
    if (expandedLayer.current) expandedLayer.current.style.opacity = String(1 - progress);
    if (compactLayer.current) compactLayer.current.style.opacity = String(progress);
  };
  const updateWindow = (index: number, value: number) => {
    const header = entries[index];
    if (kind !== 'sequences' || header?.type !== 'header' || folded(header.key)) { state.trackWindow.update(null); return; }
    const bar = geometry(index, value);
    const top = Math.max(starts[index] + header.size, value + (bar.visible ? Math.max(0, bar.overlayHeight + bar.top) : 0));
    const visible = entries.flatMap((entry, i) => entry.sectionKey === header.sectionKey && entry.type === 'row' && starts[i] + entry.size > top && starts[i] < value + height ? [entry.feature] : []);
    const record = (header.item as SequenceSection).record;
    const parts = visible.flatMap(feature => feature.segments?.length ? feature.segments : [feature])
      .flatMap(part => splitWrapAround(part.start, part.end, record.sequence.length));
    // One enclosing band spans the linear strip; origin-crossing rows therefore cover both ends.
    state.trackWindow.update(parts.length ? { id: record.id, length: record.sequence.length, start: Math.min(...parts.map(part => part.start)), end: Math.max(...parts.map(part => part.end)) } : null);
  };
  useLayoutEffect(() => { updateWindow(pinnedIndex, offset); paintBar(pinnedIndex, offset); }, [entries, offset, pinnedIndex]);
  const onScroll = ({ scrollOffset: value, scrollUpdateWasRequested = false }: { scrollOffset: number; scrollUpdateWasRequested?: boolean }) => {
    const navigated = value !== scrollOffset.current && !scrollUpdateWasRequested;
    scrollOffset.current = Math.min(value, maxOffset);
    const next = sectionsAt(scrollOffset.current);
    if (navigated) state.setCurrentSectionKey(next.current);
    updateWindow(next.barIndex, scrollOffset.current);
    if (next.bar !== activeSections.current.bar || next.current !== activeSections.current.current) {
      activeSections.current = next;
      setSections(next);
    }
    paintBar(next.barIndex, scrollOffset.current);
    if (railIndicator.current) { const thumb = railThumb(total, height, scrollOffset.current); railIndicator.current.style.top = `${thumb.top}px`; railIndicator.current.style.height = `${thumb.size}px`; }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(saveOffset, 150);
  };
  useEffect(() => {
    if (providedHeight !== undefined || !container.current) return;
    const observer = new ResizeObserver(values => { if (values[0]?.contentRect.height) setMeasuredHeight(values[0].contentRect.height); });
    observer.observe(container.current); return () => observer.disconnect();
  }, [providedHeight]);
  useLayoutEffect(() => { list.current?.resetAfterIndex(0); }, [entries]);
  // The list reports its scroll before this parent effect runs, so the render-time offset can already be stale here.
  useLayoutEffect(() => { list.current?.scrollTo(scrollOffset.current); }, [offset]);
  useEffect(() => { state.setCurrentSectionKey(currentSection, false); }, [currentSection, state.setCurrentSectionKey]);
  const open = useCallback((key: string) => {
    state.setCollapsed(prev => { const next = new Set(prev[kind]); next.delete(key); return { ...prev, [kind]: next }; });
    state.setSearchFolds(prev => { const next = new Set(prev); next.delete(`${kind}:${key}`); return next; });
  }, [kind, state.setCollapsed, state.setSearchFolds]);
  const landJump = (key: string, value: number) => {
    jumpLanding.current = { key, offset: value };
    onScroll({ scrollOffset: value });
    state.setCurrentSectionKey(key);
    list.current?.scrollTo(value);
    // Until the list commits, a scroll event still reads the position the jump leaves and would win over the jump.
    if (scrollElement.current) scrollElement.current.scrollTop = value;
  };
  const pending = state.jumpTarget?.key;
  useEffect(() => {
    if (!pending || filtersPending || kind !== state.tab) return;
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
      const headerHeight = barHeight(headerIndex);
      landJump(entry.sectionKey, jumpOffset(entry, starts[index], starts[headerIndex] ?? 0, headerHeight, height, maxOffset));
    }
    state.setJumpTarget(null);
  }, [pending, filtersPending, state.tab, state.jumpTarget?.serial, entries, items, kind, folded, open, starts, height, maxOffset, state.setJumpTarget]);
  const jump = useCallback((key: string) => state.setJumpTarget(prev => ({ key, serial: (prev?.serial ?? 0) + 1 })), [state.setJumpTarget]);
  const sequenceJump = useCallback((key: string) => {
    const record = records.find(record => record.id === key);
    if (record) {
      const sequenceHidden = !matchesSequenceFilters(record, state.filters);
      const noSequenceFilters = { ...state.filters, sequenceQuery: '', needsAttention: false, onlyIds: undefined };
      const annotationHidden = !buildSequenceSections([record], noSequenceFilters, { grouped: false }, 'load').length;
      if (sequenceHidden || annotationHidden) {
        state.setFilters(prev => ({ ...prev,
          ...(annotationHidden ? { query: '', types: new Set<string>(), strand: 'all', editedOnly: false as const } : {}),
          ...(sequenceHidden ? { sequenceQuery: '', needsAttention: false, onlyIds: undefined } : {}),
        }));
        const cleared = annotationHidden ? sequenceHidden ? 'Search, type and sequence filters' : 'Search and type filters' : 'Sequence filters';
        onNotice?.(`${cleared} cleared to show ${record.label || record.accession || record.id}`);
      }
    }
    state.showInHub(key); state.setTab('sequences'); jump(key);
  }, [records, state.filters, state.setFilters, state.setTab, state.showInHub, jump, onNotice]);
  const edit = useCallback((id: string, kind: 'details' | 'name', field: DetailKey = 'organism') => {
    state.setDetailsField(field);
    if (editor?.id === id && editor.kind === kind) { open(id); jump(id); return; }
    const record = records.find(record => record.id === draft?.id);
    const currentDetails = record ? readDetails(record) : {};
    const dirty = draft && (Object.entries(draft.details ?? {}).some(([key, value]) => value !== (currentDetails[key as keyof SequenceDetails] ?? ''))
      || draft.label !== undefined && draft.label !== (record?.label ?? ''));
    if (dirty && !confirm('Discard unsaved changes to open another editor?')) return;
    setDraft({ id }); open(id); state.setEditingDetails(kind === 'details' ? id : null); setEditingName(kind === 'name' ? id : null); jump(id);
  }, [confirm, editor, draft, records, setDraft, setEditingName, open, state.setEditingDetails, jump]);
  const headerActions = useMemo(() => new Map(items.map(item => [item.key, {
    onFold: () => fold(item.key),
    onSelect: () => state.setSelectedRecords(prev => { const next = new Set(prev); if (next.has(item.key)) next.delete(item.key); else next.add(item.key); return next; }),
    onVisibility: () => state.toggleHubHidden(item.key),
    onEditDetails: onSetRecordDetails ? (field?: DetailKey) => edit(item.key, 'details', field) : undefined,
    onRename: onSetRecordLabel ? () => edit(item.key, 'name') : undefined,
    onPick: (feature: BioFeature) => {
      if (kind === 'sequences') { const section = item as SequenceSection;
        const record = section.record;
        if (!section.rows.includes(feature)) {
          state.setFilters(prev => ({ ...prev, query: '', types: new Set<string>(), strand: 'all', editedOnly: false }));
          onNotice?.(`Search and type filters cleared to show ${record.label || record.accession || record.id}`);
        }
        jump(`${record.id}:${record.features.indexOf(feature)}`); }
    },
  }] as const)), [items, kind, fold, state.setSelectedRecords, state.toggleHubHidden, onSetRecordDetails, onSetRecordLabel, edit, jump, state.setFilters, onNotice]);
  const pinnedFeature = (section: SequenceSection) => {
    const index = section.record.features.findIndex((_, i) => `${section.record.id}:${i}` === currentRowKey);
    return index < 0 ? null : section.record.features[index];
  };
  const header = (entry: Entry, gap = headerGap) => {
    if (entry.type !== 'header') return null;
    if (kind === 'features') return <FeatureSectionHeader featureColors={featureColors} current={entry.key === currentSection} width={cardWidth} gap={gap} records={records} group={entry.item as FeatureGroup} folded={folded(entry.key)} onFold={headerActions.get(entry.key)!.onFold} onSequence={sequenceJump} />;
    const section = entry.item as SequenceSection;
    return <SequenceSectionHeader pinned={pinnedFeature(section)} gap={gap} slimStrip={slimStrip} density={state.density} current={entry.key === currentSection} searching={Boolean(state.filters.query)} trackWindow={state.trackWindow} section={section} featureColors={featureColors} folded={folded(entry.key)} selected={state.selectedRecords.has(section.record.id)} {...headerActions.get(entry.key)!} highlight={hovered && section.record.features.includes(hovered) ? hovered : null} />;
  };
  const renderEntry = (index: number, style: React.CSSProperties) => {
    const entry = entries[index];
    if (entry.type === 'editor') return <div data-hub-entry={entry.key} style={style}>{entry.editor === 'details' ? <DetailsEditor wide={wideDetails} focusRequest={state.detailsFocusRequest} focusField={state.detailsField} record={entry.record} draft={draft?.id === entry.record.id ? draft.details ?? {} : {}} onChange={details => setDraft({ id: entry.record.id, details })} onSave={details => { onSetRecordDetails?.(entry.record.id, details); closeEditor(); }} onCancel={closeEditor} /> : <DisplayNameEditor record={entry.record} label={draft?.id === entry.record.id ? draft.label ?? entry.record.label ?? '' : entry.record.label ?? ''} onChange={label => setDraft({ id: entry.record.id, label })} onSave={label => { onSetRecordLabel?.(entry.record.id, label); closeEditor(); }} onCancel={closeEditor} />}</div>;
    if (entry.type === 'spacer') return <div data-hub-entry={entry.key} style={style} />;
    if (entry.type === 'header') return <div data-hub-entry={entry.key} style={style}>{header(entry)}</div>;
    if (entry.type === 'divider') return <div data-hub-entry={entry.key} style={style} className="bg-slate-100 px-5 py-2 text-xs font-semibold text-slate-600">{entry.label} · {entry.count}</div>;
    if (entry.type === 'empty') return <div data-hub-entry={entry.key} style={style} className="px-5 py-4 text-xs text-slate-500">No annotations on this sequence <button className="ml-3 text-amber-700 underline" onClick={onImportAnnotations}>Import annotations…</button></div>;
    if (entry.type === 'track') {
      const { start, end } = trackBounds(entry.track);
      return <div data-hub-entry={entry.key} style={style} data-row-key={entry.key} className="flex items-center gap-4 border-b border-slate-100 px-5 text-xs text-slate-600"><span>track</span><strong className="flex-1">{entry.track.name}{lastFocusedKey === entry.key && <span className="ml-2 text-amber-700">Last focused</span>}</strong><span>{entry.track.data.length} data points</span><button aria-label={`Inspect track ${entry.track.name}`} onClick={() => addLog?.(`Track: ${entry.track.name} · ${entry.track.data.length} data points`)}>Inspect</button><button onClick={() => onFocusItem?.({ recordId: entry.record.id, start, end, label: entry.track.name, length: end - start }, { key: entry.key, label: entry.track.name })}>Open in viewport</button></div>;
    }
    const indexOfFeature = entry.record.features.indexOf(entry.feature);
    return <div data-hub-entry={entry.key} style={style} ><AnnotationRow record={entry.record} feature={entry.feature} rowKey={entry.key} kind={kind} selected={state.selectedRows.has(entry.key)} current={currentRowKey === entry.key} lastFocused={lastFocusedKey === entry.key} featureColors={featureColors} locked={isAlignmentLocked} onCurrent={() => onCurrentRow?.(entry.key)} onHover={setHovered} onSelect={() => state.setSelectedRows(prev => { const next = new Set(prev); if (next.has(entry.key)) next.delete(entry.key); else next.add(entry.key); return next; })} onInspect={() => onViewFeatureDetails?.(entry.record.id, entry.feature)} onEdit={() => onEditFeature?.(entry.record.id, indexOfFeature, entry.feature)} onDelete={() => onRemoveFeature?.(entry.record.id, indexOfFeature)} onFocus={() => onFocusItem?.(featureFocusTarget(entry.record, entry.feature), { key: entry.key, label: entry.feature.name })} /></div>;
  };
  const blocks = useMemo(() => {
    const result: { key: string; label: string; tip: string; start: number; size: number }[] = [];
    entries.forEach((entry, index) => {
      if (entry.type !== 'header') return;
      const previous = result.at(-1);
      if (previous) previous.size = starts[index] - previous.start;
      const record = kind === 'sequences' ? (entry.item as SequenceSection).record : null;
      const label = record ? record.id : (entry.item as FeatureGroup).identity;
      const tip = record ? [record.accession || record.id, record.label || isolateOf(record)].filter(Boolean).join(' · ') : label;
      result.push({ key: entry.key, label, tip, start: starts[index], size: total - starts[index] });
    });
    return result;
  }, [entries, starts, total, kind]);
  const pinnedMetrics = geometry(pinnedIndex, offset);
  return <div ref={container} className="relative flex min-h-0 flex-1" style={providedHeight ? { height } : undefined}>
    <div className="relative min-w-0 flex-1">
      <CardContext.Provider value={{ cards, current: currentSection }}><VariableSizeList outerElementType={ScrollRegion} innerElementType={GroupedInner} ref={list} outerRef={scrollElement} height={height} width="100%" itemCount={entries.length} itemSize={index => entries[index].size} itemKey={index => entries[index].key} initialScrollOffset={offset} itemData={renderEntry} onScroll={onScroll} className="hub-scroll-region custom-scrollbar-pro scrollbar-on-light bg-slate-100">{VirtualRow}</VariableSizeList></CardContext.Provider>
      {pinned?.type === 'header' && <div ref={pinnedElement} role="region" aria-label="Pinned section" data-compact={String(pinnedMetrics.compactProgress >= 0.5)} className={`hub-pinned absolute top-0 z-10 overflow-hidden border-x bg-white shadow-xs ${pinned.sectionKey === currentSection ? 'border-slate-400' : 'border-slate-300'}`} style={{ left: 14, right: 14, height: pinnedMetrics.overlayHeight, top: pinnedMetrics.top, display: pinnedMetrics.visible ? undefined : 'none' }}><div ref={expandedLayer} data-pinned-expanded aria-hidden="true" inert className="hub-pinned-expanded absolute inset-x-0 top-0" style={{ opacity: 1 - pinnedMetrics.compactProgress }}>{header(pinned, 0)}</div><div ref={compactLayer} data-pinned-compact className="hub-pinned-compact absolute inset-x-0 top-0" style={{ opacity: pinnedMetrics.compactProgress }}><SlimSectionBar current={pinned.sectionKey === currentSection} pinned={kind === 'sequences' ? pinnedFeature(pinned.item as SequenceSection) : null} kind={kind} item={pinned.item} featureColors={featureColors} trackWindow={state.trackWindow} onFold={headerActions.get(pinned.key)!.onFold} onPick={headerActions.get(pinned.key)!.onPick} highlight={kind === 'sequences' && hovered && (pinned.item as SequenceSection).record.features.includes(hovered) ? hovered : null} /></div></div>}
    </div>
    <OverviewRail scrollRef={scrollElement} indicatorRef={railIndicator} blocks={blocks} currentKey={currentSection ?? undefined} total={total} offset={offset} height={height} hits={state.filters.query ? entries.flatMap((entry, i) => entry.type === 'row' || entry.type === 'track' ? [starts[i]] : []) : []} onJump={(value, key) => { state.setJumpTarget(null); if (key) landJump(key, value); else { jumpLanding.current = null; list.current?.scrollTo(value); } }} />
  </div>;
}

export default memo(HubList, (previous, next) => {
  const keys = Object.keys(previous) as (keyof HubListProps)[];
  return keys.length === Object.keys(next).length && keys.every(key => key === 'state'
    ? (Object.keys(previous.state) as (keyof HubState)[]).every(field => previous.state[field] === next.state[field])
    : previous[key] === next[key]);
});

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

import { useCallback, useDeferredValue, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import type { BioFeature, DetailKey, SeqRecord, SequenceDetails } from '@/src/domain/bio/types';
import { annotationFeatures } from '@/src/domain/bio/recordStatus';
import { buildSequenceSections, searchHits } from '@/src/app/logic/hubModel';
import { buildFeatureGroups, countFeatureGroups } from '@/src/app/logic/featureComparison';
import type { FocusTarget } from '@/src/app/logic/focusTarget';
import type { useHubState } from '@/src/app/hooks/useHubState';
import HubToolbar from './hub/HubToolbar';
import HubTabs from './hub/HubTabs';
import FilterBar from './hub/FilterBar';
import SelectionBar from './hub/SelectionBar';
import ExportDialog from './hub/ExportDialog';
import type { HubExportFormat, ExportOptions } from '@/src/app/logic/exportPlan';
import MoreMenu from './hub/MoreMenu';
import UndoToast from './hub/UndoToast';
import HubList from './hub/HubList';

/** Where a Focus jump left from, so the viewport can offer the way back. */
export interface HubFocusOrigin { key: string; label: string }

export interface AnnotationHubPanelProps {
  records: SeqRecord[];
  state: ReturnType<typeof useHubState>;
  featureColors: Record<string, string>;
  onStartNewFeature: () => void;
  onToggleRecordVisibility: (recordId: string) => void;
  isAlignmentLocked?: boolean;
  onRemoveRecord: (recordId: string) => void;
  onViewFeatureDetails: (recordId: string, feature: BioFeature) => void;
  onEditFeature: (recordId: string, featureIndex: number, feature: BioFeature) => void;
  onRemoveFeature: (recordId: string, featureIndex: number) => void;
  onDeleteRows: (keys: Set<string>) => void;
  undoAvailable: boolean;
  undoVersion?: number;
  onUndoPause?: (paused: boolean) => void;
  onUndoDelete: () => void;
  onSetRecordDetails: (id: string, details: SequenceDetails) => void;
  onSetRecordLabel: (id: string, label: string) => void;
  onSetDetail: (ids: Set<string>, key: DetailKey, value: string) => void;
  onFocusItem: (target: FocusTarget, origin: HubFocusOrigin) => void;
  lastFocusedKey?: string | null;
  onExportProjectJson: () => void;
  onExportRecords: (ids: string[], format: HubExportFormat, options: ExportOptions) => void;
  onClearAll: () => void;
  addLog: (msg: string) => void;
  onFileUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onAlignmentUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onAnnotationUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onProjectUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onDroppedFiles: (files: File[]) => void;
}

export default function AnnotationHubPanel(props: AnnotationHubPanelProps) {
  const { records, state, isAlignmentLocked, lastFocusedKey } = props;
  const [currentRow, setCurrentRow] = useState<string | null>(null);
  const [searchIndex, setSearchIndex] = useState(-1);
  const [dragOver, setDragOver] = useState(false);
  const [notice, setNotice] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const [organismEditRequest, setOrganismEditRequest] = useState(0);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 5000); return () => clearTimeout(timer); }, [notice]);
  const query = useDeferredValue(state.filters.query);
  const { types: filterTypes, strand, sequenceQuery, needsAttention, onlyIds } = state.filters;
  const filters = useMemo(() => ({ query, types: filterTypes, strand, sequenceQuery, needsAttention, onlyIds }), [query, filterTypes, strand, sequenceQuery, needsAttention, onlyIds]);
  const displayState = { ...state, filters };
  const sections = useMemo(() => state.tab === 'sequences' ? buildSequenceSections(records, filters, state.grouped ? { grouped: true, field: state.groupField } : { grouped: false }, state.sort) : [], [records, filters, state.tab, state.grouped, state.groupField, state.sort]);
  const groups = useMemo(() => state.tab === 'features' ? buildFeatureGroups(records, filters, state.onlyProblems) : [], [records, filters, state.tab, state.onlyProblems]);
  const featureCount = useMemo(() => state.tab === 'features' ? groups.length : countFeatureGroups(records, filters), [records, filters, state.tab, groups]);
  const items = state.tab === 'sequences' ? sections : groups;
  const rows = useMemo(() => state.tab === 'sequences' ? searchHits(sections) : groups.flatMap(group => group.rows.map(({ record, feature }) => `${record.id}:${record.features.indexOf(feature)}`)), [state.tab, sections, groups]);
  const annotationKeys = useMemo(() => new Set(state.tab === 'sequences' ? sections.flatMap(section => section.rows.map(f => `${section.record.id}:${section.record.features.indexOf(f)}`)) : rows), [state.tab, sections, rows]);
  const matches = query.trim() ? rows : [];
  const totalAnnotations = useMemo(() => records.reduce((count, record) => count + annotationFeatures(record).length, 0), [records]);
  const visibleAnnotations = annotationKeys.size;
  const visibleRecords = state.tab === 'sequences' ? sections.length : new Set(groups.flatMap(group => group.rows.map(row => row.record.id))).size;
  const types = useMemo(() => {
    const result = new Map<string, number>();
    records.forEach(record => {
      annotationFeatures(record).forEach(feature => result.set(feature.type, (result.get(feature.type) ?? 0) + 1));
      if (state.tab === 'sequences' && record.tracks?.length) result.set('track', (result.get('track') ?? 0) + record.tracks.length);
    });
    return result;
  }, [records, state.tab]);
  useEffect(() => {
    if (!items.length && query === state.filters.query && state.jumpTarget) state.setJumpTarget(null);
  }, [items.length, query, state.filters.query, state.jumpTarget, state.setJumpTarget]);
  const jump = (key: string) => { setCurrentRow(key); state.setJumpTarget(prev => ({ key, serial: (prev?.serial ?? 0) + 1 })); };
  useEffect(() => { setSearchIndex(-1); }, [filters, state.tab, state.onlyProblems]);
  useEffect(() => {
    if (state.jumpTarget && rows.includes(state.jumpTarget.key)) setCurrentRow(state.jumpTarget.key);
  }, [state.jumpTarget, rows]);
  const navigate = (direction: number) => {
    if (!matches.length) return;
    const index = searchIndex < 0 ? direction > 0 ? 0 : matches.length - 1 : (searchIndex + direction + matches.length) % matches.length;
    setSearchIndex(index); jump(matches[index]);
  };
  const keyboard = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement;
    if (exportOpen || !target.closest('[data-hub-focus]') || event.altKey || event.ctrlKey || event.metaKey) return;
    if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
    const key = event.key.toLowerCase();
    if (key === 'escape') { if (state.menu) { state.setMenu(null); return; } state.setSelectedRecords(new Set()); state.setSelectedRows(new Set()); return; }
    if (!['/', 'j', 'k', '[', ']', 'x', 'o'].includes(key)) return;
    event.preventDefault();
    if (key === '/') { document.getElementById('hub-annotation-search')?.focus(); return; }
    const currentIndex = currentRow ? rows.indexOf(currentRow) : -1;
    if (key === 'j' || key === 'k') {
      const next = currentIndex < 0 ? key === 'j' ? 0 : rows.length - 1 : Math.max(0, Math.min(rows.length - 1, currentIndex + (key === 'j' ? 1 : -1)));
      if (rows[next]) jump(rows[next]);
    } else if (key === 'x' && currentRow && annotationKeys.has(currentRow)) state.setSelectedRows(prev => { const next = new Set(prev); if (next.has(currentRow)) next.delete(currentRow); else next.add(currentRow); return next; });
    else if (key === '[' || key === ']') {
      const index = items.findIndex(item => item.key === state.currentSectionKey);
      const next = items[Math.max(0, Math.min(items.length - 1, index + (key === ']' ? 1 : -1)))];
      if (next) { state.setJumpTarget(prev => ({ key: next.key, serial: (prev?.serial ?? 0) + 1 })); setCurrentRow(null); }
    } else if (key === 'o' && state.currentSectionKey) {
      const filtering = Boolean(state.filters.query || state.filters.types.size || state.filters.strand !== 'all' || state.filters.sequenceQuery || state.filters.needsAttention || state.filters.onlyIds || state.onlyProblems && state.tab === 'features');
      const sectionKey = state.currentSectionKey;
      if (filtering) state.setSearchFolds(prev => { const next = new Set(prev), target = `${state.tab}:${sectionKey}`; if (next.has(target)) next.delete(target); else next.add(target); return next; });
      else state.setCollapsed(prev => { const next = new Set(prev[state.tab]); if (next.has(sectionKey)) next.delete(sectionKey); else next.add(sectionKey); return { ...prev, [state.tab]: next }; });
    }
  };
  useEffect(() => { document.addEventListener('keydown', keyboard); return () => document.removeEventListener('keydown', keyboard); }, [keyboard]);
  const importAnnotations = useCallback(() => document.querySelector<HTMLInputElement>('[aria-label="Import annotations files"]')?.click(), []);
  const removeFeature = useCallback((id: string, index: number) => { props.onRemoveFeature(id, index); state.setSelectedRows(new Set()); }, [props.onRemoveFeature, state.setSelectedRows]);
  return <section role="region" aria-label="Annotation Hub" tabIndex={0} data-hub-focus onDragOver={event => { event.preventDefault(); setDragOver(true); }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOver(false); }} onDrop={event => { event.preventDefault(); setDragOver(false); if (isAlignmentLocked) setNotice('Workspace changes are blocked while the alignment is locked.'); else props.onDroppedFiles(Array.from(event.dataTransfer.files)); }} className={`relative flex min-h-0 flex-1 flex-col bg-white text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500 ${dragOver ? 'ring-2 ring-inset ring-amber-400' : ''}`}>
    <HubToolbar state={state} summary={`${visibleAnnotations.toLocaleString('en-US')} of ${totalAnnotations.toLocaleString('en-US')} annotations in ${visibleRecords} of ${records.length} sequences`} matchIndex={searchIndex} matchCount={matches.length} onNavigate={navigate} onAdd={props.onStartNewFeature} locked={isAlignmentLocked} onExport={() => setExportOpen(true)} more={<MoreMenu state={state} locked={isAlignmentLocked} empty={!records.length} onSave={props.onExportProjectJson} onClear={props.onClearAll} onFileUpload={props.onFileUpload} onAlignmentUpload={props.onAlignmentUpload} onAnnotationUpload={props.onAnnotationUpload} onProjectUpload={props.onProjectUpload} />} />
    <HubTabs state={state} sequences={records.length} features={featureCount} />
    <div role="tabpanel" id={`hub-panel-${state.tab}`} aria-labelledby={`hub-tab-${state.tab}`} className="relative flex min-h-0 flex-1 flex-col">
    <FilterBar state={displayState} types={types} keys={items.map(item => item.key)} />
    <SelectionBar records={records} state={state} locked={isAlignmentLocked} onSetDetail={props.onSetDetail} onToggleVisibility={props.onToggleRecordVisibility} onRemoveRecords={ids => ids.forEach(id => props.onRemoveRecord(id))} organismEditRequest={organismEditRequest} onExport={() => setExportOpen(true)} onExportRows={(ids, keys) => props.onExportRecords(ids, 'gff3', { matchingKeys: keys, fileName: 'selected_annotations.gff3' })} onDeleteRows={props.onDeleteRows} />
    {notice && <p role="status" className="border-b border-amber-200 bg-amber-50 px-5 py-2 text-xs text-slate-700">{notice}</p>}
    <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-5 py-2 text-xs text-slate-500">
      <input type="checkbox" aria-label="Select all visible annotations" checked={annotationKeys.size > 0 && [...annotationKeys].every(key => state.selectedRows.has(key))} ref={input => { if (input) input.indeterminate = [...annotationKeys].some(key => state.selectedRows.has(key)) && ![...annotationKeys].every(key => state.selectedRows.has(key)); }} onChange={event => state.setSelectedRows(prev => { const next = new Set(prev); annotationKeys.forEach(key => { if (event.target.checked) next.add(key); else next.delete(key); }); return next; })} />
      <span className="w-24">Type / Strand</span><span className="flex-1">{state.tab === 'features' ? 'Sequence' : 'Name / Product'}</span><span className="w-[26ch] shrink-0 font-mono">Location</span><span className="w-20 text-right">Length</span><span className="w-52 text-right">Actions</span>
    </div>
    {items.length ? <HubList filtersPending={query !== state.filters.query} key={state.tab} items={items} kind={state.tab} state={displayState} records={records} onNotice={setNotice} onSetRecordDetails={props.onSetRecordDetails} onSetRecordLabel={props.onSetRecordLabel} featureColors={props.featureColors} lastFocusedKey={lastFocusedKey} currentRowKey={currentRow} onCurrentRow={setCurrentRow} onFocusItem={props.onFocusItem} onViewFeatureDetails={props.onViewFeatureDetails} onEditFeature={props.onEditFeature} onRemoveFeature={removeFeature} onToggleRecordVisibility={props.onToggleRecordVisibility} isAlignmentLocked={isAlignmentLocked} onImportAnnotations={importAnnotations} addLog={props.addLog} /> : <div className="flex-1 p-10 text-center text-sm text-slate-500">{records.length ? 'No annotations match these filters' : 'Drop sequence files here or import through ⋯'}</div>}
    </div>
    {exportOpen && <ExportDialog records={records} state={state} onClose={() => setExportOpen(false)} onExport={props.onExportRecords} onEditDetails={ids => {
      state.setSelectedRecords(ids); state.setSelectedRows(new Set());
      setOrganismEditRequest(request => request + 1);
    }} />}
    {props.undoAvailable && <UndoToast key={props.undoVersion} onUndo={props.onUndoDelete} onPause={props.onUndoPause} locked={isAlignmentLocked} />}
  </section>;
}

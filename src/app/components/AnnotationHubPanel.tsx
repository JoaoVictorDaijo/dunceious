/*
 * Dunceious
 * Copyright (C) 2026 João Victor Daijo and Murilo Cassiano
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

import { ALIGNMENT_LOCK_TIP } from '@/src/app/logic/remoteAlignment';
import { getFeatureStrand } from '@/src/domain/bio/strand';
import React, { useRef, useCallback, useEffect, useState } from 'react';
import { VariableSizeList } from 'react-window';
import { SeqRecord, BioFeature, SelectionArea } from '@/src/domain/bio/types';
import { getFeatureColor } from '@/src/app/viewer/colors';
import { featureLength } from '@/src/app/logic/viewModel';
import { featureFocusTarget, type FocusTarget } from '@/src/app/logic/focusTarget';

export type FlatItem =
  | { type: 'header'; recordId: string; count: number }
  | { type: 'track'; recordId: string; track: any }
  | { type: 'feature'; recordId: string; feature: BioFeature & { index: number } };

/** Stable identity of a hub row across tab switches, used to find it again after Focus. */
export function hubRowKey(item: FlatItem): string {
  if (item.type === 'header') return `${item.recordId}:record`;
  if (item.type === 'track') return `${item.recordId}:track:${item.track.name}`;
  return `${item.recordId}:feature:${item.feature.index}`;
}

/** Where a Focus jump left from, so the viewport can offer the way back. */
export interface HubFocusOrigin {
  key: string;
  label: string;
}

/** How long a returned-to row glows before settling to its "last focused" marker. */
const RETURN_FLASH_MS = 1600;

export interface AnnotationHubPanelProps {
  records: SeqRecord[];
  flattenedFeatures: FlatItem[];
  allFeaturesCount: number;
  featureSearch: string;
  onFeatureSearchChange: (q: string) => void;
  featureColors: Record<string, string>;
  activeSelection: SelectionArea | null;
  onStartNewFeature: () => void;
  onToggleRecordVisibility: (recordId: string) => void;
  isAlignmentLocked?: boolean;
  onRemoveRecord: (recordId: string) => void;
  onViewFeatureDetails: (recordId: string, feature: BioFeature) => void;
  onEditFeature: (recordId: string, featureIndex: number, feature: BioFeature) => void;
  onRemoveFeature: (recordId: string, featureIndex: number) => void;
  onFocusItem: (target: FocusTarget, origin: HubFocusOrigin) => void;
  /** The row the last Focus jump came from: scrolled into view and marked on mount. */
  lastFocusedKey?: string | null;
  onExportAllFasta: () => void;
  onExportGenBank: () => void;
  onExportGff: () => void;
  onExportProjectJson: () => void;
  onClearAll: () => void;
  addLog: (msg: string) => void;
}

/**
 * The "Annotation Hub" panel shown when the features tab is active.
 * Renders a virtualised list of all records, their tracks, and annotations.
 */
const AnnotationHubPanel: React.FC<AnnotationHubPanelProps> = ({
  records,
  flattenedFeatures,
  allFeaturesCount,
  featureSearch,
  onFeatureSearchChange,
  featureColors,
  activeSelection,
  onStartNewFeature,
  onToggleRecordVisibility,
  onRemoveRecord,
  isAlignmentLocked = false,
  onViewFeatureDetails,
  onEditFeature,
  onRemoveFeature,
  onFocusItem,
  lastFocusedKey = null,
  onExportAllFasta,
  onExportGenBank,
  onExportGff,
  onExportProjectJson,
  onClearAll,
  addLog,
}) => {
  const hubListRef = useRef<VariableSizeList>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);
  const [listHeight, setListHeight] = useState(600);
  const [flashKey, setFlashKey] = useState<string | null>(lastFocusedKey);

  // Coming back from a Focus jump: bring the origin row to the middle of the list
  // and let it glow once. Runs on mount only — the hub remounts on every return.
  useEffect(() => {
    if (!lastFocusedKey) return;
    const index = flattenedFeatures.findIndex(item => hubRowKey(item) === lastFocusedKey);
    if (index >= 0) hubListRef.current?.scrollToItem(index, 'center');
    const timer = setTimeout(() => setFlashKey(null), RETURN_FLASH_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const el = listContainerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        setListHeight(entry.contentRect.height);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const isFeatureInSelection = useCallback((f: BioFeature) => {
    if (!activeSelection) return false;
    return f.start === activeSelection.start && f.end === activeSelection.end;
  }, [activeSelection]);

  const getHubRowHeight = useCallback((index: number) => {
    const item = flattenedFeatures[index];
    if (!item) return 0;
    return item.type === 'header' ? 60 : 70;
  }, [flattenedFeatures]);

  useEffect(() => {
    if (hubListRef.current) hubListRef.current.resetAfterIndex(0);
  }, [flattenedFeatures]);

  const HubRow = useCallback(({ index, style }: { index: number; style: React.CSSProperties }) => {
    const item = flattenedFeatures[index];
    if (!item) return null;

    if (item.type === 'header') {
      const record = records.find(r => r.id === item.recordId);
      const isVisible = record?.visible !== false;
      return (
        <div style={style} className="bg-slate-100/50 border-b border-slate-200 px-8 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-4">
            <input
              type="checkbox"
              checked={isVisible}
              onChange={() => onToggleRecordVisibility(item.recordId)}
              data-tip={isVisible ? 'Hide this record in the viewport' : 'Show this record in the viewport'}
              className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
            />
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-widest text-amber-600">
                {record?.name || item.recordId}
                {record?.isCircular && (
                  <span className="ml-2 px-2 py-0.5 rounded bg-amber-100 text-amber-700 text-[8px] font-bold border border-amber-200">CIRCULAR</span>
                )}
              </span>
              {record?.definition && (
                <span className="text-[9px] font-bold text-slate-500 italic mt-0.5 line-clamp-1">{record.definition}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">({item.count} annotations)</span>
            <button
              disabled={isAlignmentLocked}
              onClick={() => {
                if (isAlignmentLocked) return;
                if (window.confirm(`Remove sequence "${record?.name || item.recordId}" from project?`)) {
                  onRemoveRecord(item.recordId);
                }
              }}
              className="disabled:opacity-30 disabled:cursor-not-allowed text-slate-400 hover:text-rose-600 p-2.5 rounded-xl hover:bg-rose-50 transition-all"
              aria-label={`Remove ${record?.name || item.recordId}`}
              data-tip={isAlignmentLocked ? ALIGNMENT_LOCK_TIP : "Remove this sequence and its annotations from the project"}
            >
              <i className="fas fa-trash-alt"></i>
            </button>
          </div>
        </div>
      );
    }

    const rowKey = hubRowKey(item);
    const isLastFocused = rowKey === lastFocusedKey;
    // An accent bar plus tag marks the origin row; the glow plays only right after returning.
    const returnMark = isLastFocused
      ? `relative shadow-[inset_3px_0_0_0_#f59e0b] ${flashKey === rowKey ? 'animate-row-return motion-reduce:animate-none' : ''}`
      : '';
    const lastFocusedTag = isLastFocused && (
      <span
        className="ml-2 align-middle inline-flex items-center gap-1 px-1.5 py-px rounded bg-amber-100 text-amber-700 text-[8px] font-bold uppercase tracking-wider animate-in fade-in duration-300"
        data-tip="You last focused this row in the viewport"
      >
        <i className="fas fa-location-crosshairs text-[7px]"></i> Last focused
      </span>
    );

    if (item.type === 'track') {
      const { recordId, track: t } = item;
      const start = Math.min(...t.data.map((d: any) => d.start));
      const end = Math.max(...t.data.map((d: any) => d.end));
      return (
        <div style={style} className={`border-b border-slate-100 hover:bg-indigo-50/30 transition-all group flex items-center px-8 ${returnMark}`}>
          <div className="w-[15%] shrink-0">
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 rounded-md text-[9px] font-bold uppercase tracking-tighter bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">track</span>
              <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-slate-100 text-[10px] font-bold text-slate-400">~</span>
            </div>
          </div>
          <div className="w-[35%] shrink-0 px-4">
            <div className="flex flex-col gap-0.5">
              <span className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-1">{t.name}{lastFocusedTag}</span>
              <span className="text-[10px] font-bold text-slate-500 line-clamp-1">{t.data.length} data points</span>
            </div>
          </div>
          <div className="w-[20%] shrink-0 px-4">
            <span className="text-[11px] font-mono text-slate-600 font-bold">
              {(start + 1).toLocaleString()}..{end.toLocaleString()}
            </span>
          </div>
          <div className="w-[10%] shrink-0 px-4 text-right font-mono text-slate-500 font-bold">
            {(end - start).toLocaleString()}
          </div>
          <div className="w-[20%] shrink-0 text-right pl-4">
            <div className="flex justify-end gap-3 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
              <button
                onClick={() => addLog(`Track: ${t.name} selected.`)}
                className="text-slate-400 hover:text-indigo-600 p-2.5 rounded-xl hover:bg-indigo-50 transition-all"
                aria-label="Track info"
                data-tip="Log this track's summary"
              >
                <i className="fas fa-info-circle"></i>
              </button>
              <button
                onClick={() => onFocusItem({ recordId, start, end, label: t.name, length: end - start }, { key: rowKey, label: t.name })}
                data-tip="Open this track's span in the viewport"
                className="text-[10px] font-bold uppercase bg-white px-5 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-indigo-600 hover:text-white hover:border-indigo-500 transition-all tracking-widest shadow-sm"
              >
                Focus
              </button>
            </div>
          </div>
        </div>
      );
    }

    const { recordId, feature: f } = item;
    const isSelected = isFeatureInSelection(f);
    return (
      <div style={style} className={`border-b border-slate-100 hover:bg-slate-50 transition-all group flex items-center px-8 ${isSelected ? 'bg-amber-50' : ''} ${returnMark}`}>
        <div className="w-[15%] shrink-0">
          <div className="flex items-center gap-3">
            <span
              className="px-3 py-1 rounded-md text-[9px] font-bold uppercase tracking-tighter"
              style={{
                backgroundColor: `${f.color || getFeatureColor(f.type, featureColors)}15`,
                color: f.color || getFeatureColor(f.type, featureColors),
                border: `1px solid ${f.color || getFeatureColor(f.type, featureColors)}25`,
              }}
            >
              {f.type}
            </span>
            <span className={`inline-flex items-center justify-center w-6 h-6 rounded bg-slate-100 text-[10px] font-bold ${f.strand === 1 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {getFeatureStrand(f) === 1 ? '+' : getFeatureStrand(f) === -1 ? '−' : getFeatureStrand(f)}
            </span>
          </div>
        </div>
        <div className="w-[35%] shrink-0 px-4">
          <div className="flex flex-col gap-0.5">
            <span className="font-bold text-slate-900 group-hover:text-amber-600 transition-colors line-clamp-1">{f.name}{lastFocusedTag}</span>
            {f.metadata?.product && <span className="text-[10px] font-bold text-slate-500 line-clamp-1">{f.metadata.product}</span>}
          </div>
        </div>
        <div className="w-[20%] shrink-0 px-4">
          <span className="text-[11px] font-mono text-slate-600 font-bold">
            {f.locationString
              ? f.locationString.length > 30 ? f.locationString.substring(0, 27) + '...' : f.locationString
              : `${(f.start + 1).toLocaleString()}..${f.end.toLocaleString()}`}
          </span>
        </div>
        <div className="w-[10%] shrink-0 px-4 text-right font-mono text-slate-500 font-bold">
          {(() => {
            const record = records.find(r => r.id === recordId);
            return featureLength(record?.sequence.length, f.start, f.end, f.segments).toLocaleString();
          })()}
        </div>
        <div className="w-[20%] shrink-0 text-right pl-4">
          <div className="flex justify-end gap-3 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
            <button
              onClick={() => onViewFeatureDetails(recordId, f)}
              className="text-slate-400 hover:text-amber-600 p-2.5 rounded-xl hover:bg-amber-50 transition-all"
              aria-label="View details"
              data-tip="Inspect this annotation: qualifiers, sequence, export"
            >
              <i className="fas fa-eye"></i>
            </button>
            <button
              onClick={() => onEditFeature(recordId, f.index, f)}
              className="text-slate-400 hover:text-amber-600 p-2.5 rounded-xl hover:bg-amber-50 transition-all"
              aria-label="Edit"
              data-tip="Edit name, type, strand, coordinates and qualifiers"
            >
              <i className="fas fa-edit"></i>
            </button>
            <button
              onClick={() => onRemoveFeature(recordId, f.index)}
              className="disabled:opacity-30 disabled:cursor-not-allowed text-slate-400 hover:text-rose-600 p-2.5 rounded-xl hover:bg-rose-50 transition-all"
              aria-label="Delete"
              data-tip="Delete this annotation"
            >
              <i className="fas fa-trash-alt"></i>
            </button>
            <button
              onClick={() => {
                const record = records.find(r => r.id === recordId);
                if (!record) return;
                onFocusItem(featureFocusTarget(record, f), { key: rowKey, label: f.name });
                addLog(`Jump to ${f.name}`);
              }}
              data-tip="Open this annotation in the viewport, selected"
              className="text-[10px] font-bold uppercase bg-white px-5 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-amber-500 hover:text-slate-950 hover:border-amber-400 transition-all tracking-widest shadow-sm"
            >
              Focus
            </button>
          </div>
        </div>
      </div>
    );
  }, [flattenedFeatures, records, isFeatureInSelection, addLog, featureColors, onToggleRecordVisibility, isAlignmentLocked, onRemoveRecord, onViewFeatureDetails, onEditFeature, onRemoveFeature, onFocusItem, lastFocusedKey, flashKey]);

  return (
    <div className="flex-1 p-6 flex flex-col min-h-0 bg-amber-50/50 overflow-hidden">
      <div className="flex justify-between items-end mb-6">
        <div>
          <h2 className="text-2xl font-extrabold uppercase tracking-tighter text-slate-900">Annotation Hub</h2>
          <p className="text-[10px] font-bold text-amber-600 uppercase tracking-[0.3em] mt-1">
            {records.length} Sequences • {allFeaturesCount} Annotations
          </p>
        </div>
        <div className="flex gap-3">
          <div className="relative">
            <i className="fas fa-search absolute left-4 top-3 text-slate-400 text-sm"></i>
            <input
              type="text"
              placeholder="Global search..."
              className="bg-white border border-slate-200 rounded-xl pl-11 pr-4 py-2.5 text-xs w-[280px] outline-none focus:border-amber-500 shadow-sm transition-all font-bold text-slate-900"
              value={featureSearch}
              onChange={e => onFeatureSearchChange(e.target.value)}
            />
          </div>
          <button
            onClick={onStartNewFeature}
            data-tip="Create a new annotation (prefilled from the current selection)"
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 px-5 rounded-xl text-[9px] font-bold uppercase tracking-widest transition-all shadow-md"
          >
            <i className="fas fa-plus mr-1.5"></i> Add Feature
          </button>
          <div className="flex bg-slate-800 rounded-xl p-1 shadow-md">
            <button onClick={onExportAllFasta} className="hover:bg-slate-700 text-slate-200 hover:text-white px-4 py-2 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all" data-tip="Download every record as one multi-FASTA file">
              <i className="fas fa-file-export mr-1.5"></i> FASTA
            </button>
            <button onClick={onExportGenBank} className="hover:bg-slate-700 text-slate-200 hover:text-white px-4 py-2 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all border-l border-slate-700" data-tip="Download every record with its annotations as GenBank">
              <i className="fas fa-dna mr-1.5"></i> GenBank
            </button>
            <button onClick={onExportGff} className="hover:bg-slate-700 text-slate-200 hover:text-white px-4 py-2 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all border-l border-slate-700" data-tip="Download all annotations as GFF3">
              <i className="fas fa-file-code mr-1.5"></i> GFF3
            </button>
            <button onClick={onExportProjectJson} className="hover:bg-slate-700 text-slate-200 hover:text-white px-4 py-2 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all border-l border-slate-700" data-tip="Save the whole workspace (records, annotations, colours) as JSON">
              <i className="fas fa-save mr-1.5"></i> Save Project
            </button>
          </div>
          <button
            disabled={isAlignmentLocked}
            onClick={() => { if (!isAlignmentLocked) onClearAll(); }}
            data-tip={isAlignmentLocked ? ALIGNMENT_LOCK_TIP : "Remove every record and annotation from the workspace"}
            className="disabled:opacity-30 disabled:cursor-not-allowed bg-rose-600 hover:bg-rose-500 text-white px-5 rounded-xl text-[9px] font-bold uppercase tracking-widest transition-all shadow-md"
          >
            <i className="fas fa-trash-alt mr-1.5"></i> Clear All
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden border border-slate-200 rounded-3xl bg-white shadow-inner flex flex-col">
        <div className="bg-slate-50 border-b border-slate-200 z-10 shadow-sm flex items-center px-8 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          <div className="w-[15%]">Type / Strand</div>
          <div className="w-[35%] px-4">Descriptor</div>
          <div className="w-[20%] px-4">Location</div>
          <div className="w-[10%] px-4 text-right">Length (bp)</div>
          <div className="w-[20%] text-right">Actions</div>
        </div>
        <div className="flex-1" ref={listContainerRef}>
          <VariableSizeList
            ref={hubListRef}
            height={listHeight || 600}
            width="100%"
            itemCount={flattenedFeatures.length}
            itemSize={getHubRowHeight}
            className="custom-scrollbar-pro scrollbar-on-light"
          >
            {HubRow}
          </VariableSizeList>
        </div>
      </div>
    </div>
  );
};

export default AnnotationHubPanel;

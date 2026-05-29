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

import React, { useRef, useCallback, useEffect, useState } from 'react';
import { VariableSizeList } from 'react-window';
import { SeqRecord, BioFeature, SelectionArea } from '@/src/domain/bio/types';
import { getFeatureColor } from '@/services/bioUtils';

export type FlatItem =
  | { type: 'header'; recordId: string; count: number }
  | { type: 'track'; recordId: string; track: any }
  | { type: 'feature'; recordId: string; feature: BioFeature & { index: number } };

export interface DatabaseHubPanelProps {
  records: SeqRecord[];
  flattenedFeatures: FlatItem[];
  allFeaturesCount: number;
  featureSearch: string;
  onFeatureSearchChange: (q: string) => void;
  featureColors: Record<string, string>;
  activeSelection: SelectionArea | null;
  onStartNewFeature: () => void;
  onToggleRecordVisibility: (recordId: string) => void;
  onRemoveRecord: (recordId: string) => void;
  onViewFeatureDetails: (recordId: string, feature: BioFeature) => void;
  onEditFeature: (recordId: string, featureIndex: number, feature: BioFeature) => void;
  onRemoveFeature: (recordId: string, featureIndex: number) => void;
  onFocusItem: (recordId: string, start: number, end: number) => void;
  onExportAllFasta: () => void;
  onExportGenBank: () => void;
  onExportGff: () => void;
  onExportProjectJson: () => void;
  onClearAll: () => void;
  addLog: (msg: string) => void;
}

/**
 * The "Database Hub" panel shown when the features tab is active.
 * Renders a virtualised list of all records, their tracks, and annotations.
 */
const DatabaseHubPanel: React.FC<DatabaseHubPanelProps> = ({
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
  onViewFeatureDetails,
  onEditFeature,
  onRemoveFeature,
  onFocusItem,
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
              className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
            />
            <div className="flex flex-col">
              <span className="text-[10px] font-black uppercase tracking-widest text-sky-600">
                {record?.name || item.recordId}
                {record?.isCircular && (
                  <span className="ml-2 px-2 py-0.5 rounded bg-amber-100 text-amber-700 text-[8px] font-black border border-amber-200">CIRCULAR</span>
                )}
              </span>
              {record?.definition && (
                <span className="text-[9px] font-bold text-slate-500 italic mt-0.5 line-clamp-1">{record.definition}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">({item.count} annotations)</span>
            <button
              onClick={() => {
                if (window.confirm(`Remove sequence "${record?.name || item.recordId}" from project?`)) {
                  onRemoveRecord(item.recordId);
                }
              }}
              className="text-slate-400 hover:text-rose-600 p-2.5 rounded-xl hover:bg-rose-50 transition-all"
              title="Remove Sequence"
            >
              <i className="fas fa-trash-alt"></i>
            </button>
          </div>
        </div>
      );
    }

    if (item.type === 'track') {
      const { recordId, track: t } = item;
      const start = Math.min(...t.data.map((d: any) => d.start));
      const end = Math.max(...t.data.map((d: any) => d.end));
      return (
        <div style={style} className="border-b border-slate-100 hover:bg-indigo-50/30 transition-all group flex items-center px-8">
          <div className="w-[15%] shrink-0">
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 rounded-md text-[9px] font-black uppercase tracking-tighter bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">track</span>
              <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-slate-100 text-[10px] font-black text-slate-400">~</span>
            </div>
          </div>
          <div className="w-[35%] shrink-0 px-4">
            <div className="flex flex-col gap-0.5">
              <span className="font-black text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-1">{t.name}</span>
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
            <div className="flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => addLog(`Track: ${t.name} selected.`)}
                className="text-slate-400 hover:text-indigo-600 p-2.5 rounded-xl hover:bg-indigo-50 transition-all"
                title="View Track Info"
              >
                <i className="fas fa-info-circle"></i>
              </button>
              <button
                onClick={() => onFocusItem(recordId, start, end)}
                className="text-[10px] font-black uppercase bg-white px-5 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-indigo-600 hover:text-white hover:border-indigo-500 transition-all tracking-widest shadow-sm"
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
      <div style={style} className={`border-b border-slate-100 hover:bg-slate-50 transition-all group flex items-center px-8 ${isSelected ? 'bg-sky-50' : ''}`}>
        <div className="w-[15%] shrink-0">
          <div className="flex items-center gap-3">
            <span
              className="px-3 py-1 rounded-md text-[9px] font-black uppercase tracking-tighter"
              style={{
                backgroundColor: `${f.color || getFeatureColor(f.type, featureColors)}15`,
                color: f.color || getFeatureColor(f.type, featureColors),
                border: `1px solid ${f.color || getFeatureColor(f.type, featureColors)}25`,
              }}
            >
              {f.type}
            </span>
            <span className={`inline-flex items-center justify-center w-6 h-6 rounded bg-slate-100 text-[10px] font-black ${f.strand === 1 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {f.strand === 1 ? '+' : '-'}
            </span>
          </div>
        </div>
        <div className="w-[35%] shrink-0 px-4">
          <div className="flex flex-col gap-0.5">
            <span className="font-black text-slate-900 group-hover:text-sky-600 transition-colors line-clamp-1">{f.name}</span>
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
            if (f.segments && f.segments.length > 0) {
              return f.segments.reduce((acc: number, seg: any) => acc + Math.abs(seg.end - seg.start), 0).toLocaleString();
            }
            if (f.start > f.end) {
              const record = records.find(r => r.id === recordId);
              const len = record ? (record.sequence.length - f.start) + f.end : Math.abs(f.end - f.start);
              return len.toLocaleString();
            }
            return Math.abs(f.end - f.start).toLocaleString();
          })()}
        </div>
        <div className="w-[20%] shrink-0 text-right pl-4">
          <div className="flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => onViewFeatureDetails(recordId, f)}
              className="text-slate-400 hover:text-sky-600 p-2.5 rounded-xl hover:bg-sky-50 transition-all"
              title="View Details"
            >
              <i className="fas fa-eye"></i>
            </button>
            <button
              onClick={() => onEditFeature(recordId, f.index, f)}
              className="text-slate-400 hover:text-amber-600 p-2.5 rounded-xl hover:bg-amber-50 transition-all"
              title="Edit Metadata"
            >
              <i className="fas fa-edit"></i>
            </button>
            <button
              onClick={() => onRemoveFeature(recordId, f.index)}
              className="text-slate-400 hover:text-rose-600 p-2.5 rounded-xl hover:bg-rose-50 transition-all"
              title="Delete Feature"
            >
              <i className="fas fa-trash-alt"></i>
            </button>
            <button
              onClick={() => {
                const focusStart = f.segments && f.segments.length > 0 ? f.segments[0].start : f.start;
                const focusEnd = f.segments && f.segments.length > 0 ? f.segments[0].end : f.end;
                onFocusItem(recordId, focusStart, focusEnd);
                addLog(`Jump to ${f.name}`);
              }}
              className="text-[10px] font-black uppercase bg-white px-5 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-sky-600 hover:text-white hover:border-sky-500 transition-all tracking-widest shadow-sm"
            >
              Focus
            </button>
          </div>
        </div>
      </div>
    );
  }, [flattenedFeatures, records, isFeatureInSelection, addLog, featureColors, onToggleRecordVisibility, onRemoveRecord, onViewFeatureDetails, onEditFeature, onRemoveFeature, onFocusItem]);

  return (
    <div className="flex-1 p-6 flex flex-col min-h-0 bg-slate-50/30 overflow-hidden">
      <div className="flex justify-between items-end mb-6">
        <div>
          <h2 className="text-2xl font-black uppercase tracking-tighter text-slate-900">Database Hub</h2>
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mt-1">
            {records.length} Sequences • {allFeaturesCount} Annotations
          </p>
        </div>
        <div className="flex gap-3">
          <div className="relative">
            <i className="fas fa-search absolute left-4 top-3 text-slate-400 text-sm"></i>
            <input
              type="text"
              placeholder="Global search..."
              className="bg-white border border-slate-200 rounded-xl pl-11 pr-4 py-2.5 text-xs w-[280px] outline-none focus:border-sky-500 shadow-sm transition-all font-bold text-slate-900"
              value={featureSearch}
              onChange={e => onFeatureSearchChange(e.target.value)}
            />
          </div>
          <button
            onClick={onStartNewFeature}
            className="bg-sky-600 hover:bg-sky-500 text-white px-5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all shadow-md"
          >
            <i className="fas fa-plus mr-1.5"></i> Add Feature
          </button>
          <div className="flex bg-slate-800 rounded-xl p-1 shadow-md">
            <button onClick={onExportAllFasta} className="hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all" title="Export All FASTA">
              <i className="fas fa-file-export mr-1.5"></i> FASTA
            </button>
            <button onClick={onExportGenBank} className="hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all border-l border-slate-700" title="Export GenBank">
              <i className="fas fa-dna mr-1.5"></i> GenBank
            </button>
            <button onClick={onExportGff} className="hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all border-l border-slate-700" title="Export GFF3">
              <i className="fas fa-file-code mr-1.5"></i> GFF3
            </button>
            <button onClick={onExportProjectJson} className="hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all border-l border-slate-700" title="Export Project JSON">
              <i className="fas fa-save mr-1.5"></i> Save Project
            </button>
          </div>
          <button
            onClick={onClearAll}
            className="bg-rose-600 hover:bg-rose-500 text-white px-5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all shadow-md"
          >
            <i className="fas fa-trash-alt mr-1.5"></i> Clear All
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden border border-slate-200 rounded-3xl bg-white shadow-inner flex flex-col">
        <div className="bg-slate-50 border-b border-slate-200 z-10 shadow-sm flex items-center px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">
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
            className="custom-scrollbar-pro"
          >
            {HubRow}
          </VariableSizeList>
        </div>
      </div>
    </div>
  );
};

export default DatabaseHubPanel;

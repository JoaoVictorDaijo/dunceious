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

import React, { useRef, useState } from 'react';
import { SeqRecord, BioFeature } from '@/src/domain/bio/types';
import { getFeatureColor } from '@/src/app/viewer/colors';
import { getFeatureStrand } from '@/src/domain/bio/strand';
import type { EditingFeatureState } from '@/src/app/shared/types/features';
import { featureCoordPatch } from '@/src/app/logic/viewModel';
import {
  metadataFromRows, qualifierIssue, qualifierRows, type QualifierIssue, type QualifierRow,
} from '@/src/app/logic/qualifiers';

const ISSUE_TEXT: Record<QualifierIssue, string> = {
  duplicate: 'Repeated below; the later value is the one kept',
  internal: 'Names starting with _ are reserved and will not be saved',
  invalid: 'GenBank qualifier names use letters, digits, _ and - only',
};

export interface FeatureEditorModalProps {
  editing: EditingFeatureState;
  records: SeqRecord[];
  featureColors: Record<string, string>;
  onChange: (next: EditingFeatureState) => void;
  onSave: () => void;
  onDiscard: () => void;
}

const FEATURE_TYPES = ['gene', 'CDS', 'mRNA', 'tRNA', 'rRNA', 'exon', 'promoter', 'regulatory', 'misc_feature', 'intron', 'primer', 'primer_bind'];

/**
 * Modal dialog for creating a new genomic feature or editing an existing one's
 * metadata (name, type, strand, coordinates, colour, qualifiers).
 */
const FeatureEditorModal: React.FC<FeatureEditorModalProps> = ({
  editing,
  records,
  featureColors,
  onChange,
  onSave,
  onDiscard,
}) => {
  const { feature, recordId, featureIndex } = editing;
  const isNew = featureIndex === -1;
  // A wrap-around feature has start > end (it crosses the genome origin on a
  // circular molecule).  We surface this prominently so users know the
  // coordinates are intentionally inverted, not a data error.
  const isCircularWrap = feature.start > feature.end;

  const setFeature = (patch: Partial<BioFeature>) =>
    onChange({ ...editing, feature: { ...feature, ...patch } });
  // The preserved GenBank location wins on export, so any coordinate edit must
  // drop it or the exported file would silently keep the old interval.
  const setGeometry = (patch: Partial<BioFeature>) => setFeature({ ...patch, locationString: undefined });

  const [rows, setRows] = useState<QualifierRow[]>(() => qualifierRows(feature.metadata));
  const nextRowId = useRef(rows.length);
  const commitRows = (next: QualifierRow[]) => {
    setRows(next);
    setFeature({ metadata: metadataFromRows(feature.metadata, next) });
  };
  const updateRow = (id: number, patch: Partial<QualifierRow>) =>
    commitRows(rows.map(r => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-[100] flex items-center justify-center p-4 overflow-y-auto custom-scrollbar-pro animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-3xl shadow-2xl p-8 animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-300 ease-out my-auto">
        <h3 className="text-xl font-extrabold uppercase tracking-tighter mb-8 flex items-center gap-4 text-white">
          <i className="fas fa-microchip text-amber-500"></i>
          {isNew ? 'Create Feature' : 'Metadata Inspector'}
        </h3>

        {/* Circular wrap-around badge – shown whenever start > end */}
        {isCircularWrap && (
          <div className="mb-6 flex items-center gap-3 px-4 py-3 bg-amber-950/40 border border-amber-700/50 rounded-xl text-amber-400">
            <i className="fas fa-circle-notch text-sm"></i>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest">Circular wrap-around</div>
              <div className="text-[9px] opacity-70 mt-0.5">
                This feature crosses the genome origin (start &gt; end).
                Editing start/end here preserves the wrap-around semantics.
                {/* TODO: Full circular annotation editing (graphical segment drag) is not yet
                    implemented.  Use the Segments editor below for precise coordinate changes. */}
              </div>
            </div>
          </div>
        )}

        <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar-pro">
          {/* Target sequence selector (new features only) */}
          {isNew && (
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-2">Target Sequence</label>
              <select
                value={recordId}
                onChange={e => onChange({ ...editing, recordId: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-5 py-3 text-sm outline-none focus:border-sky-500 text-slate-200"
              >
                {records.map(r => <option key={r.id} value={r.id}>{r.id}</option>)}
              </select>
            </div>
          )}

          {/* Name */}
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-2">Display Name</label>
            <input
              type="text"
              value={feature.name}
              onChange={e => setFeature({ name: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-5 py-3 text-sm outline-none focus:border-sky-500 transition-all text-slate-200"
            />
          </div>

          {/* Type & Strand */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-2">Feature Key</label>
              <select
                value={feature.type}
                onChange={e => setFeature({ type: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-5 py-3 text-sm outline-none focus:border-sky-500 text-slate-200"
              >
                {!FEATURE_TYPES.includes(feature.type) && <option value={feature.type}>{feature.type}</option>}
                {FEATURE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-2">Strand</label>
              <select
                value={getFeatureStrand(feature)}
                onChange={e => {
                  const metadata = { ...feature.metadata };
                  delete metadata._gffStrand;
                  setFeature({ strand: Number(e.target.value) as 1 | -1, metadata, locationString: undefined });
                }}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-5 py-3 text-sm outline-none focus:border-sky-500 text-slate-200"
              >
                {(getFeatureStrand(feature) === '.' || getFeatureStrand(feature) === '?') && (
                  <option value={getFeatureStrand(feature)} disabled>
                    {getFeatureStrand(feature) === '.' ? 'Unstranded (.)' : 'Unknown (?)'}
                  </option>
                )}
                <option value={1}>Forward (+)</option>
                <option value={-1}>Reverse (-)</option>
              </select>
            </div>
          </div>

          <p className="text-[10px] text-slate-400">
            The track displays bases from the annotated sequence intervals. Primer tails and mismatches require a separate oligo sequence.
          </p>

          {/* Color picker */}
          <div>
            <label className="text-[10px] font-bold text-slate-500 uppercase block mb-2">Feature Color (Case by Case)</label>
            <div className="flex items-center gap-4 bg-slate-950 border border-slate-800 rounded-xl px-5 py-3">
              <input
                type="color"
                value={feature.color || getFeatureColor(feature.type, featureColors)}
                onChange={e => setFeature({ color: e.target.value })}
                className="w-10 h-10 rounded-lg border-none bg-transparent cursor-pointer"
              />
              <span className="text-xs font-mono text-slate-400 uppercase">
                {feature.color || 'Default (' + getFeatureColor(feature.type, featureColors) + ')'}
              </span>
              <button
                onClick={() => setFeature({ color: undefined })}
                data-tip="Use the global colour for this feature type"
                className="ml-auto text-[8px] font-bold text-slate-500 uppercase hover:text-rose-500 transition-colors"
              >
                Reset to Default
              </button>
            </div>
          </div>

          {/* Coordinates */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-2">
                {feature.segments && feature.segments.length > 1
                  ? isCircularWrap ? 'Wrap-around Start (bp)' : 'Envelope Start (bp)'
                  : 'Start (bp)'}
              </label>
              <input
                type="number"
                value={feature.start}
                onChange={e => setGeometry(featureCoordPatch(feature, 'start', e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-5 py-3 text-sm outline-none text-slate-200"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-2">
                {feature.segments && feature.segments.length > 1
                  ? isCircularWrap ? 'Wrap-around End (bp)' : 'Envelope End (bp)'
                  : 'End (bp)'}
              </label>
              <input
                type="number"
                value={feature.end}
                onChange={e => setGeometry(featureCoordPatch(feature, 'end', e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-5 py-3 text-sm outline-none text-slate-200"
              />
            </div>
          </div>

          {/* Segments editor (multi-segment features) */}
          {feature.segments && feature.segments.length > 1 && (
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-[10px] font-bold text-slate-500 uppercase">
                  Segments ({feature.segments.length})
                </label>
                <button
                  onClick={() => {
                    const newSegs = [...feature.segments!, { start: feature.end, end: feature.end + 100 }];
                    setGeometry({ segments: newSegs });
                  }}
                  data-tip="Append a new segment after the last one"
                  className="text-[8px] font-bold text-sky-500 uppercase hover:text-sky-300 transition-colors"
                >
                  <i className="fas fa-plus mr-1"></i> Add Segment
                </button>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-2 pr-2 custom-scrollbar-pro bg-black/20 p-3 rounded-xl border border-slate-800/50">
                {feature.segments.map((seg, idx) => (
                  <div key={idx} className="flex items-center gap-3 bg-slate-900/80 p-2 rounded-lg border border-slate-800/50 group">
                    <span className="text-[8px] font-bold text-slate-600 uppercase w-4">#{idx + 1}</span>
                    <input
                      type="number"
                      value={seg.start}
                      onChange={e => {
                        const newSegs = [...feature.segments!];
                        newSegs[idx] = { ...newSegs[idx], start: parseInt(e.target.value) };
                        setGeometry({ segments: newSegs });
                      }}
                      className="flex-1 bg-transparent border-b border-slate-800 text-[10px] font-mono text-slate-300 outline-none focus:border-sky-500"
                    />
                    <span className="text-slate-700">..</span>
                    <input
                      type="number"
                      value={seg.end}
                      onChange={e => {
                        const newSegs = [...feature.segments!];
                        newSegs[idx] = { ...newSegs[idx], end: parseInt(e.target.value) };
                        setGeometry({ segments: newSegs });
                      }}
                      className="flex-1 bg-transparent border-b border-slate-800 text-[10px] font-mono text-slate-300 outline-none focus:border-sky-500"
                    />
                    <button
                      onClick={() => {
                        const newSegs = feature.segments!.filter((_, i) => i !== idx);
                        setGeometry({ segments: newSegs });
                      }}
                      aria-label={`Remove segment ${idx + 1}`}
                      data-tip="Remove this segment"
                      className="text-slate-600 hover:text-rose-500 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                    >
                      <i className="fas fa-times text-[10px]"></i>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* GenBank location string — kept verbatim from the source until coordinates change */}
          {feature.locationString && (
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase block mb-2">
                GenBank Location
                <span className="ml-2 normal-case font-medium text-slate-600">from the source file; editing coordinates regenerates it</span>
              </label>
              <div className="w-full bg-slate-950 border border-slate-800 rounded-xl px-5 py-3 text-[10px] font-mono text-amber-500 break-all">
                {feature.locationString}
              </div>
            </div>
          )}

          {/* Qualifiers — every /key="value" pair is editable */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-[10px] font-bold text-slate-500 uppercase">
                Qualifiers{rows.length > 0 && ` (${rows.length})`}
              </label>
              <button
                onClick={() => commitRows([...rows, { id: nextRowId.current++, key: '', value: '' }])}
                data-tip="Add a /qualifier=&quot;value&quot; pair"
                className="text-[8px] font-bold text-sky-500 uppercase hover:text-sky-300 transition-colors"
              >
                <i className="fas fa-plus mr-1"></i> Add Qualifier
              </button>
            </div>
            {rows.length === 0 ? (
              <p className="text-[10px] text-slate-500 bg-slate-950/50 border border-dashed border-slate-800 rounded-lg px-4 py-3">
                No qualifiers yet. Add <span className="font-mono text-slate-400">/note</span>, <span className="font-mono text-slate-400">/product</span>, <span className="font-mono text-slate-400">/gene</span>…
              </p>
            ) : (
              <div className="max-h-64 overflow-y-auto space-y-2 pr-2 custom-scrollbar-pro">
                {rows.map(row => {
                  const issue = qualifierIssue(row, rows);
                  return (
                    <div key={row.id} className="group bg-slate-950/50 p-2 rounded-lg border border-slate-800/50 hover:border-slate-700 focus-within:border-sky-500/50 transition-colors animate-in fade-in duration-200">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-slate-600">/</span>
                        <input
                          type="text"
                          value={row.key}
                          placeholder="qualifier"
                          aria-label="Qualifier name"
                          spellCheck={false}
                          onChange={e => updateRow(row.id, { key: e.target.value })}
                          className={`flex-1 min-w-0 bg-transparent text-[10px] font-mono font-bold outline-none placeholder:text-slate-700 ${issue ? 'text-amber-400' : 'text-slate-300'}`}
                        />
                        <button
                          onClick={() => commitRows(rows.filter(r => r.id !== row.id))}
                          aria-label={`Remove qualifier ${row.key || 'draft'}`}
                          data-tip="Remove this qualifier"
                          className="w-6 h-6 rounded-md text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-all"
                        >
                          <i className="fas fa-times text-[10px]"></i>
                        </button>
                      </div>
                      <textarea
                        value={row.value}
                        rows={Math.min(4, Math.max(1, Math.ceil(row.value.length / 48)))}
                        aria-label={`Value of ${row.key || 'qualifier'}`}
                        onChange={e => updateRow(row.id, { value: e.target.value })}
                        className="mt-1 w-full resize-none bg-transparent text-[11px] text-slate-400 focus:text-slate-200 outline-none break-words"
                      />
                      {issue && <p className="text-[9px] text-amber-500/90 mt-1">{ISSUE_TEXT[issue]}</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-4 mt-12">
          <button
            onClick={onDiscard}
            data-tip="Close without saving"
            className="flex-1 py-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-xs font-bold uppercase transition-all tracking-widest"
          >
            Discard
          </button>
          <button
            onClick={onSave}
            data-tip={isNew ? 'Add this annotation to the record' : 'Save the changes to this annotation'}
            className="flex-1 py-4 rounded-2xl bg-sky-600 hover:bg-sky-500 text-xs font-bold uppercase transition-all shadow-xl shadow-sky-900/40 tracking-widest"
          >
            {isNew ? 'Create' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FeatureEditorModal;

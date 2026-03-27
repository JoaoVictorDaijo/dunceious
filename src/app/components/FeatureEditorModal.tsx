import React from 'react';
import { SeqRecord, BioFeature } from '@/src/domain/bio/types';
import { getFeatureColor } from '@/services/bioUtils';

export interface EditingFeatureState {
  recordId: string;
  /** -1 means "new feature" */
  featureIndex: number;
  feature: BioFeature;
}

export interface FeatureEditorModalProps {
  editing: EditingFeatureState;
  records: SeqRecord[];
  featureColors: Record<string, string>;
  onChange: (next: EditingFeatureState) => void;
  onSave: () => void;
  onDiscard: () => void;
}

const FEATURE_TYPES = ['gene', 'CDS', 'mRNA', 'tRNA', 'rRNA', 'exon', 'promoter', 'regulatory', 'misc_feature', 'intron'];

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

  const setFeature = (patch: Partial<BioFeature>) =>
    onChange({ ...editing, feature: { ...feature, ...patch } });

  return (
    <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-[100] flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-3xl shadow-2xl p-8 animate-in zoom-in duration-200 my-auto">
        <h3 className="text-xl font-black uppercase tracking-tighter mb-8 flex items-center gap-4 text-white">
          <i className="fas fa-microchip text-amber-500"></i>
          {isNew ? 'Create Feature' : 'Metadata Inspector'}
        </h3>

        <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar-pro">
          {/* Target sequence selector (new features only) */}
          {isNew && (
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase block mb-2">Target Sequence</label>
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
            <label className="text-[10px] font-black text-slate-500 uppercase block mb-2">Display Name</label>
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
              <label className="text-[10px] font-black text-slate-500 uppercase block mb-2">Feature Key</label>
              <select
                value={feature.type}
                onChange={e => setFeature({ type: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-5 py-3 text-sm outline-none focus:border-sky-500 text-slate-200"
              >
                {FEATURE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase block mb-2">Strand</label>
              <select
                value={feature.strand}
                onChange={e => setFeature({ strand: parseInt(e.target.value) as 1 | -1 })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-5 py-3 text-sm outline-none focus:border-sky-500 text-slate-200"
              >
                <option value={1}>Forward (+)</option>
                <option value={-1}>Reverse (-)</option>
              </select>
            </div>
          </div>

          {/* Color picker */}
          <div>
            <label className="text-[10px] font-black text-slate-500 uppercase block mb-2">Feature Color (Case by Case)</label>
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
                className="ml-auto text-[8px] font-black text-slate-500 uppercase hover:text-rose-500 transition-colors"
              >
                Reset to Default
              </button>
            </div>
          </div>

          {/* Coordinates */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase block mb-2">
                {feature.segments && feature.segments.length > 1 ? 'Envelope Start (bp)' : 'Start (bp)'}
              </label>
              <input
                type="number"
                value={feature.start}
                onChange={e => {
                  const val = parseInt(e.target.value);
                  const patch: Partial<BioFeature> = { start: val };
                  if (!feature.segments || feature.segments.length <= 1) {
                    patch.segments = [{ start: val, end: feature.end }];
                  }
                  setFeature(patch);
                }}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-5 py-3 text-sm outline-none text-slate-200"
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase block mb-2">
                {feature.segments && feature.segments.length > 1 ? 'Envelope End (bp)' : 'End (bp)'}
              </label>
              <input
                type="number"
                value={feature.end}
                onChange={e => {
                  const val = parseInt(e.target.value);
                  const patch: Partial<BioFeature> = { end: val };
                  if (!feature.segments || feature.segments.length <= 1) {
                    patch.segments = [{ start: feature.start, end: val }];
                  }
                  setFeature(patch);
                }}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-5 py-3 text-sm outline-none text-slate-200"
              />
            </div>
          </div>

          {/* Segments editor (multi-segment features) */}
          {feature.segments && feature.segments.length > 1 && (
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-[10px] font-black text-slate-500 uppercase">
                  Segments ({feature.segments.length})
                </label>
                <button
                  onClick={() => {
                    const newSegs = [...feature.segments!, { start: feature.end, end: feature.end + 100 }];
                    setFeature({ segments: newSegs });
                  }}
                  className="text-[8px] font-black text-sky-500 uppercase hover:text-sky-400"
                >
                  <i className="fas fa-plus mr-1"></i> Add Segment
                </button>
              </div>
              <div className="max-h-48 overflow-y-auto space-y-2 pr-2 custom-scrollbar-pro bg-black/20 p-3 rounded-xl border border-slate-800/50">
                {feature.segments.map((seg, idx) => (
                  <div key={idx} className="flex items-center gap-3 bg-slate-900/80 p-2 rounded-lg border border-slate-800/50 group">
                    <span className="text-[8px] font-black text-slate-600 uppercase w-4">#{idx + 1}</span>
                    <input
                      type="number"
                      value={seg.start}
                      onChange={e => {
                        const newSegs = [...feature.segments!];
                        newSegs[idx] = { ...newSegs[idx], start: parseInt(e.target.value) };
                        setFeature({ segments: newSegs });
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
                        setFeature({ segments: newSegs });
                      }}
                      className="flex-1 bg-transparent border-b border-slate-800 text-[10px] font-mono text-slate-300 outline-none focus:border-sky-500"
                    />
                    <button
                      onClick={() => {
                        const newSegs = feature.segments!.filter((_, i) => i !== idx);
                        setFeature({ segments: newSegs });
                      }}
                      className="text-slate-600 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <i className="fas fa-times text-[10px]"></i>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* GenBank location string (read-only) */}
          {feature.locationString && (
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase block mb-2">GenBank Location (Read-only)</label>
              <div className="w-full bg-slate-950 border border-slate-800 rounded-xl px-5 py-3 text-[10px] font-mono text-amber-500 break-all">
                {feature.locationString}
              </div>
            </div>
          )}

          {/* Qualifiers */}
          {feature.metadata && Object.keys(feature.metadata).length > 0 && (
            <div>
              <label className="text-[10px] font-black text-slate-500 uppercase block mb-2">Qualifiers</label>
              <div className="max-h-32 overflow-y-auto space-y-2 pr-2 custom-scrollbar-pro">
                {Object.entries(feature.metadata).map(([k, v]) => (
                  <div key={k} className="flex flex-col bg-slate-950/50 p-2 rounded-lg border border-slate-800/50">
                    <span className="text-[8px] font-black text-slate-600 uppercase">/{k}</span>
                    <span className="text-[10px] text-slate-400 break-words">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-4 mt-12">
          <button
            onClick={onDiscard}
            className="flex-1 py-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-xs font-black uppercase transition-all tracking-widest"
          >
            Discard
          </button>
          <button
            onClick={onSave}
            className="flex-1 py-4 rounded-2xl bg-sky-600 hover:bg-sky-500 text-xs font-black uppercase transition-all shadow-xl shadow-sky-900/40 tracking-widest"
          >
            {isNew ? 'Create' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default FeatureEditorModal;

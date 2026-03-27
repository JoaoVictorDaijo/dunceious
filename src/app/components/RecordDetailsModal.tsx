import React from 'react';
import { SeqRecord, BioFeature } from '@/src/domain/bio/types';

export interface RecordDetailsModalProps {
  record: SeqRecord;
  feature: BioFeature | null;
  onClose: () => void;
  onFocusFeature: (recordId: string, start: number, end: number) => void;
  onExportRecord: (recordId: string) => void;
  onCopyLog: (msg: string) => void;
}

/**
 * Modal dialog that shows detailed information about a sequence record or one of
 * its features, including a raw sequence viewer and metadata grid.
 */
const RecordDetailsModal: React.FC<RecordDetailsModalProps> = ({
  record,
  feature,
  onClose,
  onFocusFeature,
  onExportRecord,
  onCopyLog,
}) => {
  const getDisplaySeq = (): string => {
    if (!feature) return record.sequence;
    const { start, end } = feature;
    if (start <= end) return record.sequence.substring(start, end);
    return record.sequence.substring(start) + record.sequence.substring(0, end);
  };

  const displaySeq = getDisplaySeq();
  const logLabel = feature ? `${feature.name} in ${record.id}` : record.id;

  const handleCopy = () => {
    navigator.clipboard.writeText(displaySeq);
    onCopyLog(`Sequence for ${logLabel} copied to clipboard.`);
  };

  const handleFocus = () => {
    if (!feature) return;
    const focusStart = feature.segments && feature.segments.length > 0 ? feature.segments[0].start : feature.start;
    const focusEnd = feature.segments && feature.segments.length > 0 ? feature.segments[0].end : feature.end;
    onFocusFeature(record.id, focusStart, focusEnd);
    onClose();
    onCopyLog(`Focusing on ${feature.name}`);
  };

  const handleExport = () => {
    onExportRecord(record.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200">
        {/* Header */}
        <div className="bg-slate-50 px-8 py-6 border-b border-slate-200 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-sky-100 flex items-center justify-center text-sky-600 shadow-inner">
              <i className={`fas ${feature ? 'fa-tag' : 'fa-dna'} text-xl`}></i>
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase">
                {feature ? 'Annotation Details' : 'Record Details'}
              </h2>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                {feature ? `${feature.name} [${feature.type}]` : record.id}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full hover:bg-slate-200 flex items-center justify-center text-slate-400 transition-colors"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>

        {/* Body */}
        <div className="p-8 max-h-[70vh] overflow-y-auto custom-scrollbar-pro space-y-6">
          {/* Metadata grid */}
          {feature ? (
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Type</label>
                <p className="text-sm font-bold text-slate-700">{feature.type}</p>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Locus</label>
                <p className="text-sm font-mono font-bold text-slate-700">
                  {feature.locationString || `${feature.start + 1}..${feature.end}`}
                </p>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Strand</label>
                <p className="text-sm font-bold text-slate-700">
                  {feature.strand === 1 ? 'Forward (+)' : 'Reverse (-)'}
                </p>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Length</label>
                <p className="text-sm font-mono font-bold text-slate-700">
                  {(feature.end - feature.start).toLocaleString()} bp
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Definition</label>
                <p className="text-sm font-bold text-slate-700">{record.definition || 'N/A'}</p>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Accession</label>
                <p className="text-sm font-mono font-bold text-slate-700">{record.accession || 'N/A'}</p>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Length</label>
                <p className="text-sm font-mono font-bold text-slate-700">
                  {(record.alignedSequence || record.sequence).length.toLocaleString()} bp
                </p>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Features</label>
                <p className="text-sm font-bold text-slate-700">{record.features.length} annotations</p>
              </div>
            </div>
          )}

          {/* Sequence viewer */}
          <div className="space-y-3 pt-4 border-t border-slate-100">
            <div className="flex justify-between items-center">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                {feature ? 'Annotation Sequence' : 'Record Sequence (Raw)'}
              </label>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-sky-50 text-sky-600 text-[9px] font-black uppercase hover:bg-sky-100 transition-colors"
              >
                <i className="fas fa-copy"></i> Copy Sequence
              </button>
            </div>
            <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 shadow-inner group relative">
              <div className="max-h-[200px] overflow-y-auto custom-scrollbar-pro pr-2">
                <p className="text-[11px] font-mono text-slate-400 break-all leading-relaxed selection:bg-sky-500/30 selection:text-sky-200">
                  {displaySeq}
                </p>
              </div>
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest bg-slate-900/80 px-2 py-1 rounded border border-slate-800">
                  {displaySeq.length} bp
                </span>
              </div>
            </div>
          </div>

          {/* Translation (feature only) */}
          {feature?.translation && (
            <div className="space-y-3 pt-4 border-t border-slate-100">
              <div className="flex justify-between items-center">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Protein Translation</label>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(feature.translation!);
                    onCopyLog(`Translation for ${feature.name} copied.`);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-50 text-emerald-600 text-[9px] font-black uppercase hover:bg-emerald-100 transition-colors"
                >
                  <i className="fas fa-copy"></i> Copy AA
                </button>
              </div>
              <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-inner">
                <p className="text-[11px] font-mono text-emerald-400 break-all leading-relaxed">
                  {feature.translation}
                </p>
              </div>
            </div>
          )}

          {/* Additional metadata */}
          {((feature?.metadata) || (record.metadata && !feature)) && (
            <div className="space-y-3 pt-4 border-t border-slate-100">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Additional Metadata</label>
              <div className="grid grid-cols-1 gap-2">
                {Object.entries(feature?.metadata || record.metadata || {}).map(([key, value]) => (
                  <div key={key} className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <span className="text-[10px] font-black text-slate-500 uppercase">{key}</span>
                    <span className="text-[11px] font-bold text-slate-700 max-w-[300px] truncate" title={String(value)}>
                      {String(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="bg-slate-50 px-8 py-6 border-t border-slate-200 flex justify-end gap-3">
          <button
            onClick={handleCopy}
            className="px-6 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 text-[10px] font-black uppercase hover:bg-slate-50 transition-all flex items-center gap-2"
          >
            <i className="fas fa-copy"></i> Copy
          </button>
          {feature && (
            <button
              onClick={handleFocus}
              className="px-6 py-2.5 rounded-xl bg-sky-600 text-white text-[10px] font-black uppercase hover:bg-sky-500 transition-all flex items-center gap-2 shadow-lg shadow-sky-900/20"
            >
              <i className="fas fa-search-location"></i> Focus
            </button>
          )}
          {!feature && (
            <button
              onClick={handleExport}
              className="px-6 py-2.5 rounded-xl bg-emerald-600 text-white text-[10px] font-black uppercase hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-900/20 flex items-center gap-2"
            >
              <i className="fas fa-download"></i> Export FASTA
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default RecordDetailsModal;

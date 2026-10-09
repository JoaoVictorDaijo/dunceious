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

import { annotationDirection, showsAnnotationBases } from '@/src/app/viewer/annotationPresentation';
import React from 'react';
import { SeqRecord, BioFeature } from '@/src/domain/bio/types';
import { featureLength, getDisplaySeq } from '@/src/app/logic/viewModel';
import { transposeInterval } from '@/src/domain/bio/coordinate';

export interface RecordDetailsModalProps {
  record: SeqRecord;
  feature: BioFeature | null;
  onClose: () => void;
  onFocusFeature: (recordId: string, start: number, end: number) => void;
  onExportRecord: (recordId: string) => void;
  onCopyLog: (msg: string) => void;
  /** Switch the annotation's bases on or off in the viewer. */
  onSetShowBases?: (show: boolean) => void;
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
  onSetShowBases,
}) => {
  const showBases = feature ? showsAnnotationBases(feature) : false;
  const displaySeq = getDisplaySeq(record.sequence, feature);
  const logLabel = feature ? `${feature.name} in ${record.id}` : record.id;

  const handleCopy = () => {
    navigator.clipboard.writeText(displaySeq);
    onCopyLog(`Sequence for ${logLabel} copied to clipboard.`);
  };

  const handleFocus = () => {
    if (!feature) return;
    const focusStart = feature.segments && feature.segments.length > 0 ? feature.segments[0].start : feature.start;
    const focusEnd = feature.segments && feature.segments.length > 0 ? feature.segments[0].end : feature.end;
    const { start, end } = record.alignedSequence
      ? transposeInterval(focusStart, focusEnd, record.alignedSequence)
      : { start: focusStart, end: focusEnd };
    onFocusFeature(record.id, start, end);
    onClose();
    onCopyLog(`Focusing on ${feature.name}`);
  };

  const handleExport = () => {
    onExportRecord(record.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-300 ease-out border border-slate-200">
        {/* Header */}
        <div className="bg-slate-50 px-8 py-6 border-b border-slate-200 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-sky-100 flex items-center justify-center text-sky-600 shadow-inner">
              <i className={`fas ${feature ? 'fa-tag' : 'fa-dna'} text-xl`}></i>
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-slate-900 tracking-tight uppercase">
                {feature ? 'Annotation Details' : 'Record Details'}
              </h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                {feature ? `${feature.name} [${feature.type}]` : record.id}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            data-tip="Close"
            className="w-10 h-10 rounded-full hover:bg-slate-200 hover:text-slate-700 flex items-center justify-center text-slate-400 transition-colors"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>

        {/* Body */}
        <div className="p-8 max-h-[70vh] overflow-y-auto custom-scrollbar-pro scrollbar-on-light space-y-6">
          {/* Metadata grid */}
          {feature ? (
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Type</label>
                <p className="text-sm font-bold text-slate-700">{feature.type}</p>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Locus</label>
                <p className="text-sm font-mono font-bold text-slate-700">
                  {feature.locationString || `${feature.start + 1}..${feature.end}`}
                </p>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Strand</label>
                <p className="text-sm font-bold text-slate-700">
                  {annotationDirection(feature, record.moleculeType)}
                </p>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Length</label>
                <p className="text-sm font-mono font-bold text-slate-700">
                  {featureLength(record.sequence.length, feature.start, feature.end, feature.segments).toLocaleString()} bp
                </p>
              </div>
              {onSetShowBases && (
                <div className="col-span-2 flex items-center justify-between gap-4 bg-slate-50 px-4 py-3 rounded-xl border border-slate-100">
                  <div>
                    <span className="text-[11px] font-bold text-slate-700 block">Show sequence in viewer</span>
                    <span className="text-[10px] text-slate-500 block mt-0.5">
                      Draw this annotation's {record.moleculeType === 'protein' ? 'residues' : 'bases'} inside its box when zoomed in.
                    </span>
                  </div>
                  <button
                    role="switch"
                    aria-checked={showBases}
                    aria-label="Show sequence in viewer"
                    data-tip={showBases ? 'Hide the sequence inside this annotation' : 'Show the sequence inside this annotation'}
                    onClick={() => onSetShowBases(!showBases)}
                    className={`shrink-0 w-11 h-6 rounded-full relative transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60 ${showBases ? 'bg-sky-500' : 'bg-slate-300'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${showBases ? 'translate-x-5' : ''}`}></span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Definition</label>
                <p className="text-sm font-bold text-slate-700">{record.definition || 'N/A'}</p>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Accession</label>
                <p className="text-sm font-mono font-bold text-slate-700">
                  {record.accession?.trim() || record.id || 'N/A'}
                </p>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Length</label>
                <p className="text-sm font-mono font-bold text-slate-700">
                  {(record.alignedSequence || record.sequence).length.toLocaleString()} bp
                </p>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Features</label>
                <p className="text-sm font-bold text-slate-700">{record.features.length} annotations</p>
              </div>
            </div>
          )}

          {/* Sequence viewer */}
          <div className="space-y-3 pt-4 border-t border-slate-100">
            <div className="flex justify-between items-center">
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                {feature ? 'Reference envelope' : 'Record Sequence (Raw)'}
              </label>
              <button
                onClick={handleCopy}
                data-tip="Copy these bases to the clipboard"
                className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-sky-50 text-sky-600 text-[9px] font-bold uppercase hover:bg-sky-100 transition-colors"
              >
                <i className="fas fa-copy"></i> Copy Sequence
              </button>
            </div>
            {feature && (
              <p className="text-[10px] text-slate-500">
                {record.moleculeType === 'protein' ? 'Reference residues.' : 'Reference bases, 5′ → 3′.'}
                {' '}Includes the interval between segments. The annotation track displays bases per segment on its indicated strand.
              </p>
            )}
            <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 shadow-inner group relative">
              <div className="max-h-[200px] overflow-y-auto custom-scrollbar-pro pr-2">
                <p className="text-[11px] font-mono text-slate-400 break-all leading-relaxed selection:bg-sky-500/30 selection:text-sky-200">
                  {displaySeq}
                </p>
              </div>
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-[8px] font-bold text-slate-600 uppercase tracking-widest bg-slate-900/80 px-2 py-1 rounded border border-slate-800">
                  {displaySeq.length} bp
                </span>
              </div>
            </div>
          </div>

          {/* Translation (feature only) */}
          {feature?.translation && (
            <div className="space-y-3 pt-4 border-t border-slate-100">
              <div className="flex justify-between items-center">
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Protein Translation</label>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(feature.translation!);
                    onCopyLog(`Translation for ${feature.name} copied.`);
                  }}
                  data-tip="Copy the protein sequence to the clipboard"
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-50 text-emerald-600 text-[9px] font-bold uppercase hover:bg-emerald-100 transition-colors"
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
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Additional Metadata</label>
              <div className="grid grid-cols-1 gap-2">
                {Object.entries(feature?.metadata || record.metadata || {}).filter(([key]) => !key.startsWith('_')).map(([key, value]) => (
                  <div key={key} className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">{key}</span>
                    <span className="text-[11px] font-bold text-slate-700 max-w-[300px] truncate" data-tip={String(value)}>
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
            data-tip="Copy the sequence to the clipboard"
            className="px-6 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 text-[10px] font-bold uppercase hover:bg-slate-100 hover:text-slate-800 transition-all flex items-center gap-2"
          >
            <i className="fas fa-copy"></i> Copy
          </button>
          {feature && (
            <button
              onClick={handleFocus}
              data-tip="Open this annotation in the viewport, selected"
              className="px-6 py-2.5 rounded-xl bg-sky-600 text-white text-[10px] font-bold uppercase hover:bg-sky-500 transition-all flex items-center gap-2 shadow-lg shadow-sky-900/20"
            >
              <i className="fas fa-search-location"></i> Focus
            </button>
          )}
          {!feature && (
            <button
              onClick={handleExport}
              data-tip="Download this record as FASTA"
              className="px-6 py-2.5 rounded-xl bg-emerald-600 text-white text-[10px] font-bold uppercase hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-900/20 flex items-center gap-2"
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

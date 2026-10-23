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

import { readSearchHit, isSearchHitCurrent } from '@/src/domain/bio/searchHit';
import { annotationDirection, showsAnnotationBases } from '@/src/app/viewer/annotationPresentation';
import { getFeatureStrand } from '@/src/domain/bio/strand';
import { isNestedComplementLocation } from '@/src/domain/bio/locationFlags';
import React, { useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { useUiEffects } from './uiEffects';
import { SeqRecord, BioFeature } from '@/src/domain/bio/types';
import { featureSequenceViews, type FeatureSequenceViews } from '@/src/app/logic/viewModel';
import { featureFocusTarget, type FocusTarget } from '@/src/app/logic/focusTarget';

export interface RecordDetailsModalProps {
  record: SeqRecord;
  feature: BioFeature | null;
  onClose: () => void;
  onFocusFeature: (target: FocusTarget) => void;
  onExportRecord: (recordId: string) => void;
  onCopyLog: (msg: string) => void;
  /** Switch the annotation's bases on or off in the viewer. */
  onSetBasesMode?: (mode: 'nothing' | 'record' | 'query') => void;
  onRemoveSearchDetails?: () => void;
  onSetShowBases?: (show: boolean) => void;
}

type SequenceView = 'feature' | 'region';

const fmt = (n: number) => n.toLocaleString('en-US');
const KEY_SEQUENCE: Record<string, string> = { CDS: 'For a CDS this is the coding sequence.', mRNA: 'For an mRNA this is the transcript sequence.' };

/**
 * INSDC notation for a 0-based half-open span: `a..b`, or a between-base site (LOC-5, INSDC FT 11.4
 * §3.4.2.1): `n^n+1`, or `n^1` at a circular molecule's origin, where n is its length. A linear
 * molecule has no site before base 1 or after its last base, so those are named in words.
 */
function locationLabel(start: number, end: number, record: SeqRecord): string {
  if (start !== end) return `${start + 1}..${end}`;
  const n = record.sequence.length;
  if (start === 0 || start === n) {
    if (record.isCircular) return `${n}^1`;
    return start === 0 ? 'before base 1' : `after base ${n}`;
  }
  return `${start}^${start + 1}`;
}

/** What the sequence box shows, in INSDC terms only (LOC-7): never "exons" or "spliced". */
function sequenceCaption(record: SeqRecord, feature: BioFeature, views: FeatureSequenceViews, shown: SequenceView): React.ReactNode {
  const protein = record.moleculeType === 'protein';
  const n = views.intervals;
  const residues = protein ? 'residues' : 'bases';
  const span = `${locationLabel(views.regionStart, views.regionEnd, record)}${views.regionStart > views.regionEnd ? ' across the origin' : ''}`;
  const region = views.regionLength === 0
    ? `Zero-length site ${span}: the location covers no ${residues}.`
    : `Record ${residues} ${span}${protein ? '' : ', forward (+) strand, 5′ → 3′'}${n > 1 ? `, including the ${residues} between the ${n} intervals` : ''}.`;
  const partial = views.partial && <> <Flag>Partial:</Flag> at least one end lies beyond the annotated base (&lt; or &gt;), so this sequence is incomplete.</>;
  if (views.feature === null) {
    return <><Flag>order() location:</Flag> INSDC gives the order of these {n} intervals but does not imply they form one sequence, so only the region spanned is shown. {region}{partial}</>;
  }
  if (shown === 'region' || (n === 1 && views.featureLength === 0)) return <>{region}{partial}</>;

  const parts = n > 1 ? `the ${n} intervals joined in the order written` : `${residues} ${span}`;
  const strand = getFeatureStrand(feature);
  let orientation = '';
  if (!protein) {
    if (isNestedComplementLocation(feature)) {
      // The two complements cancel for an inner-complemented interval, so the strand comes from the parsed parts.
      const strands = new Set(feature.segments?.map(s => s.strand ?? feature.strand));
      const read = strands.size > 1 ? 'Read 5′ → 3′, each interval on its own strand.'
        : strands.has(-1) ? 'Read 5′ → 3′ on the reverse (−) strand.' : 'Read 5′ → 3′ on the forward (+) strand.';
      orientation = `, inner complement(…) intervals reverse-complemented, then the joined result reverse-complemented because the location is complement(…). ${read}`;
    } else if (feature.segments?.some(s => s.strand !== undefined)) {
      orientation = ', each read 5′ → 3′ on its own strand (complement(…) intervals reverse-complemented).';
    } else if (strand === -1) {
      orientation = `, ${n > 1 ? 'then ' : ''}reverse-complemented because the location is complement(…). Read 5′ → 3′ on the reverse (−) strand.`;
    } else if (strand === 1) {
      orientation = '. Read 5′ → 3′ on the forward (+) strand.';
    } else {
      orientation = '. The feature gives no strand, so its bases read 5′ → 3′ as the record is written.';
    }
  }
  const key = protein ? '' : KEY_SEQUENCE[feature.type] ?? '';
  return <>{[`Sequence defined by the location: ${parts}${orientation || '.'}`, key].filter(Boolean).join(' ')}{partial}</>;
}

const Flag = ({ children }: { children: React.ReactNode }) => <span className="text-amber-700 font-bold">{children}</span>;

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
  onSetBasesMode,
  onRemoveSearchDetails,
}) => {
  const { copyText, hoverTips, portalTarget } = useUiEffects();
  const searchHit = feature ? readSearchHit(feature) : null;
  const current = feature ? isSearchHitCurrent(feature) : false;
  const joined = !searchHit && (feature?.segments?.length ?? 0) > 1;
  const showBases = feature ? showsAnnotationBases(feature) : false;
  const views = feature ? featureSequenceViews(record, feature) : null;
  const [view, setView] = useState<SequenceView>('feature');
  const viewGroup = useId();
  const shown: SequenceView = views?.feature != null && view === 'feature' ? 'feature' : 'region';
  const displaySeq = !views ? record.sequence : shown === 'feature' ? views.feature ?? '' : views.region;
  const unit = record.moleculeType === 'protein' ? 'aa' : 'bp';
  const shownLabel = shown === 'feature' ? 'feature sequence' : 'region';
  const logLabel = feature ? `${feature.name} in ${record.id}` : record.id;

  // A host that declines (`false`) said no and stays quiet; a clipboard that rejects — denied
  // permission, an insecure context, Safari's gesture rules — is a failure the log must name,
  // as `HitAlignment` does, or the copy disappears with no sign at all.
  const handleCopy = async () => {
    try {
      if (await copyText(displaySeq)) onCopyLog(`${views ? (shown === 'feature' ? 'Feature sequence' : 'Region') : 'Sequence'} for ${logLabel} copied to clipboard.`);
    } catch {
      onCopyLog(`Copy failed for ${logLabel}.`);
    }
  };

  const handleCopyTranslation = async () => {
    const translated = feature;
    if (!translated?.translation) return;
    try {
      if (await copyText(translated.translation)) onCopyLog(`Translation for ${translated.name} copied.`);
    } catch {
      onCopyLog(`Copy failed for the translation of ${translated.name}.`);
    }
  };

  const handleFocus = () => {
    if (!feature) return;
    onFocusFeature(featureFocusTarget(record, feature));
    onClose();
    onCopyLog(`Focusing on ${feature.name}`);
  };

  const handleExport = () => {
    onExportRecord(record.id);
    onClose();
  };

  const modal = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div data-record-details="" className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-300 ease-out border border-slate-200">
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
        <div data-record-details-body="" className="p-8 max-h-[70vh] overflow-y-auto custom-scrollbar-pro scrollbar-on-light space-y-6">
          {/* Metadata grid */}
          {feature ? (
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Type</label>
                <p className="text-sm font-bold text-slate-700">{feature.type}</p>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Locus</label>
                <p className="text-sm font-mono font-bold text-slate-700">
                  {feature.locationString || locationLabel(feature.start, feature.end, record)}
                </p>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Strand</label>
                <p className="text-sm font-bold text-slate-700">
                  {annotationDirection(feature, record.moleculeType)}
                </p>
              </div>
              {views && <div className="space-y-1" data-feature-lengths="">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Length</label>
                <p className="text-sm font-mono font-bold text-slate-700">
                  {fmt(views.featureLength)} {unit}
                  {views.partial && <>{' '}<span className="ml-1 align-middle text-[9px] font-sans font-bold uppercase tracking-wider text-amber-700 bg-amber-100 border border-amber-200 rounded px-1.5 py-0.5">Partial</span></>}
                  {' '}<span className="text-[11px] font-sans font-semibold text-slate-500">
                    {views.feature === null
                      ? `in ${views.intervals} intervals (not joined)`
                      : `feature sequence · ${views.intervals > 1 ? `sum of ${views.intervals} location intervals` : '1 location interval'}`}
                  </span>
                </p>
                <p className="text-[11px] font-mono text-slate-500">
                  {fmt(views.regionLength)} {unit} <span className="font-sans">region spanned · {locationLabel(views.regionStart, views.regionEnd, record)}</span>
                </p>
              </div>}
              {onSetBasesMode && (searchHit || joined) ? <div className="col-span-2 space-y-2 text-xs text-slate-600">
                <label className="flex items-center gap-3">Bases inside
                  <select aria-label="Bases inside" value={feature.metadata?._showBases === 'query' && current ? 'query' : feature.metadata?._showBases === '1' ? 'record' : 'nothing'}
                    onChange={e => onSetBasesMode(e.target.value as 'nothing' | 'record' | 'query')} className="border rounded p-2">
                    <option value="nothing">Nothing</option><option value="record">Record bases</option>
                    {searchHit && <option value="query" disabled={!current}>Query aligned to record</option>}
                  </select>
                </label>
                {joined && <p>The query layer isn't available for joined annotations.</p>}
                {searchHit && !current && <p>The search alignment no longer matches this annotation's region.</p>}
                {searchHit && onRemoveSearchDetails && <button type="button" onClick={onRemoveSearchDetails} className="text-rose-600">Remove search details</button>}
              </div> : onSetShowBases && (
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
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Definition</label>
                <p className="text-sm font-bold text-slate-700">{record.definition || 'N/A'}</p>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Accession</label>
                <p className="text-sm font-mono font-bold text-slate-700">
                  {record.accession?.trim() || record.id || 'N/A'}
                </p>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Length</label>
                <p className="text-sm font-mono font-bold text-slate-700">
                  {(record.alignedSequence || record.sequence).length.toLocaleString()} bp
                </p>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Features</label>
                <p className="text-sm font-bold text-slate-700">{record.features.length} annotations</p>
              </div>
            </div>
          )}

          {/* Sequence viewer */}
          <div className="space-y-3 pt-4 border-t border-slate-100">
            <div className="flex flex-wrap justify-between items-center gap-3">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                {feature ? 'Sequence' : 'Record Sequence (Raw)'}
              </label>
              <div className="flex flex-wrap items-center gap-2">
                {views && (
                  <div role="radiogroup" aria-label="Sequence shown" className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[10px] font-bold uppercase">
                    {(['feature', 'region'] as const).map(option => {
                      const disabled = option === 'feature' && views.feature === null;
                      return (
                        <label
                          key={option}
                          data-tip={disabled ? 'An order() location does not define one joined sequence' : undefined}
                          className={`px-2.5 py-1 rounded-md transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-sky-500/60 ${shown === option ? 'bg-white text-slate-800 shadow' : 'text-slate-500 hover:text-slate-700'} ${disabled ? 'line-through opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                          <input type="radio" name={viewGroup} value={option} checked={shown === option} disabled={disabled}
                            onChange={() => setView(option)} className="sr-only" />
                          {option === 'feature' ? 'Feature sequence' : 'Region spanned'}
                        </label>
                      );
                    })}
                  </div>
                )}
                <button
                  onClick={handleCopy}
                  data-tip="Copy the sequence shown to the clipboard"
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-sky-50 text-sky-600 text-[10px] font-bold uppercase hover:bg-sky-100 transition-colors"
                >
                  <i className="fas fa-copy"></i> {views ? `Copy ${shownLabel} (${fmt(displaySeq.length)} ${unit})` : 'Copy Sequence'}
                </button>
              </div>
            </div>
            {feature && views && (
              <p data-sequence-caption="" className="text-[10px] text-slate-500 leading-relaxed">{sequenceCaption(record, feature, views, shown)}</p>
            )}
            <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 shadow-inner group relative">
              <div className={`max-h-[200px] overflow-y-auto custom-scrollbar-pro pr-2 ${views ? 'pt-6' : ''}`}>
                <p className="text-[11px] font-mono text-slate-400 break-all leading-relaxed selection:bg-sky-500/30 selection:text-sky-200">
                  {displaySeq}
                </p>
              </div>
              <div className={`absolute top-2 right-2 ${views ? '' : 'opacity-0 group-hover:opacity-100 transition-opacity'}`}>
                <span className={`text-[10px] font-bold uppercase tracking-widest bg-slate-900/80 px-2 py-1 rounded border ${views ? 'text-slate-300 border-slate-700' : 'text-slate-600 border-slate-800'}`}>
                  {views ? `${fmt(displaySeq.length)} ${unit} ${shownLabel}` : `${displaySeq.length} bp`}
                </span>
              </div>
            </div>
          </div>

          {/* Translation (feature only) */}
          {feature?.translation && (
            <div className="space-y-3 pt-4 border-t border-slate-100">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Protein Translation</label>
                <button
                  onClick={handleCopyTranslation}
                  data-tip="Copy the protein sequence to the clipboard"
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-50 text-emerald-600 text-[10px] font-bold uppercase hover:bg-emerald-100 transition-colors"
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
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Additional Metadata</label>
              <div className="grid grid-cols-1 gap-2">
                {Object.entries(feature?.metadata || record.metadata || {}).filter(([key]) => !key.startsWith('_')).map(([key, value]) => (
                  <div key={key} className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">{key}</span>
                    <span className={`text-[11px] font-bold text-slate-700 max-w-[300px] ${hoverTips ? 'truncate' : 'min-w-0 break-words whitespace-normal'}`} data-tip={hoverTips ? String(value) : undefined}>
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
            data-tip="Copy the sequence shown to the clipboard"
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

  return portalTarget ? createPortal(modal, portalTarget) : modal;
};

export default RecordDetailsModal;

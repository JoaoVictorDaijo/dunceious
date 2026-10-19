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
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import type { DetailKey, SeqRecord } from '@/src/domain/bio/types';
import { DETAIL_QUALIFIER } from '@/src/domain/bio/details';
import { annotationFeatures } from '@/src/domain/bio/recordStatus';
import { detailsForExport, emptyReport } from '@/src/core/exportReport';
import { DETAIL_TO_MODIFIER } from '@/src/core/formats/ncbiModifiers';
import type { useHubState } from '@/src/app/hooks/useHubState';
import { buildSequenceSections } from '@/src/app/logic/hubModel';
import { buildFeatureGroups } from '@/src/app/logic/featureComparison';
import { describeExport, initialExportSelection, matchingExportIds, exportRecordsForOptions, EXPORT_EXTENSION, EXPORT_DETAIL_LABELS, type ExportOptions, type HubExportFormat } from '@/src/app/logic/exportPlan';
import ExportSequenceTree from './ExportSequenceTree';
import { hubEditCounts } from '@/src/app/logic/hubEdits';
import { getFeatureColor } from '@/src/app/viewer/colors';

const formats: { format: HubExportFormat; label: string; icon: string; what: string; where: string }[] = [
  { format: 'fasta', label: 'FASTA', icon: 'fa-dna', what: 'Sequences only', where: 'Aligners, BLAST, any sequence tool' },
  { format: 'genbank', label: 'GenBank', icon: 'fa-file-lines', what: 'Sequences, annotations and details', where: 'NCBI tools, SnapGene, Geneious, Biopython' },
  { format: 'gff3', label: 'GFF3', icon: 'fa-table-list', what: 'Annotations only', where: 'Genome browsers (IGV, JBrowse), pipelines' },
  { format: 'project', label: 'Dunceious project', icon: 'fa-box-archive', what: 'Everything, including colours and edit marks', where: 'Reopens only in Dunceious' },
];
export interface ExportDialogProps {
  featureColors?: Record<string, string>;
  records: SeqRecord[];
  state: ReturnType<typeof useHubState>;
  onClose: () => void;
  onExport: (ids: string[], format: HubExportFormat, options: ExportOptions) => void;
  onEditDetails: (ids: Set<string>) => void;
}
export default function ExportDialog({ featureColors, records, state, onClose, onExport, onEditDetails }: ExportDialogProps) {
  const { portalTarget, overlayActive, closeExportOnSave } = useUiEffects();
  const [initial] = useState(() => initialExportSelection({ ...state, records }));
  const [ids, setIds] = useState(initial.ids);
  const [quickPick, setQuickPick] = useState<string | null>(() => initial.ids.size === records.length ? 'All' : initial.preset === 'selected' ? 'Selected in hub' : 'Matching filters');
  const [format, setFormat] = useState<HubExportFormat>('fasta');
  const [keepGaps, setKeepGaps] = useState(false);
  const [details, setDetails] = useState(false);
  const [types, setTypes] = useState<Set<string> | undefined>();
  const [onlyMatching, setOnlyMatching] = useState(false);
  const [name, setName] = useState('sequences');
  const dialog = useRef<HTMLDivElement>(null);
  const gapsDescriptionId = useId();
  const gapsReason = 'No alignment loaded. Upload a pre-aligned FASTA to keep gap characters.';
  const hasAlignment = records.some(record => Boolean(record.alignedSequence));
  const chosen = useMemo(() => records.filter(record => ids.has(record.id)), [records, ids]);
  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    records.forEach(record => annotationFeatures(record).forEach(feature => counts.set(feature.type, (counts.get(feature.type) ?? 0) + 1)));
    return counts;
  }, [records]);
  const availableTypes = useMemo(() => [...typeCounts.keys()].sort(), [typeCounts]);
  const matchingKeys = useMemo(() => {
    const hubRecords = records.filter(record => !state.hubHidden.has(record.id));
    if (state.tab === 'features') return new Set(buildFeatureGroups(hubRecords, state.filters, state.onlyProblems).flatMap(group => group.rows.map(({ record, feature }) => `${record.id}:${record.features.indexOf(feature)}`)));
    return new Set(buildSequenceSections(hubRecords, state.filters, { grouped: false }, 'load').flatMap(section => section.rows.map(feature => `${section.record.id}:${section.record.features.indexOf(feature)}`)));
  }, [records, state.filters, state.tab, state.onlyProblems, state.hubHidden]);
  const extension = EXPORT_EXTENSION[format];
  const baseName = name.trim().replaceAll('/', '_').replaceAll('\\', '_').replace(new RegExp(`\\.${extension}$`, 'i'), '');
  const fileName = `${baseName || 'sequences'}.${extension}`;
  const options = useMemo<ExportOptions>(() => ({
    residues: keepGaps && hasAlignment ? 'aligned' : 'original', header: details ? 'details' : 'id',
    ...(format === 'genbank' || format === 'gff3' ? { types, matchingKeys: onlyMatching ? matchingKeys : undefined } : {}),
  }), [keepGaps, hasAlignment, details, format, types, onlyMatching, matchingKeys]);
  const preview = useMemo(() => {
    try { return { ...describeExport(chosen, format, options), error: '' }; }
    catch (error) { return { report: null, summary: '', error: error instanceof Error ? error.message : String(error) }; }
  }, [chosen, format, options]);
  const report = preview.report;
  const missingIds = useMemo(() => new Set(exportRecordsForOptions(chosen, format, options).filter(record => record.moleculeType !== 'protein' && !detailsForExport(record, emptyReport()).organism).map(record => record.id)), [chosen, format, options]);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    return () => { opener?.focus(); };
  }, []);
  useEffect(() => {
    // An explanation closing over the dialog has already handed focus back to the control that opened it.
    if (!overlayActive && !dialog.current?.closest('[inert]') && !dialog.current?.contains(document.activeElement)) dialog.current?.querySelector<HTMLElement>('button')?.focus();
    const focusInside = (event: FocusEvent) => {
      if (!overlayActive && dialog.current && !dialog.current.closest('[inert]') && !dialog.current.contains(event.target as Node)) dialog.current.querySelector<HTMLElement>('button')?.focus();
    };
    document.addEventListener('focusin', focusInside);
    return () => { document.removeEventListener('focusin', focusInside); };
  }, [overlayActive]);
  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Tab' && (overlayActive || dialog.current?.closest('[inert]'))) return;
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
    if (event.key !== 'Tab') return;
    const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>(':is(button, input, select, textarea, a[href], summary, [tabindex]):not(:disabled)') ?? []).filter(control => {
      if (control.tabIndex < 0 || control.closest('[hidden], [inert]')) return false;
      const closedDetails = control.closest('details:not([open])');
      if (closedDetails && control !== closedDetails.querySelector('summary')) return false;
      for (let element: HTMLElement | null = control; element && element !== dialog.current; element = element.parentElement) {
        const style = getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
      }
      return true;
    });
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };
  const pickIds = (pick: string) => (pick === 'All' ? new Set(records.map(record => record.id))
    : pick === 'Selected in hub' ? new Set(records.filter(record => state.selectedRecords.has(record.id) && !state.hubHidden.has(record.id)).map(record => record.id))
    : pick === 'Matching filters' ? matchingExportIds({ ...state, records })
    : pick === 'Shown in hub' ? new Set(records.filter(record => !state.hubHidden.has(record.id)).map(record => record.id))
    : pick === 'Shown in viewport' ? new Set(records.filter(record => record.visible !== false).map(record => record.id)) : new Set<string>());
  const quickPicks = ['All', 'Selected in hub', 'Matching filters', 'Shown in hub', 'Shown in viewport', 'None'].map(label => {
    const values = pickIds(label);
    return { label, values, active: quickPick === label };
  });
  const exportedAnnotationCount = useMemo(() => format === 'fasta' ? 0 : exportRecordsForOptions(chosen, format, options).reduce((count, record) => count + annotationFeatures(record).length, 0), [chosen, format, options]);
  const exportedEditCount = useMemo(() => format === 'fasta' ? 0 : exportRecordsForOptions(chosen, format, options).reduce((count, record) => count + hubEditCounts(record.features).total, 0), [chosen, format, options]);
  const swatch = (type: string) => <span key={type} data-type-swatch aria-hidden="true" className="inline-block h-[9px] w-[9px] shrink-0 rounded" style={{ backgroundColor: getFeatureColor(type, featureColors) }} />;
  const setType = (type: string, checked: boolean) => setTypes(prev => { const next = new Set(prev ?? availableTypes); if (checked) next.add(type); else next.delete(type); return next; });

  return createPortal(<div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4">
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="hub-export-title" tabIndex={-1} onKeyDown={keyboard} className="flex h-[700px] max-h-[calc(100dvh-32px)] w-full max-w-[1180px] flex-col overflow-hidden rounded-2xl border border-slate-300 bg-white text-slate-800 shadow-2xl [&_button]:focus-visible:outline [&_button]:focus-visible:outline-2 [&_button]:focus-visible:outline-amber-500 [&_input]:focus-visible:outline [&_input]:focus-visible:outline-2 [&_input]:focus-visible:outline-amber-500 [&_summary]:focus-visible:outline [&_summary]:focus-visible:outline-2 [&_summary]:focus-visible:outline-amber-500">
      <header className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-3"><div className="flex items-center gap-3"><span aria-hidden="true" className="flex h-[42px] w-[42px] items-center justify-center rounded-xl bg-amber-50 text-env"><i className="fas fa-file-export" /></span><div><h2 id="hub-export-title" className="text-[19px] font-bold">Export sequences</h2><p className="text-xs text-slate-500">Pick the sequences, then the format. Files are built in your browser.</p></div></div><button aria-label="Close export dialog" onClick={onClose} className="rounded px-3 py-2 text-xl">×</button></header>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] max-sm:grid-cols-1">
        <section className="flex min-h-0 flex-col border-r border-slate-200 p-4">
          <StepHeading number={1} label="Sequences" trailing={`${chosen.length} of ${records.length}`} />
          <div data-export-quick-picks className="mb-3 flex flex-wrap gap-1">{quickPicks.map(pick => <button key={pick.label} aria-label={pick.label} disabled={pick.label !== 'None' && pick.values.size === 0} aria-pressed={pick.active} onClick={() => { setQuickPick(pick.label); setIds(pick.values); }} className={`inline-flex h-[30px] items-center gap-1 rounded-full border px-3 text-xs font-semibold disabled:cursor-default disabled:opacity-40 ${pick.active ? 'border-amber-400 bg-amber-50 text-amber-800' : 'border-slate-300 bg-white hover:bg-slate-100'}`}>{pick.label}{pick.label !== 'None' && <span aria-hidden="true" className="font-mono text-[11px] text-slate-500">{pick.values.size}</span>}</button>)}</div>
          <ExportSequenceTree records={records} state={state} ids={ids} onChange={values => { setQuickPick(null); setIds(values); }} />
        </section>
        <section role="region" aria-label="Export options" className="min-h-0 overflow-y-auto bg-slate-50/50 px-5 py-3 text-xs">
          <StepHeading number={2} label="Format" />
          <div role="radiogroup" aria-label="File format" className="grid grid-cols-2 gap-2" onKeyDown={event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const index = formats.findIndex(choice => choice.format === format);
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? 3 : (index + (event.key === 'ArrowRight' ? 1 : -1) + 4) % 4;
            setFormat(formats[next].format);
            event.currentTarget.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();
          }}>{formats.map(choice => <button key={choice.format} role="radio" aria-label={choice.label} aria-checked={choice.format === format} tabIndex={choice.format === format ? 0 : -1} onClick={() => setFormat(choice.format)} className={`grid grid-cols-[38px_minmax(0,1fr)_auto] items-start gap-x-2 gap-y-0.5 rounded-xl border p-2.5 text-left ${choice.format === format ? 'border-env bg-amber-50 text-amber-800' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}><span aria-hidden="true" className={`row-span-3 flex h-[38px] w-[38px] items-center justify-center rounded-lg ${choice.format === format ? 'bg-env text-slate-950' : 'bg-slate-100 text-slate-700'}`}><i className={`fas ${choice.icon}`} /></span><span className="text-[15px] font-bold leading-5">{choice.label}</span><span className="font-mono text-[10px] leading-5">.{EXPORT_EXTENSION[choice.format]}</span><span className="col-span-2 col-start-2 text-[11px] leading-[14px] text-slate-700">{choice.what}</span><span className="col-span-2 col-start-2 text-[10.5px] leading-[14px] text-slate-500">{choice.where}</span></button>)}</div>
          <StepHeading number={3} label="Options" className="mt-2" />
          {format === 'fasta' ? <div className="space-y-3">
            <div data-gaps-option data-tip={!hasAlignment ? gapsReason : undefined}><label className={`flex items-center gap-2 ${!hasAlignment ? 'text-slate-500' : ''}`}><input type="checkbox" disabled={!hasAlignment} aria-describedby={!hasAlignment ? gapsDescriptionId : undefined} checked={keepGaps && hasAlignment} onChange={e => setKeepGaps(e.target.checked)} />Keep alignment gaps</label>{!hasAlignment && <span id={gapsDescriptionId} className="sr-only">{gapsReason}</span>}</div>
            <label className="flex items-center gap-2"><input type="checkbox" checked={details} onChange={e => setDetails(e.target.checked)} />Include details in the header (NCBI format)</label>
          </div> : format === 'project' ? <p>All sequence data and workspace colours are preserved.</p> : <div>
            <details className="relative rounded border border-slate-300"><summary className="cursor-pointer px-3 py-2">Annotation types · {types ? types.size : availableTypes.length} of {availableTypes.length}<span className="ml-2 inline-flex gap-1" aria-hidden="true">{availableTypes.filter(type => !types || types.has(type)).slice(0, 6).map(swatch)}</span></summary>
              <div className="absolute left-0 right-0 z-10 max-h-40 overflow-y-auto rounded border border-slate-300 bg-white p-2 shadow-lg"><div className="mb-1">
                <button onClick={() => setTypes(undefined)} className="mr-2 rounded-lg border border-slate-300 px-2 py-1 text-[11px]">All types</button><button onClick={() => setTypes(new Set())} className="rounded-lg border border-slate-300 px-2 py-1 text-[11px]">No annotations</button></div><div className="grid grid-cols-3 gap-x-3">
                {availableTypes.map(type => <label key={type} data-export-type={type} className="flex items-center gap-2 py-1"><input type="checkbox" aria-label={type} checked={types === undefined || types.has(type)} onChange={e => setType(type, e.target.checked)} />{swatch(type)}{type}<span className="ml-auto font-mono text-slate-500">{typeCounts.get(type)}</span></label>)}</div>
              </div>
            </details>
            <label className="mt-3 flex items-center gap-2"><input type="checkbox" checked={onlyMatching} onChange={e => setOnlyMatching(e.target.checked)} />Only annotations matching hub search and filters</label>
          </div>}
          <div className="mt-2 rounded-xl border border-slate-200 border-l-[3px] border-l-env bg-white p-2.5">
            <h3 className="mb-2 flex items-center gap-2 font-semibold"><i aria-hidden="true" className="fas fa-circle-info text-env" />What this file will contain</h3><p className="mb-2 flex flex-wrap gap-2"><CountPill>{chosen.length} {chosen.length === 1 ? 'sequence' : 'sequences'}</CountPill><CountPill>{exportedAnnotationCount} annotations</CountPill><CountPill>{exportedEditCount} edited or added</CountPill></p>
            {preview.error ? <p role="alert" className="text-rose-700">{preview.error}</p> : <>
              {(format === 'genbank' ? preview.summary.split('\n').slice(1) : preview.summary.split('\n')).map((line, index) => <p key={line} data-export-warning className={index ? 'mt-2 text-amber-800' : 'text-slate-600'}>{countedText(line)}</p>)}
              {Boolean(report?.missingOrganism) && <button className="mt-1 text-amber-800 underline" onClick={() => { onClose(); onEditDetails(missingIds); }}>Edit details</button>}
              {report && format === 'genbank' && <table aria-label="Detail qualifiers" className="w-full text-[11px]"><tbody>{(Object.keys(EXPORT_DETAIL_LABELS) as DetailKey[]).map(key => <tr key={key}><th scope="row" className="py-0.5 text-left font-medium">{EXPORT_DETAIL_LABELS[key]}</th><td className="font-mono text-slate-500">/{key === 'location' ? 'geo_loc_name / country' : DETAIL_QUALIFIER[key]}</td><td className="py-0.5 text-right font-mono">{report.writtenDetails[key]} written · {Math.max(0, chosen.length - report.writtenDetails[key] - report.invalidDetailsOmitted[key])} empty · <span className={report.invalidDetailsOmitted[key] ? 'text-amber-800' : undefined}>{report.invalidDetailsOmitted[key]} invalid, left out</span></td></tr>)}</tbody></table>}
              {report && format !== 'project' && <details className="mt-2"><summary className="cursor-pointer text-slate-600">Details and omissions{format === 'genbank' && report.droppedAttributes > 0 && ` · ${report.droppedAttributes} non-GenBank attributes left out`}</summary>
                <ul className="mt-2 space-y-1 text-[11px] text-slate-600">{(Object.keys(EXPORT_DETAIL_LABELS) as DetailKey[]).map(key => <li key={key} data-export-detail={key}>{EXPORT_DETAIL_LABELS[key]} · {format === 'fasta' ? DETAIL_TO_MODIFIER[key] : key === 'location' ? 'geo_loc_name / country' : DETAIL_QUALIFIER[key]} · <CountPill>{report.writtenDetails[key]}</CountPill> written{Boolean(report.invalidDetailsOmitted[key]) && <> · <CountPill>{report.invalidDetailsOmitted[key]}</CountPill> invalid {report.invalidDetailsOmitted[key] === 1 ? 'value' : 'values'} left out</>}</li>)}
                  {report.adjustedIds.map((id, index) => <li key={index}>ID: {id.from} → {id.to}</li>)}
                </ul>
              </details>}
            </>}
          </div>
          <label className="mt-2 block text-[10px] font-bold uppercase tracking-wider text-slate-500">File name<span className="mt-1 flex h-9 overflow-hidden rounded-lg border border-slate-300 bg-white font-mono text-xs font-normal normal-case tracking-normal"><input aria-label="File name" value={name} onChange={e => setName(e.target.value)} className="min-w-0 flex-1 bg-transparent px-3" /><span className="flex items-center border-l border-slate-200 bg-slate-50 px-3">.{extension}</span></span></label>
        </section>
      </div>
      <footer className="flex shrink-0 items-center gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3 text-xs">
        <p data-export-summary aria-live="polite" className="mr-auto">{chosen.length} {chosen.length === 1 ? 'sequence' : 'sequences'} · {exportedAnnotationCount} annotations → <span className="font-mono">{fileName}</span></p>

        <button onClick={onClose} className="rounded px-3 py-2 hover:bg-slate-200">Cancel</button>
        <button disabled={!chosen.length || Boolean(preview.error)} onClick={() => { onExport(chosen.map(record => record.id), format, { ...options, fileName }); if (closeExportOnSave) onClose(); }} className="rounded-lg bg-env px-4 py-2 font-semibold text-slate-950 disabled:opacity-40">Export {chosen.length} {chosen.length === 1 ? 'sequence' : 'sequences'}</button>
      </footer>
    </div>
  </div>, portalTarget ?? (document.querySelector('.app-root') ?? document.body));
}


function StepHeading({ number, label, className = '', trailing }: { number: number; label: string; className?: string; trailing?: string }) {
  return <h3 className={`mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider ${className}`}><span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 font-mono text-xs text-white">{number}</span>{label}{trailing && <span className="ml-auto font-mono font-normal normal-case tracking-normal text-slate-500">{trailing}</span>}</h3>;
}

function CountPill({ children }: { children: React.ReactNode }) {
  return <span className="rounded bg-white px-1.5 font-mono text-[11px] text-slate-700 ring-1 ring-slate-200">{children}</span>;
}

function countedText(text: string) {
  return text.split(/(\d[\d,]*)/).map((part, index) => /^\d/.test(part) ? <CountPill key={index}>{part}</CountPill> : part);
}

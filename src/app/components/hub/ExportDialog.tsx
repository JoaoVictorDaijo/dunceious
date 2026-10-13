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

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
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

const formats: { format: HubExportFormat; label: string; description: string }[] = [
  { format: 'fasta', label: 'FASTA', description: 'Sequences for alignment and sequence tools' },
  { format: 'genbank', label: 'GenBank', description: 'Sequences, annotations and details for GenBank / GenPept viewers' },
  { format: 'gff3', label: 'GFF3', description: 'Annotations and details for sequences already loaded in another tool' },
  { format: 'project', label: 'Dunceious project', description: 'Reopens only in Dunceious' },
];
export interface ExportDialogProps {
  records: SeqRecord[];
  state: ReturnType<typeof useHubState>;
  onClose: () => void;
  onExport: (ids: string[], format: HubExportFormat, options: ExportOptions) => void;
  onEditDetails: (ids: Set<string>) => void;
}
export default function ExportDialog({ records, state, onClose, onExport, onEditDetails }: ExportDialogProps) {
  const [initial] = useState(() => initialExportSelection({ ...state, records }));
  const [ids, setIds] = useState(initial.ids);
  const [format, setFormat] = useState<HubExportFormat>('fasta');
  const [keepGaps, setKeepGaps] = useState(false);
  const [details, setDetails] = useState(false);
  const [types, setTypes] = useState<Set<string> | undefined>();
  const [onlyMatching, setOnlyMatching] = useState(false);
  const [name, setName] = useState('sequences');
  const dialog = useRef<HTMLDivElement>(null);
  const hasAlignment = records.some(record => Boolean(record.alignedSequence));
  const chosen = useMemo(() => records.filter(record => ids.has(record.id)), [records, ids]);
  const availableTypes = useMemo(() => [...new Set(records.flatMap(record => annotationFeatures(record).map(feature => feature.type)))].sort(), [records]);
  const matchingKeys = useMemo(() => {
    if (state.tab === 'features') return new Set(buildFeatureGroups(records, state.filters, state.onlyProblems).flatMap(group => group.rows.map(({ record, feature }) => `${record.id}:${record.features.indexOf(feature)}`)));
    return new Set(buildSequenceSections(records, state.filters, { grouped: false }, 'load').flatMap(section => section.rows.map(feature => `${section.record.id}:${section.record.features.indexOf(feature)}`)));
  }, [records, state.filters, state.tab, state.onlyProblems]);
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
    dialog.current?.querySelector<HTMLElement>('button')?.focus();
    const focusInside = (event: FocusEvent) => {
      if (dialog.current && !dialog.current.contains(event.target as Node)) dialog.current.querySelector<HTMLElement>('button')?.focus();
    };
    document.addEventListener('focusin', focusInside);
    return () => { document.removeEventListener('focusin', focusInside); opener?.focus(); };
  }, []);
  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
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
  const quickPick = (pick: string) => setIds(pick === 'All' ? new Set(records.map(record => record.id))
    : pick === 'Selected in hub' ? new Set(records.filter(record => state.selectedRecords.has(record.id)).map(record => record.id))
    : pick === 'Matching filters' ? matchingExportIds({ ...state, records })
    : pick === 'Shown in viewport' ? new Set(records.filter(record => record.visible !== false).map(record => record.id)) : new Set());
  const setType = (type: string, checked: boolean) => setTypes(prev => { const next = new Set(prev ?? availableTypes); if (checked) next.add(type); else next.delete(type); return next; });

  return createPortal(<div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4">
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="hub-export-title" tabIndex={-1} onKeyDown={keyboard} className="flex h-[600px] max-h-[calc(100dvh-32px)] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-300 bg-white text-slate-800 shadow-2xl [&_button]:focus-visible:outline [&_button]:focus-visible:outline-2 [&_button]:focus-visible:outline-amber-500 [&_input]:focus-visible:outline [&_input]:focus-visible:outline-2 [&_input]:focus-visible:outline-amber-500 [&_summary]:focus-visible:outline [&_summary]:focus-visible:outline-2 [&_summary]:focus-visible:outline-amber-500">
      <header className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-3"><div><h2 id="hub-export-title" className="text-lg font-semibold">Export sequences</h2><p className="text-xs text-slate-500">Choose a subset and a format for your next tool.</p></div><button aria-label="Close export dialog" onClick={onClose} className="rounded px-3 py-2 text-xl">×</button></header>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(240px,0.85fr)_minmax(0,1.15fr)] max-sm:grid-cols-1">
        <section className="flex min-h-0 flex-col border-r border-slate-200 p-4">
          <h3 className="mb-2 text-sm font-semibold">1. Sequences</h3>
          <div className="mb-3 flex flex-wrap gap-1">{['All', 'Selected in hub', 'Matching filters', 'Shown in viewport', 'None'].map(pick => <button key={pick} onClick={() => quickPick(pick)} className="rounded border border-slate-300 px-2 py-1 text-[11px] hover:bg-slate-100">{pick}</button>)}</div>
          <ExportSequenceTree records={records} state={state} ids={ids} onChange={setIds} />
        </section>
        <section aria-label="Export options" className="min-h-0 p-4 text-xs">
          <h3 className="mb-2 text-sm font-semibold">2. Format</h3>
          <div role="radiogroup" aria-label="File format" className="grid grid-cols-4 rounded-lg border border-slate-300 p-1" onKeyDown={event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const index = formats.findIndex(choice => choice.format === format);
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? 3 : (index + (event.key === 'ArrowRight' ? 1 : -1) + 4) % 4;
            setFormat(formats[next].format);
            event.currentTarget.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();
          }}>{formats.map(choice => <button key={choice.format} role="radio" aria-checked={choice.format === format} tabIndex={choice.format === format ? 0 : -1} onClick={() => setFormat(choice.format)} className={`rounded px-2 py-2 text-[11px] font-medium ${choice.format === format ? 'bg-slate-800 text-white' : 'hover:bg-slate-100'}`}>{choice.label}</button>)}</div>
          <p className="mt-2 text-slate-500">{formats.find(choice => choice.format === format)?.description}</p>
          <h3 className="mb-2 mt-4 text-sm font-semibold">3. Options</h3>
          {format === 'fasta' ? <div className="space-y-3">
            <label className={`flex items-center gap-2 ${!hasAlignment ? 'text-slate-500' : ''}`}><input type="checkbox" disabled={!hasAlignment} checked={keepGaps && hasAlignment} onChange={e => setKeepGaps(e.target.checked)} />Keep alignment gaps</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={details} onChange={e => setDetails(e.target.checked)} />Include details in the header (NCBI format)</label>
          </div> : format === 'project' ? <p>All sequence data and workspace colours are preserved.</p> : <div>
            <details className="relative rounded border border-slate-300"><summary className="cursor-pointer px-3 py-2">Annotation types · {types ? types.size : availableTypes.length} of {availableTypes.length}</summary>
              <div className="absolute left-0 right-0 z-10 max-h-40 overflow-y-auto rounded border border-slate-300 bg-white p-2 shadow-lg">
                <button onClick={() => setTypes(undefined)} className="mr-3 underline">All types</button><button onClick={() => setTypes(new Set())} className="underline">No annotations</button>
                {availableTypes.map(type => <label key={type} className="flex items-center gap-2 py-1"><input type="checkbox" checked={types === undefined || types.has(type)} onChange={e => setType(type, e.target.checked)} />{type}</label>)}
              </div>
            </details>
            <label className="mt-3 flex items-center gap-2"><input type="checkbox" checked={onlyMatching} onChange={e => setOnlyMatching(e.target.checked)} />Only annotations matching hub search and filters</label>
          </div>}
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <h3 className="mb-1 font-semibold">What this file will contain</h3>
            {preview.error ? <p role="alert" className="text-rose-700">{preview.error}</p> : <>
              {preview.summary.split('\n').map((line, index) => <p key={line} className={index ? 'mt-2 text-amber-800' : 'text-slate-600'}>{line}</p>)}
              {Boolean(report?.missingOrganism) && <button className="mt-1 text-amber-800 underline" onClick={() => { onClose(); onEditDetails(missingIds); }}>Edit details</button>}
              {report && format !== 'project' && <details className="mt-2"><summary className="cursor-pointer text-slate-600">Details and omissions</summary>
                <ul className="mt-2 space-y-1 text-[11px] text-slate-600">{(Object.keys(EXPORT_DETAIL_LABELS) as DetailKey[]).map(key => <li key={key}>{EXPORT_DETAIL_LABELS[key]} · {format === 'fasta' ? DETAIL_TO_MODIFIER[key] : key === 'location' ? 'geo_loc_name / country' : DETAIL_QUALIFIER[key]} · {report.writtenDetails[key]} written{report.invalidDetailsOmitted[key] ? ` · ${report.invalidDetailsOmitted[key]} invalid ${report.invalidDetailsOmitted[key] === 1 ? 'value' : 'values'} left out` : ''}</li>)}
                  {report.adjustedIds.map((id, index) => <li key={index}>ID: {id.from} → {id.to}</li>)}
                </ul>
              </details>}
            </>}
          </div>
        </section>
      </div>
      <footer className="flex shrink-0 items-center gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3 text-xs">
        <p aria-live="polite" className="mr-auto">{chosen.length} {chosen.length === 1 ? 'sequence' : 'sequences'} → {fileName}</p>
        <label className="flex items-center gap-2">File name <span className="flex rounded border border-slate-300 bg-white"><input aria-label="File name" value={name} onChange={e => setName(e.target.value)} className="w-32 rounded-l bg-transparent px-2 py-2" /><span className="border-l border-slate-200 px-2 py-2 text-slate-500">.{extension}</span></span></label>
        <button onClick={onClose} className="rounded px-3 py-2 hover:bg-slate-200">Cancel</button>
        <button disabled={!chosen.length || Boolean(preview.error)} onClick={() => { onExport(chosen.map(record => record.id), format, { ...options, fileName }); onClose(); }} className="rounded bg-slate-800 px-4 py-2 font-semibold text-white disabled:opacity-40">Export</button>
      </footer>
    </div>
  </div>, document.body);
}

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

import { useId, useLayoutEffect, useRef } from 'react';
import type { DetailKey, SequenceDetails, SeqRecord } from '@/src/domain/bio/types';
import { DETAIL_QUALIFIER, readDetails, validateDetail } from '@/src/domain/bio/details';
import { INSDC_COUNTRIES } from '@/src/domain/bio/insdcVocabulary';

const fields: { key: DetailKey; label: string; placeholder: string }[] = [
  { key: 'organism', label: 'Organism', placeholder: 'Not specified' },
  { key: 'host', label: 'Host', placeholder: 'Not specified' },
  { key: 'location', label: 'Location', placeholder: 'Country or Country:Region' },
  { key: 'collectionDate', label: 'Collection date', placeholder: 'YYYY, Mon-YYYY or YYYY-MM-DD' },
];
function warningsFor(record: SeqRecord, draft: SequenceDetails) {
  const details = { ...readDetails(record), ...draft };
  return fields.map(({ key }) => details[key] !== (record.fileDetails?.[key] ?? '') ? validateDetail(key, details[key] ?? '') : null);
}
export function detailsEditorHeight(record: SeqRecord, draft: SequenceDetails, wide: boolean): number {
  return (wide ? 200 : 284) + (warningsFor(record, draft).some(Boolean) ? 36 : 0);
}
export default function DetailsEditor({ record, wide = false, focusField = 'organism', focusRequest = 0, draft, onChange, onSave, onCancel }: { wide?: boolean; focusField?: DetailKey; focusRequest?: number; record: SeqRecord; draft: SequenceDetails; onChange: (details: SequenceDetails) => void; onSave: (details: SequenceDetails) => void; onCancel: () => void }) {
  const details = { ...readDetails(record), ...draft };
  const warnings = warningsFor(record, draft);
  const id = useId();
  const form = useRef<HTMLFormElement>(null);
  useLayoutEffect(() => { form.current?.querySelector<HTMLInputElement>(`[data-detail-field="${focusField}"]`)?.focus(); }, [focusField, focusRequest]);
  return <form ref={form} aria-label={`Details for ${record.id}`} className="h-full border-y border-slate-300 border-l-[3px] border-l-env bg-slate-50 px-5 py-3 text-xs text-slate-700" onSubmit={event => { event.preventDefault(); onSave(draft); }} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onCancel(); } }}>
    <div data-editor-card className="flex h-full flex-col justify-between rounded-xl bg-white p-4 shadow-xs">
    <div data-editor-fields className={`grid gap-x-4 gap-y-3 ${wide ? 'grid-cols-4' : 'grid-cols-2'}`}>
      {fields.map(({ key, label, placeholder }, index) => {
        const value = details[key] ?? '';
        const edited = value !== (record.fileDetails?.[key] ?? '');
        const warning = warnings[index];
        const qualifier = key === 'location' ? record.locationQualifier ?? DETAIL_QUALIFIER[key] : DETAIL_QUALIFIER[key];
        return <div key={key}>
          <div className="mb-1 flex h-5 min-w-0 items-center gap-1.5">
            <label htmlFor={`${id}-${key}`} className="truncate font-semibold">{label} <span aria-hidden="true" className="font-mono font-normal text-slate-500">/{qualifier}</span></label>
            {edited && <span aria-hidden="true" className="rounded-sm bg-amber-50 px-1.5 text-[10px] text-amber-800">edited</span>}
          </div>
          <div className="relative">
            <input aria-label={label} data-detail-field={key} id={`${id}-${key}`} value={value} placeholder={placeholder} list={key === 'location' ? `${id}-countries` : undefined} aria-invalid={Boolean(warning)} aria-describedby={warning ? `${id}-${key}-warning` : undefined} className={`h-9 w-full rounded-lg border bg-white py-2 pl-2 pr-8 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500 ${warning ? 'border-amber-500 text-amber-800' : 'border-slate-300'}`} onChange={event => onChange({ ...draft, [key]: event.target.value })} />
            {edited && <button type="button" aria-label={`Revert ${label} to the file's value`} data-tip={`Revert ${label} to the file's value`} className="absolute inset-y-1 right-1 w-6 rounded-sm text-amber-700 hover:bg-amber-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500" onClick={() => onChange({ ...draft, [key]: record.fileDetails?.[key] ?? '' })}><i aria-hidden="true" className="fas fa-rotate-left" /></button>}
          </div>
          {warning && <p id={`${id}-${key}-warning`} data-tip={warning} className="h-[18px] truncate leading-[18px] text-amber-700">{warning}</p>}
        </div>;
      })}
    </div>
    <datalist id={`${id}-countries`}>{INSDC_COUNTRIES.map(country => <option key={country} value={country} />)}</datalist>
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0 text-slate-500"><p className="truncate">Imported from: <span>{record.importedFrom || 'Not specified'}</span></p><p className="truncate" data-tip="Invalid edited details are saved but left out of interchange exports until corrected.">Invalid edited details are saved but left out of interchange exports until corrected.</p></div>
      <div className="flex shrink-0 gap-2">
        <button type="submit" className="rounded-lg bg-env px-3 py-2 font-semibold text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500">Save details</button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-slate-300 px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500">Cancel</button>
      </div>
    </div>
    </div>
  </form>;
}

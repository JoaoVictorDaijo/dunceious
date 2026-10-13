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

import { useId } from 'react';
import type { DetailKey, SequenceDetails, SeqRecord } from '@/src/domain/bio/types';
import { DETAIL_QUALIFIER, readDetails, validateDetail } from '@/src/domain/bio/details';
import { INSDC_COUNTRIES } from '@/src/domain/bio/insdcVocabulary';

const fields: { key: DetailKey; label: string; placeholder: string }[] = [
  { key: 'organism', label: 'Organism', placeholder: 'Not specified' },
  { key: 'host', label: 'Host', placeholder: 'Not specified' },
  { key: 'location', label: 'Location', placeholder: 'Country or Country:Region' },
  { key: 'collectionDate', label: 'Collection date', placeholder: 'YYYY, Mon-YYYY or YYYY-MM-DD' },
];
export default function DetailsEditor({ record, draft, onChange, onSave, onCancel }: { record: SeqRecord; draft: SequenceDetails; onChange: (details: SequenceDetails) => void; onSave: (details: SequenceDetails) => void; onCancel: () => void }) {
  const details = { ...readDetails(record), ...draft };
  const id = useId();
  return <form aria-label={`Details for ${record.id}`} className="h-full overflow-y-auto border-b border-slate-200 bg-white px-5 py-4 text-xs text-slate-700" onSubmit={event => { event.preventDefault(); onSave(draft); }} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onCancel(); } }}>
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {fields.map(({ key, label, placeholder }) => {
        const value = details[key] ?? '';
        const edited = value !== (record.fileDetails?.[key] ?? '');
        const warning = edited ? validateDetail(key, value) : null;
        const qualifier = key === 'location' ? record.locationQualifier ?? DETAIL_QUALIFIER[key] : DETAIL_QUALIFIER[key];
        return <div key={key}>
          <label htmlFor={`${id}-${key}`} className="block font-semibold">{label}</label>
          <span className="font-mono text-slate-500">/{qualifier}</span>
          {edited && <span className="ml-2 text-amber-700">edited</span>}
          <input id={`${id}-${key}`} autoFocus={key === 'organism'} value={value} placeholder={placeholder} list={key === 'location' ? `${id}-countries` : undefined} aria-invalid={Boolean(warning)} aria-describedby={warning ? `${id}-${key}-warning` : undefined} className={`mt-1 w-full rounded border bg-white p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500 ${warning ? 'border-amber-500 text-amber-800' : 'border-slate-300'}`} onChange={event => onChange({ ...draft, [key]: event.target.value })} />
          {warning && <p id={`${id}-${key}-warning`} className="mt-1 text-amber-700">{warning}</p>}
          {edited && <button type="button" aria-label={`Revert ${label} to the file's value`} className="mt-1 py-1 text-amber-700 underline focus-visible:ring-2 focus-visible:ring-amber-500" onClick={() => onChange({ ...draft, [key]: record.fileDetails?.[key] ?? '' })}>Revert to the file's value</button>}
        </div>;
      })}
    </div>
    <datalist id={`${id}-countries`}>{INSDC_COUNTRIES.map(country => <option key={country} value={country} />)}</datalist>
    <p className="mt-4 text-slate-500">Imported from: <span>{record.importedFrom || 'Not specified'}</span></p>
    <p className="mt-2 text-slate-500">Invalid edited details are saved but left out of interchange exports until corrected.</p>
    <div className="mt-4 flex gap-3">
      <button type="submit" className="rounded bg-amber-100 px-3 py-2 text-amber-900 focus-visible:ring-2 focus-visible:ring-amber-500">Save details</button>
      <button type="button" onClick={onCancel} className="rounded border border-slate-300 px-3 py-2 focus-visible:ring-2 focus-visible:ring-amber-500">Cancel</button>
    </div>
  </form>;
}

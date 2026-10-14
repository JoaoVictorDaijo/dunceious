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

import type { DetailKey, SeqRecord } from '@/src/domain/bio/types';
import { isDetailEdited, readDetails, validateDetail } from '@/src/domain/bio/details';

const fields: { key: DetailKey; label: string }[] = [
  { key: 'host', label: 'Host' }, { key: 'location', label: 'Location' }, { key: 'collectionDate', label: 'Collected' },
];
export default function DetailsLine({ record, onAdd }: { record: SeqRecord; onAdd?: (field: DetailKey) => void }) {
  const details = readDetails(record);
  return <span className="flex min-w-0 gap-1.5 overflow-hidden">
    {fields.map(({ key, label }) => {
      const edited = isDetailEdited(record, key);
      const warning = edited ? validateDetail(key, details[key] ?? '') : null;
      if (!details[key] && onAdd) return <button key={key} onClick={() => onAdd(key)} className="whitespace-nowrap rounded-lg border border-dashed border-slate-300 px-2 text-slate-500 hover:text-amber-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500">+ {label}</button>;
      return <span key={key} data-detail={key} className={`min-w-0 truncate rounded-lg border px-2 ${edited ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'} ${warning ? 'text-amber-700' : ''}`}>
        <span title={warning ?? `${label}: ${details[key] || 'Not specified'}`}><span>{label}: </span><span>{details[key] || 'Not specified'}</span></span>
        {edited && <span className="ml-1 text-[10px]">· edited</span>}
        {warning && <span aria-label={`Warning: ${warning}`} className="ml-1"><i aria-hidden="true" className="fas fa-exclamation-triangle" /></span>}
      </span>;
    })}
  </span>;
}

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
import type { SeqRecord } from '@/src/domain/bio/types';

export default function DisplayName({ record, onRename }: { record: SeqRecord; onRename?: () => void }) {
  return <span className="inline-flex min-w-0 items-center gap-2">
    <span className="truncate font-semibold">{record.label || record.accession || record.id}</span>
    {record.label && <> <span className="truncate font-mono text-[10px] font-normal">{record.accession || record.id}</span></>}
    {onRename && <button aria-label={`Rename ${record.id}`} onClick={onRename} className="p-2 text-slate-500 focus-visible:ring-2 focus-visible:ring-amber-500"><i aria-hidden="true" className="fas fa-pen" /></button>}
  </span>;
}

export function DisplayNameEditor({ record, label, onChange, onSave, onCancel }: { record: SeqRecord; label: string; onChange: (label: string) => void; onSave: (label: string) => void; onCancel: () => void }) {
  const id = useId();
  return <form className="flex h-full flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-5 py-3 text-xs" onSubmit={event => { event.preventDefault(); onSave(label); }} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onCancel(); } }}>
    <label htmlFor={id}>Display name</label>
    <input autoFocus id={id} value={label} placeholder={record.accession || record.id} onChange={event => onChange(event.target.value)} className="min-w-0 flex-1 rounded border border-slate-300 p-2 focus-visible:ring-2 focus-visible:ring-amber-500" />
    <button type="submit" className="rounded bg-amber-100 px-3 py-2 focus-visible:ring-2 focus-visible:ring-amber-500">Save name</button>
    <button type="button" onClick={onCancel} className="rounded border border-slate-300 px-3 py-2 focus-visible:ring-2 focus-visible:ring-amber-500">Cancel</button>
    <p className="w-full text-slate-500">Display names are saved in the project only.</p>
  </form>;
}

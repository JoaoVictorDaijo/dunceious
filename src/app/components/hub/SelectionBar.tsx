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

import { useEffect, useRef, useState } from 'react';
import type { DetailKey, SeqRecord } from '@/src/domain/bio/types';
import type { useHubState } from '@/src/app/hooks/useHubState';
import { readDetails, validateDetail } from '@/src/domain/bio/details';
export interface SelectionBarProps {
  records: SeqRecord[]; state: ReturnType<typeof useHubState>; locked?: boolean;
  onSetDetail: (ids: Set<string>, key: DetailKey, value: string) => void;
  onToggleVisibility: (id: string) => void; onRemoveRecords: (ids: Set<string>) => void;
  onExport: () => void; onExportRows: (ids: string[], keys: Set<string>) => void; onDeleteRows: (keys: Set<string>) => void;
  organismEditRequest?: number;
}
export default function SelectionBar({ records, state, locked, onSetDetail, onToggleVisibility, onRemoveRecords, onExport, onExportRows, onDeleteRows, organismEditRequest = 0 }: SelectionBarProps) {
  const [field, setField] = useState<DetailKey>('host');
  const [value, setValue] = useState('');
  const [onlyEmpty, setOnlyEmpty] = useState(true);
  const [message, setMessage] = useState('');
  const valueInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!organismEditRequest) return;
    setField('organism'); setOnlyEmpty(true); setValue(''); setMessage('');
    valueInput.current?.focus();
  }, [organismEditRequest]);
  const chosen = records.filter(r => state.selectedRecords.has(r.id));
  const rows = state.selectedRows;
  if (!chosen.length && !rows.size) return null;
  const label = { host: 'Host', organism: 'Organism', location: 'Location', collectionDate: 'Collection date' }[field];
  const exportRows = () => onExportRows(records.filter(record => record.features.some((_, index) => rows.has(`${record.id}:${index}`))).map(record => record.id), new Set(rows));
  return <div aria-label="Selection actions" className="flex flex-wrap items-center gap-3 border-b border-amber-200 bg-amber-50 px-5 py-2 text-xs text-slate-700">
    {chosen.length > 0 && <>
      <strong>{chosen.length} sequences selected</strong>
      <button onClick={() => state.setFilters(f => ({ ...f, onlyIds: new Set(state.selectedRecords) }))}>Show only these</button><button onClick={() => state.setFilters(f => ({ ...f, onlyIds: undefined }))}>Show all</button>
      <button aria-haspopup="dialog" onClick={onExport}>Export…</button>
      <button onClick={() => chosen.filter(r => r.visible !== false).forEach(r => onToggleVisibility(r.id))}>Hide in viewport</button><button onClick={() => chosen.filter(r => r.visible === false).forEach(r => onToggleVisibility(r.id))}>Show in viewport</button>
      <label>Set detail <select aria-label="Detail field" value={field} onChange={e => setField(e.target.value as DetailKey)} className="rounded border border-slate-300 bg-white p-1"><option value="organism">Organism</option><option value="host">Host</option><option value="location">Location</option><option value="collectionDate">Collection date</option></select></label>
      <input ref={valueInput} aria-label="Detail value" value={value} onChange={e => setValue(e.target.value)} className="w-32 rounded border border-slate-300 bg-white p-1" />
      <label className="flex gap-1"><input type="checkbox" checked={onlyEmpty} onChange={e => setOnlyEmpty(e.target.checked)} />only where empty</label>
      <button disabled={locked || !value.trim()} onClick={() => {
        if (locked || !value.trim()) return;
        const eligible = chosen.filter(r => !onlyEmpty || !readDetails(r)[field]?.trim());
        const kept = chosen.length - eligible.length;
        onSetDetail(new Set(eligible.map(r => r.id)), field, value);
        setMessage(`Set ${label} on ${eligible.length} sequences${kept ? ` · ${kept} already had a value and kept it` : ''}`);
      }} className="rounded border border-slate-300 bg-white px-2 py-1 disabled:opacity-40">Apply</button>
      <button disabled={locked} className="text-rose-700 disabled:opacity-40" onClick={() => { if (!locked && window.confirm(`Remove ${chosen.length} sequences from the workspace?`)) { onRemoveRecords(new Set(chosen.map(r => r.id))); state.setSelectedRecords(new Set()); } }}>Remove…</button>
    </>}
    {rows.size > 0 && <><strong>{rows.size} annotations selected</strong><button onClick={exportRows}>Export GFF3</button><button disabled={locked} className="text-rose-700 disabled:opacity-40" onClick={() => { if (!locked) { onDeleteRows(new Set(rows)); state.setSelectedRows(new Set()); } }}>Delete with undo</button></>}
    <button onClick={() => { state.setSelectedRecords(new Set()); state.setSelectedRows(new Set()); }}>Clear</button>
    {message && <p role="status" className="w-full">{message}</p>}
    {value && validateDetail(field, value) && <p className="w-full text-amber-800">{validateDetail(field, value)} · This value will be left out of interchange exports.</p>}
  </div>;
}

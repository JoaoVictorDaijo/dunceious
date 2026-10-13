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

import { useState } from 'react';
import type { DetailKey, SeqRecord } from '@/src/domain/bio/types';
import type { useHubState } from '@/src/app/hooks/useHubState';
import { readDetails, validateDetail } from '@/src/domain/bio/details';
import HubMenu from './HubMenu';
export type HubExportFormat = 'fasta' | 'genbank' | 'gff3' | 'project';
export interface SelectionBarProps {
  records: SeqRecord[]; state: ReturnType<typeof useHubState>; locked?: boolean;
  onSetDetail: (ids: Set<string>, key: DetailKey, value: string) => void;
  onToggleVisibility: (id: string) => void; onRemoveRecords: (ids: Set<string>) => void;
  onExport: (records: SeqRecord[], format: HubExportFormat) => void; onDeleteRows: (keys: Set<string>) => void;
}
export default function SelectionBar({ records, state, locked, onSetDetail, onToggleVisibility, onRemoveRecords, onExport, onDeleteRows }: SelectionBarProps) {
  const [field, setField] = useState<DetailKey>('host');
  const [value, setValue] = useState('');
  const [onlyEmpty, setOnlyEmpty] = useState(true);
  const [message, setMessage] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const chosen = records.filter(r => state.selectedRecords.has(r.id));
  const rows = state.selectedRows;
  if (!chosen.length && !rows.size) return null;
  const label = { host: 'Host', organism: 'Organism', location: 'Location', collectionDate: 'Collection date' }[field];
  const exportRows = () => onExport(records.flatMap(record => {
    const selected = record.features.filter((_, index) => rows.has(`${record.id}:${index}`));
    return selected.length ? [{ ...record, features: [...record.features.filter(f => f.type === 'source'), ...selected] }] : [];
  }), 'gff3');
  return <div aria-label="Selection actions" className="flex flex-wrap items-center gap-3 border-b border-amber-200 bg-amber-50 px-5 py-2 text-xs text-slate-700">
    {chosen.length > 0 && <>
      <strong>{chosen.length} sequences selected</strong>
      <button onClick={() => state.setFilters(f => ({ ...f, onlyIds: new Set(state.selectedRecords) }))}>Show only these</button><button onClick={() => state.setFilters(f => ({ ...f, onlyIds: undefined }))}>Show all</button>
      <div className="relative"><button aria-haspopup="menu" aria-expanded={exportOpen} onClick={() => setExportOpen(!exportOpen)}>Export…</button>{exportOpen && <HubMenu label="Export selected sequences" onClose={() => setExportOpen(false)}>{(['fasta', 'genbank', 'gff3', 'project'] as const).map(format => <button role="menuitem" className="block w-full p-2 text-left" key={format} onClick={() => { setExportOpen(false); onExport(chosen, format); }}>{format === 'project' ? 'Dunceious project' : format === 'genbank' ? 'GenBank' : format.toUpperCase()}</button>)}</HubMenu>}</div>
      <button onClick={() => chosen.filter(r => r.visible !== false).forEach(r => onToggleVisibility(r.id))}>Hide in viewport</button><button onClick={() => chosen.filter(r => r.visible === false).forEach(r => onToggleVisibility(r.id))}>Show in viewport</button>
      <label>Set detail <select aria-label="Detail field" value={field} onChange={e => setField(e.target.value as DetailKey)} className="rounded border border-slate-300 bg-white p-1"><option value="organism">Organism</option><option value="host">Host</option><option value="location">Location</option><option value="collectionDate">Collection date</option></select></label>
      <input aria-label="Detail value" value={value} onChange={e => setValue(e.target.value)} className="w-32 rounded border border-slate-300 bg-white p-1" />
      <label className="flex gap-1"><input type="checkbox" checked={onlyEmpty} onChange={e => setOnlyEmpty(e.target.checked)} />only where empty</label>
      <button disabled={locked} onClick={() => {
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

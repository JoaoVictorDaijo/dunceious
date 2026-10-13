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

import { useMemo, useState } from 'react';
import type { SeqRecord } from '@/src/domain/bio/types';
import type { useHubState } from '@/src/app/hooks/useHubState';
import { buildSequenceSections, matchesSequence } from '@/src/app/logic/hubModel';

export default function ExportSequenceTree({ records, state, ids, onChange }: {
  records: SeqRecord[]; state: ReturnType<typeof useHubState>; ids: Set<string>; onChange: (ids: Set<string>) => void;
}) {
  const [find, setFind] = useState('');
  const [folds, setFolds] = useState(new Set<string>());
  const groups = useMemo(() => {
    const sections = buildSequenceSections(records, { query: '', sequenceQuery: '', types: new Set(), strand: 'all', needsAttention: false }, state.grouped ? { grouped: true, field: state.groupField } : { grouped: false }, state.sort);
    const result = new Map<string, SeqRecord[]>();
    sections.forEach(section => { const key = section.group ?? 'All sequences'; result.set(key, [...(result.get(key) ?? []), section.record]); });
    return result;
  }, [records, state.grouped, state.groupField, state.sort]);
  const toggle = (values: string[], checked: boolean) => {
    const next = new Set(ids);
    values.forEach(id => { if (checked) next.add(id); else next.delete(id); });
    onChange(next);
  };
  return <>
    <label className="block text-xs font-medium">Find sequences<input type="search" aria-label="Find sequences to export" value={find} onChange={e => setFind(e.target.value)} className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 font-normal" /></label>
    <div role="region" aria-label="Sequences to export" className="mt-3 min-h-0 flex-1 overflow-y-auto rounded border border-slate-200">
      {[...groups].map(([group, members]) => {
        const visible = members.filter(record => matchesSequence(record, find));
        if (!visible.length) return null;
        const checked = members.every(record => ids.has(record.id));
        const partial = !checked && members.some(record => ids.has(record.id));
        const folded = folds.has(group) && !find.trim();
        return <div key={group}>
          <div className="sticky top-0 flex items-center gap-2 border-b border-slate-200 bg-slate-100 px-3 py-2 text-xs font-semibold">
            <input type="checkbox" aria-label={`Export group ${group}`} checked={checked} ref={input => { if (input) input.indeterminate = partial; }} onChange={e => toggle(members.map(record => record.id), e.target.checked)} />
            <button aria-expanded={!folded} onClick={() => setFolds(prev => { const next = new Set(prev); if (next.has(group)) next.delete(group); else next.add(group); return next; })} className="flex flex-1 items-center gap-2 text-left"><span aria-hidden="true">{folded ? '▸' : '▾'}</span>{group}<span className="ml-auto text-slate-500">{members.length}</span></button>
          </div>
          {!folded && visible.map(record => <label key={record.id} className="flex items-center gap-3 border-b border-slate-100 px-4 py-2 text-xs hover:bg-slate-50">
            <input type="checkbox" aria-label={`Export ${record.id}`} checked={ids.has(record.id)} onChange={e => toggle([record.id], e.target.checked)} />
            <span className="min-w-0 truncate">{record.label || record.accession || record.id}{record.label && <span className="ml-2 font-mono text-slate-500">{record.accession || record.id}</span>}</span>
          </label>)}
        </div>;
      })}
      {![...groups.values()].flat().some(record => matchesSequence(record, find)) && <p className="p-4 text-xs text-slate-500">No sequences match</p>}
    </div>
  </>;
}

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

import type { SequenceSection } from '@/src/app/logic/hubModel';
import { isolateOf, annotationFeatures, isPartial, isEdited, isUnannotated } from '@/src/domain/bio/recordStatus';
import { readDetails } from '@/src/domain/bio/details';
import type { BioFeature } from '@/src/domain/bio/types';
import GenomeStrip from './GenomeStrip';
export default function SequenceSectionHeader({ section, folded, selected, onFold, onSelect, onVisibility, onPick, highlight, onEditDetails }: { section: SequenceSection; folded: boolean; selected: boolean; onFold: () => void; onSelect: () => void; onVisibility: () => void; onPick: (feature: BioFeature) => void; highlight?: BioFeature | null; onEditDetails?: () => void }) {
  const { record, rows, total } = section;
  const composition = new Map<string, number>();
  annotationFeatures(record).forEach(f => composition.set(f.type, (composition.get(f.type) ?? 0) + 1));
  const details = readDetails(record);
  return <div className="h-full border-b border-slate-200 bg-slate-50 px-5 py-2 text-xs text-slate-600">
    <div className="flex items-center gap-3">
      <button aria-label={`${folded ? 'Expand' : 'Collapse'} ${record.id}`} aria-expanded={!folded} onClick={onFold} className="p-2">{folded ? '▸' : '▾'}</button>
      <input type="checkbox" aria-label={`Select sequence ${record.id}`} checked={selected} onChange={onSelect} />
      <span className="font-semibold text-slate-900">{record.label || record.accession || record.id}</span>{record.label && <span className="font-mono">{record.accession || record.id}</span>}
      <span className="ml-auto">{record.sequence.length.toLocaleString()} {record.moleculeType === 'protein' ? 'aa' : 'bp'} · {rows.length === total ? total : `${rows.length}/${total}`} annotations{Boolean(record.tracks?.length) && ` · ${record.tracks?.length} tracks`}</span>
      <button aria-label={`${record.visible === false ? 'Show' : 'Hide'} ${record.id} in viewport`} onClick={onVisibility} className="p-2"><i aria-hidden="true" className={`fas ${record.visible === false ? 'fa-eye-slash' : 'fa-eye'}`} /></button>
    </div>
    <p className="truncate">{isolateOf(record)}</p>
    {folded ? <p className="mt-2">{[...composition].map(([type, count]) => `${count} ${type}`).join(' · ')}</p> : <>
      <div className="my-1 flex items-center gap-3"><span className="truncate">{[details.host, details.location, details.collectionDate].filter(Boolean).join(' · ') || 'No details specified'}</span>{onEditDetails && <button onClick={onEditDetails} className="text-amber-700 underline">Edit details</button>}
      {record.isCircular && <span>CIRCULAR</span>}{isPartial(record) && <span>Partial</span>}{isUnannotated(record) && <span>Unannotated</span>}{isEdited(record) && <span>Edited</span>}</div>
      <GenomeStrip record={record} large highlight={f => highlight ? f === highlight : rows.includes(f)} onPick={onPick} />
    </>}
  </div>;
}

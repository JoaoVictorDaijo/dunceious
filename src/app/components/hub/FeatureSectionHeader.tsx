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

import type { FeatureGroup } from '@/src/app/logic/featureComparison';
import { featureLength } from '@/src/app/logic/viewModel';
const CELL_CLASSES = { present: 'bg-slate-600', odd: 'bg-amber-400', duplicate: 'bg-violet-400', missing: 'border-2 border-rose-500 bg-white', 'not-determined': 'bg-slate-200 bg-[repeating-linear-gradient(45deg,transparent,transparent_2px,#94a3b8_2px,#94a3b8_3px)]', unannotated: 'border border-slate-300 bg-white', absent: 'bg-slate-100' };
export default function FeatureSectionHeader({ group, folded, onFold, onSequence }: { group: FeatureGroup; folded: boolean; onFold: () => void; onSequence: (id: string) => void }) {
  const lengths = group.rows.map(({ record, feature }) => featureLength(record.sequence.length, feature.start, feature.end, feature.segments));
  const counts = group.counts;
  return <div className="h-full border-b border-slate-200 bg-slate-50 px-5 py-2 text-xs text-slate-600">
    <div className="flex items-center gap-3"><button aria-label={`${folded ? 'Expand' : 'Collapse'} ${group.identity}`} aria-expanded={!folded} onClick={onFold} className="p-2">{folded ? '▸' : '▾'}</button><strong className="text-slate-900">{group.identity}</strong><span>{group.types.join(' · ')}</span><span className="ml-auto">in {counts.present} of {counts.pool}</span></div>
    <p>Median position {Math.round(group.medianStart) + 1} · {Math.min(...lengths)}–{Math.max(...lengths)} {group.rows[0]?.record.moleculeType === 'protein' ? 'aa' : 'bp'}</p>
    <div className="my-1 flex flex-wrap gap-2">{!group.compared ? <span>not compared: {group.notComparedReason}</span> : <>
      {counts.missing > 0 && <span className="text-rose-700">missing in {counts.missing}</span>}{counts.odd > 0 && <span className="text-amber-700">{counts.odd} odd length</span>}{counts.duplicate > 0 && <span>{counts.duplicate} duplicate</span>}{counts.notDetermined > 0 && <span>{counts.notDetermined} not determined</span>}{group.accessory && <span>accessory</span>}
    </>}</div>
    <div role="group" aria-label="Presence" className="flex gap-1">{group.cells.map(cell => <button key={cell.recordId} aria-label={`${cell.recordId}: ${cell.state === 'not-determined' ? 'not determined (partial)' : cell.state}`} title={`${cell.recordId}: ${cell.state}`} className={`state-${cell.state} h-4 min-w-2 flex-1 rounded-sm focus-visible:ring-2 focus-visible:ring-amber-500 ${CELL_CLASSES[cell.state]}`} onClick={() => onSequence(cell.recordId)} />)}</div>
    {!folded && counts.missing > 0 && <div className="mt-1 truncate">Missing: {group.cells.filter(c => c.state === 'missing').map(c => <button key={c.recordId} className="mr-2 text-rose-700 underline" onClick={() => onSequence(c.recordId)}>{c.recordId}</button>)}</div>}
  </div>;
}

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

import type { LocalSearchCounts } from '@/src/core/search/local/selection';
import type { HitMode } from '@/src/core/search/hitColumns';
import { useSessionOpenState } from '../../hooks/useSessionOpenState';
import SectionTitle from '../SectionTitle';

export function SearchDetails({ mode, recordCount, counts }: { mode: HitMode; recordCount: number; counts?: LocalSearchCounts | null }) {
  const [open, setOpen] = useSessionOpenState('details');
  return <details data-search-details="" open={open} onToggle={e => setOpen(e.currentTarget.open)} className="group mt-4 text-xs text-slate-400">
    <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
      <SectionTitle icon="fa-info-circle" trailing={<i aria-hidden="true" className="fas fa-chevron-up text-[10px] transition-transform group-open:rotate-180 motion-reduce:transition-none" />}>Search details</SectionTitle>
    </summary>
    {counts && <div className="space-y-1">
      <p>{counts.exact ? 'Exact counts' : 'Counts are lower bounds; more alignments exist that were not counted'}</p>
      <p>{counts.streams} streams searched (exact)</p>
      <p>{counts.noPositiveStreams} streams with no positive alignment (exact)</p>
      <p>{counts.skippedRecords.length} records skipped (exact)</p>
      {counts.skippedRecords.map(r => <p key={r.recordId}>{r.recordId}: unsupported characters {r.characters.join(', ')}</p>)}
      <p>{counts.exact ? '' : 'at least '}{counts.hiddenByOverlap} hidden by overlap{counts.exact ? ' (exact)' : ''}</p>
      <p>{counts.exact ? '' : 'at least '}{counts.hiddenByFilters} hidden by display filters{counts.exact ? ' (exact)' : ''}</p>
      <p>{counts.exact ? '' : 'at least '}{counts.beyondLimit} beyond the result limit{counts.exact ? ' (exact)' : ''}</p>
    </div>}
    <p>Hits across {recordCount} records.</p>
    <ul className="space-y-1 mt-2" aria-label="Search marks legend">
      <li>| Identical: hit tint and record letter</li>
      <li>{mode === 'local' ? ': Similar: dashed outline, positive matrix score' : ': Matched through an ambiguity code: dotted underline'}</li>
      <li>. Mismatch: ink cell, query letter above</li>
      {mode !== 'iupac' && <><li>− Record base absent from the query: slate cell</li>
      <li>▼ Extra query bases: violet caret between record bases</li></>}
    </ul>
  </details>;
}

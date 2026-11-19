/*
 * Dunceious
 * Copyright (C) 2026 João Victor Daijo and Murilo Cassiano
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
import { Term } from './fields';

/** A non-zero count that hides or drops hits turns amber so it is never read as routine. */
function CountRow({ label, tip, count, warn }: { label: string; tip: string; count: number; warn?: boolean }) {
  const flagged = warn && count > 0;
  return <div className={`flex items-baseline justify-between gap-3 px-3 py-1.5 ${flagged ? 'text-amber-300' : 'text-slate-400'}`}>
    <dt className="text-[11px] font-semibold"><Term tip={tip}>{label}</Term></dt>
    <dd className={`text-[12px] font-bold tabular-nums ${flagged ? 'text-amber-300' : count === 0 ? 'text-slate-600' : 'text-slate-200'}`}>{count}</dd>
  </div>;
}

function Mark({ glyph, term, children }: { glyph: string; term: string; children: string }) {
  return <li className="flex items-start gap-2.5">
    <span aria-hidden="true" className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-slate-700 bg-slate-950 font-mono text-[11px] font-bold text-slate-200">{glyph}</span>
    <span className="min-w-0 text-[11px] leading-snug"><span className="font-semibold text-slate-200">{term}</span> <span className="text-slate-500">{children}</span></span>
  </li>;
}

export function SearchDetails({ mode, counts }: { mode: HitMode; counts?: LocalSearchCounts | null }) {
  const [open, setOpen] = useSessionOpenState('details');
  return <details data-search-details="" open={open} onToggle={e => setOpen(e.currentTarget.open)} className="group mt-4 text-xs text-slate-400">
    <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
      <SectionTitle icon="fa-info-circle" trailing={<i aria-hidden="true" className="fas fa-chevron-up text-[10px] transition-transform group-open:rotate-180 motion-reduce:transition-none" />}>Search details</SectionTitle>
    </summary>
    <div className="stack-y-3">
      {counts && <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60">
        <p className={`flex items-start gap-2 px-3 py-2 text-[11px] font-semibold ${counts.cutoff === null ? 'text-sky-300' : 'bg-amber-500/5 text-amber-200'}`}>
          <i aria-hidden="true" className={`fas ${counts.cutoff === null ? 'fa-circle-check text-sky-400' : 'fa-filter text-amber-500'} mt-0.5 text-[10px]`} />
          <span>{counts.cutoff === null ? 'Exact counts across all alignments' : `Counts cover alignments scoring at least ${counts.cutoff} in EMBOSS units`}</span>
        </p>
        <dl className="border-t border-slate-800 py-1">
          <CountRow label="Streams searched" count={counts.streams}
            tip="A stream is one record on one strand; each is aligned on its own." />
          <CountRow label="No positive alignment" count={counts.noPositiveStreams} warn
            tip="Streams where no local alignment scored above zero." />
          <CountRow label="Records skipped" count={counts.skippedRecords.length} warn
            tip="Records holding characters the scoring matrix does not define." />
          {counts.skippedRecords.map(r => <p key={r.recordId} className="px-3 pb-1.5 text-[11px] text-rose-300">{`${r.recordId}: unsupported characters ${r.characters.join(', ')}`}</p>)}
          <CountRow label="Hidden by overlap" count={counts.hiddenByOverlap} warn
            tip="A hit overlapping an earlier kept hit on the same record and strand is hidden before display filters apply." />
          <CountRow label="Hidden by display filters" count={counts.hiddenByFilters} warn
            tip="Hits below Min identity or Min query coverage." />
          <CountRow label="Beyond the result limit" count={counts.beyondLimit} warn
            tip="Hits ranked past the result limit." />
        </dl>
      </div>}
      <ul className="stack-y-2 rounded-xl border border-slate-800 bg-slate-900/60 p-3" aria-label="Search marks legend">
        <Mark glyph="|" term="Identical">hit tint and record letter</Mark>
        {mode === 'local'
          ? <Mark glyph=":" term="Similar">dashed outline, positive matrix score</Mark>
          : <Mark glyph=":" term="Ambiguity match">dotted underline</Mark>}
        <Mark glyph="." term="Mismatch">ink cell, query letter above</Mark>
        {mode !== 'iupac' && <>
          <Mark glyph="−" term="Not in query">record base on a slate cell</Mark>
          <Mark glyph="▼" term="Extra query bases">violet caret between record bases</Mark>
        </>}
      </ul>
    </div>
  </details>;
}

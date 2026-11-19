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

import type { LocalFilters } from '@/src/core/search/local/stream';
import { loadScoring, scoringFor } from '@/src/core/search/local/scoring';
import { useSessionOpenState } from '../../hooks/useSessionOpenState';
import SectionTitle from '../SectionTitle';
import { NumberField, Term } from './fields';

/** Definitions follow the result cards and the EMBOSS 6.6.0 water/matcher conventions in docs/specs/2026-10-16-search-local-alignment.md. */
const FILTERS = [
  { key: 'minIdentity', label: 'Min identity',
    tip: 'Identity = 100 × identical columns ÷ alignment length, gap columns included. Off shows every hit.' },
  { key: 'minQueryCoverage', label: 'Min query coverage',
    tip: 'Query coverage = 100 × aligned query residues ÷ query length. Off shows every hit.' },
] as const;

function scoringTip(isProtein: boolean, gapOpen: number, gapExtend: number): string {
  return [
    `EMBOSS water defaults. A gap of length n costs ${gapOpen} + (n − 1) × ${gapExtend}.`,
    'Similarity counts columns with a positive matrix score.',
    !isProtein && 'Ambiguity codes score in both sequences; T and U score alike but differ for identity; N/N is identical, not similar.',
    'Co-optimal paths follow EMBOSS matcher order and may differ from water.',
  ].filter(Boolean).join(' ');
}

export default function LocalOptions({ filters, onChange, isProtein }: { filters: LocalFilters; onChange: (f: LocalFilters) => void; isProtein: boolean }) {
  const [open, setOpen] = useSessionOpenState('local-options');
  const scoring = loadScoring(scoringFor(isProtein));
  const gapOpen = scoring.gapOpen2 / 2, gapExtend = scoring.gapExtend2 / 2;
  return <details data-local-options="" open={open} onToggle={e => setOpen(e.currentTarget.open)} className="group text-xs text-slate-400">
    <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden"><SectionTitle icon="fa-sliders" trailing={<i aria-hidden="true" className="fas fa-chevron-up text-[10px] transition-transform group-open:rotate-180 motion-reduce:transition-none" />}>Local options</SectionTitle></summary>
    <div className="divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-900/60">
      {FILTERS.map(({ key, label, tip }) => <div key={key} className="flex items-center justify-between gap-3 py-2 pl-3 pr-2">
        <label htmlFor={`local-${key}`} className="text-[11px] font-semibold text-slate-300"><Term tip={tip}>{label}</Term></label>
        <NumberField id={`local-${key}`} label={label} tip={tip} value={filters[key]} min={0} max={100} step={5} nullable
          placeholder="Off" suffix="%" className="w-[84px] shrink-0"
          onChange={value => onChange({ ...filters, [key]: value === null ? null : Math.max(0, Math.min(100, value)) })} />
      </div>)}
      <div className="flex items-center justify-between gap-3 px-3 py-2.5">
        <span className="text-[11px] font-semibold text-slate-300"><Term tip={scoringTip(isProtein, gapOpen, gapExtend)}>Scoring</Term></span>
        <span className="text-right text-[11px] font-semibold text-slate-200">
          {scoring.id} <span className="font-medium text-slate-500">gap {gapOpen}/{gapExtend}</span>
        </span>
      </div>
    </div>
  </details>;
}

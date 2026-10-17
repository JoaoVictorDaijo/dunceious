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

import type { LocalFilters } from '@/src/core/search/local/stream';
import { loadScoring, scoringFor } from '@/src/core/search/local/scoring';
import { useSessionOpenState } from '../../hooks/useSessionOpenState';
import SectionTitle from '../SectionTitle';
export default function LocalOptions({ filters, onChange, isProtein }: { filters: LocalFilters; onChange: (f: LocalFilters) => void; isProtein: boolean }) {
  const [open, setOpen] = useSessionOpenState('local-options');
  return <details data-local-options="" open={open} onToggle={e => setOpen(e.currentTarget.open)} className="group text-xs text-slate-400">
    <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden"><SectionTitle icon="fa-sliders" trailing={<i aria-hidden="true" className="fas fa-chevron-up text-[10px] transition-transform group-open:rotate-180 motion-reduce:transition-none" />}>Local options</SectionTitle></summary>
    <div className="space-y-3">
      {([['minIdentity', 'Min identity'], ['minQueryCoverage', 'Min query coverage']] as const).map(([key, label]) => <label key={key} className="flex items-center justify-between gap-2">{label}
        <input aria-label={label} type="number" min="0" max="100" placeholder="Off" value={filters[key] ?? ''}
          className="w-20 rounded-lg border border-slate-700 bg-slate-950 p-2"
          onChange={e => onChange({ ...filters, [key]: e.target.value === '' ? null : Math.max(0, Math.min(100, Number(e.target.value))) })} />
      </label>)}
      <p>Identity = 100 × identical columns / alignment length. Query coverage = 100 × aligned query residues / query length. These display filters are off by default.</p>
      <p>{loadScoring(scoringFor(isProtein)).label}</p>
      {!isProtein && <p>Ambiguity codes score in both sequences. T and U score alike but are different for identity; N/N is identical but not similar.</p>}
      <p>Similarity counts positive matrix scores. Length includes gap columns; a gap costs 10 + (length − 1) × 0.5.</p>
      <p>Co-optimal paths follow EMBOSS matcher tie order and may differ from water. Hits that overlap an earlier kept hit on the same record and strand are hidden before display filters.</p>
    </div>
  </details>;
}

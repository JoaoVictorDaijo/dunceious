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

import { HubEditCounts } from './HubEditMarks';
import { memo, useMemo } from 'react';
import type { SeqRecord } from '@/src/domain/bio/types';
import DisplayName from './DisplayName';
import type { FeatureGroup } from '@/src/app/logic/featureComparison';
import { featureLength } from '@/src/app/logic/viewModel';
import { getFeatureColor } from '@/src/app/viewer/colors';
import { PRESENCE_CLASSES, presenceLabel, presenceStyle } from './presence';
const layout = { padding: 8, borders: 2, title: 32, stats: 20, gap: 4, cell: 14, tags: 20, missing: 16 };
function presenceHeight(group: FeatureGroup, width: number) {
  const columns = Math.max(1, Math.floor((width - 40 + layout.gap) / (layout.cell + layout.gap)));
  const rows = Math.max(1, Math.ceil(group.cells.length / columns));
  return rows * layout.cell + (rows - 1) * layout.gap;
}
function hasComparisonTags(group: FeatureGroup): boolean {
  return !group.compared || group.accessory || Boolean(group.counts.missing || group.counts.odd || group.counts.duplicate || group.counts.notDetermined);
}

export function featureSectionHeight(group: FeatureGroup, folded: boolean, width = 1000, gap = 0): number {
  return gap + layout.padding * 2 + layout.borders + layout.title + layout.stats + layout.gap + presenceHeight(group, width)
    + (hasComparisonTags(group) ? layout.tags + layout.gap : 0) + (!folded && group.counts.missing ? layout.missing + layout.gap : 0);
}

function FeatureSectionHeader({ group, folded, onFold, onSequence, records = [], featureColors, width = 1000, gap = 0, current = false }: { current?: boolean; width?: number; gap?: number; featureColors?: Record<string, string>; records?: SeqRecord[]; group: FeatureGroup; folded: boolean; onFold: () => void; onSequence: (id: string) => void }) {
  const lengths = useMemo(() => group.rows.map(({ record, feature }) => featureLength(record.sequence.length, feature.start, feature.end, feature.segments)), [group]);
  const counts = group.counts;
  const recordById = useMemo(() => new Map(records.map(record => [record.id, record])), [records]);
  const sequenceName = (id: string) => { const record = recordById.get(id); return record ? [record.accession || record.id, record.label].filter(Boolean).join(' · ') : id; };
  const color = group.types.length === 1 ? getFeatureColor(group.types[0], featureColors) : undefined;
  return <div data-section-entry style={{ height: featureSectionHeight(group, folded, width, gap) }}>
    {gap > 0 && <div data-section-gap className="bg-transparent" style={{ height: gap }} />}
    <div data-feature-surface data-state={current ? 'current' : 'idle'} className={`border-b border-slate-100 px-5 text-xs text-slate-600 ${current ? 'hub-surface-current' : 'bg-white'}`} style={{ paddingTop: layout.padding, paddingBottom: layout.padding, height: featureSectionHeight(group, folded, width) }}>
      <div data-feature-title className="flex min-w-0 items-center gap-3" style={{ height: layout.title }}>
        <button aria-label={`${folded ? 'Expand' : 'Collapse'} ${group.identity}`} aria-expanded={!folded} data-tip={folded ? 'Expand feature group' : 'Collapse feature group'} onClick={onFold} className="p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500"><i aria-hidden="true" className={`fas fa-chevron-down transition-transform motion-reduce:transition-none ${folded ? '-rotate-90' : ''}`} /></button>
        <strong className={`min-w-0 truncate font-mono font-bold ${current ? 'text-amber-800' : 'text-slate-900'}`} data-tip={group.identity}>{group.identity}</strong>
        <div className="flex min-w-0 gap-1 overflow-hidden">{group.types.map(type => { const color = getFeatureColor(type, featureColors); return <span key={type} className="flex h-[22px] shrink-0 items-center rounded-md border px-2 font-mono text-[11.5px]" style={{ background: `color-mix(in srgb, ${color} 13%, white)`, borderColor: `color-mix(in srgb, ${color} 28%, white)`, color: `color-mix(in srgb, ${color} 62%, #0f172a)` }}>{type}</span>; })}</div>
        <span className="ml-auto shrink-0 whitespace-nowrap font-mono"><HubEditCounts followed features={group.rows.map(row => row.feature)} />in {counts.present} of {counts.pool} sequences{Boolean(group.hiddenCount) && ` · ${group.hiddenCount} hidden`}</span>
      </div>
      <p data-feature-stats className="truncate font-mono" style={{ height: layout.stats }}>Median position {(Math.round(group.medianStart) + 1).toLocaleString('en-US')} · {Math.min(...lengths).toLocaleString('en-US')}–{Math.max(...lengths).toLocaleString('en-US')} {group.rows[0]?.record.moleculeType === 'protein' ? 'aa' : 'bp'}</p>
      {hasComparisonTags(group) && <div data-feature-comparison className="flex gap-2 overflow-hidden whitespace-nowrap" style={{ height: layout.tags, marginTop: layout.gap }}>{!group.compared ? <span className="truncate rounded bg-slate-200 px-2" data-tip={group.notComparedReason}>not compared: {group.notComparedReason}</span> : <>
        {counts.missing > 0 && <span className="rounded bg-rose-50 px-2 text-rose-700">missing in {counts.missing}</span>}{counts.odd > 0 && <span className="rounded bg-amber-100 px-2 text-amber-800">{counts.odd} odd length</span>}{counts.duplicate > 0 && <span className="rounded bg-slate-200 px-2 text-slate-900">{counts.duplicate} duplicate</span>}{counts.notDetermined > 0 && <span className="rounded bg-slate-200 px-2">{counts.notDetermined} not determined</span>}{group.accessory && <span className="rounded bg-slate-200 px-2">accessory</span>}
      </>}</div>}
      <div role="group" aria-label="Presence" className="flex flex-wrap content-start gap-1" style={{ height: presenceHeight(group, width), marginTop: layout.gap }}>{group.cells.map(cell => <button key={cell.recordId} data-presence-state={cell.state} aria-label={`${sequenceName(cell.recordId)}: ${presenceLabel(cell.state)}`} data-tip={`${sequenceName(cell.recordId)}: ${presenceLabel(cell.state)}`} style={presenceStyle(cell.state, color)} className={`state-${cell.state} shrink-0 rounded-[3px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500 ${PRESENCE_CLASSES[cell.state]}`} onClick={() => onSequence(cell.recordId)} />)}</div>
      {!folded && counts.missing > 0 && <div data-feature-missing className="truncate" style={{ height: layout.missing, marginTop: layout.gap }}>Missing: {group.cells.filter(c => c.state === 'missing').map(c => <button key={c.recordId} className="mr-2 text-rose-700 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500" onClick={() => onSequence(c.recordId)}>{recordById.has(c.recordId) ? <DisplayName record={recordById.get(c.recordId)!} /> : c.recordId}</button>)}</div>}
    </div>
  </div>;
}

export default memo(FeatureSectionHeader);

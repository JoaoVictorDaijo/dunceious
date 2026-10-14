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

import { memo, useCallback, useMemo } from 'react';
import type { SequenceSection } from '@/src/app/logic/hubModel';
import { annotationFeatures, isPartial, isEdited, isUnannotated } from '@/src/domain/bio/recordStatus';
import DetailsLine from './DetailsLine';
import DisplayName from './DisplayName';
import type { BioFeature, DetailKey } from '@/src/domain/bio/types';
import GenomeStrip, { genomeStripHeight } from './GenomeStrip';
const layout = { padding: 8, title: 32, line: 24, detailGap: 4, summaryGap: 8, border: 2 };

export function sequenceSectionHeight(section: SequenceSection, folded: boolean, featureColors?: Record<string, string>, density: 'compact' | 'comfortable' = 'compact', gap = 0): number {
  const base = layout.padding * 2 + layout.title + layout.border;
  return gap + base + (folded ? layout.summaryGap + layout.line : layout.detailGap * 2 + layout.line + genomeStripHeight(section.record, true, featureColors, density));
}

function SequenceSectionHeader({ section, folded, selected, onFold, onSelect, onVisibility, onPick, highlight, onEditDetails, onRename, featureColors, density = 'compact', gap = 0, current, searching, trackWindow }: { gap?: number; density?: 'compact' | 'comfortable'; current?: boolean; searching?: boolean; trackWindow?: import('./trackWindow').TrackWindow; section: SequenceSection; featureColors?: Record<string, string>; folded: boolean; selected: boolean; onFold: () => void; onSelect: () => void; onVisibility: () => void; onPick: (feature: BioFeature) => void; highlight?: BioFeature | null; onEditDetails?: (field?: DetailKey) => void; onRename?: () => void }) {
  const { record, rows, total } = section;
  const composition = useMemo(() => {
    const counts = new Map<string, number>();
    annotationFeatures(record).forEach(f => counts.set(f.type, (counts.get(f.type) ?? 0) + 1));
    return [...counts].map(([type, count]) => `${count} ${type}`).join(' · ');
  }, [record]);
  const highlighted = useCallback((feature: BioFeature) => highlight ? feature === highlight : rows.includes(feature), [highlight, rows]);
  return <div style={{ height: sequenceSectionHeight(section, folded, featureColors, density, gap) }}>
    {gap > 0 && <div data-section-gap className="bg-slate-50" style={{ height: gap }} />}
    <div data-section-surface className={`border-y border-slate-300 px-5 text-xs text-slate-600 ${current ? 'bg-amber-50 shadow-[inset_4px_0_0_var(--env)]' : 'bg-slate-100'}`} style={{ height: sequenceSectionHeight(section, folded, featureColors, density), paddingTop: layout.padding, paddingBottom: layout.padding, lineHeight: `${layout.line}px`, borderTopWidth: layout.border / 2, borderBottomWidth: layout.border / 2, boxSizing: 'border-box' }}>
    <div className="flex items-center gap-3" style={{ height: layout.title }}>
      <button aria-label={`${folded ? 'Expand' : 'Collapse'} ${record.id}`} aria-expanded={!folded} data-tip={folded ? 'Expand sequence' : 'Collapse sequence'} data-tip-kbd="O" onClick={onFold} className="p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500"><i aria-hidden="true" className={`fas fa-chevron-down transition-transform motion-reduce:transition-none ${folded ? '-rotate-90' : ''}`} /></button>
      <input type="checkbox" aria-label={`Select sequence ${record.id}`} checked={selected} onChange={onSelect} />
      <DisplayName accessionFirst current={current} record={record} onRename={onRename} />
      <span className="ml-auto font-mono">{searching && <span className="mr-3 text-amber-800">{rows.length} matches</span>}{record.sequence.length.toLocaleString('en-US')} {record.moleculeType === 'protein' ? 'aa' : 'bp'} · {rows.length === total ? total : `${rows.length}/${total}`} annotations{Boolean(record.tracks?.length) && ` · ${record.tracks?.length} tracks`}</span>
      <button aria-label={`Hide ${record.id} in hub`} data-tip="Hide in hub" onClick={onVisibility} className="p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500"><i aria-hidden="true" className={'fas fa-eye'} /></button>
    </div>
    {folded ? <p className="truncate" data-tip={composition} style={{ height: layout.line, marginTop: layout.summaryGap, marginBottom: 0 }}>{composition}</p> : <>
      <div className="flex items-center gap-3" style={{ height: layout.line, marginTop: layout.detailGap, marginBottom: layout.detailGap }}><DetailsLine record={record} onAdd={onEditDetails} />{onEditDetails && <button onClick={() => onEditDetails()} className="whitespace-nowrap text-amber-800 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500"><i className="fas fa-pen mr-1" aria-hidden="true" />Edit details</button>}
      {record.isCircular && <span className="rounded bg-slate-100 px-2 font-mono text-[10px]">CIRCULAR</span>}{isPartial(record) && <span className="rounded bg-slate-100 px-2 font-mono text-[10px]">Partial</span>}{isUnannotated(record) && <span className="rounded bg-slate-100 px-2 font-mono text-[10px]">Unannotated</span>}{isEdited(record) && <span className="rounded bg-slate-100 px-2 font-mono text-[10px]">Edited</span>}<span className="rounded bg-slate-100 px-2 font-mono text-[10px]">{record.moleculeType || 'dna'}</span></div>
      <GenomeStrip density={density} trackWindow={trackWindow} record={record} featureColors={featureColors} large highlight={highlighted} onPick={onPick} />
    </>}
    </div>
  </div>;
}

export default memo(SequenceSectionHeader);

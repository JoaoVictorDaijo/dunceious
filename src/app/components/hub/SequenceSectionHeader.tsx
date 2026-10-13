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
import { isolateOf, annotationFeatures, isPartial, isEdited, isUnannotated } from '@/src/domain/bio/recordStatus';
import DetailsLine from './DetailsLine';
import DisplayName from './DisplayName';
import type { BioFeature } from '@/src/domain/bio/types';
import GenomeStrip, { genomeStripHeight } from './GenomeStrip';
const layout = { padding: 8, title: 32, line: 16, detailGap: 4, summaryGap: 8, border: 1 };

export function sequenceSectionHeight(section: SequenceSection, folded: boolean, featureColors?: Record<string, string>): number {
  const base = layout.padding * 2 + layout.title + layout.line + layout.border;
  return base + (folded ? layout.summaryGap + layout.line : layout.detailGap * 2 + layout.line + genomeStripHeight(section.record, true, featureColors));
}

function SequenceSectionHeader({ section, folded, selected, onFold, onSelect, onVisibility, onPick, highlight, onEditDetails, onRename, featureColors }: { section: SequenceSection; featureColors?: Record<string, string>; folded: boolean; selected: boolean; onFold: () => void; onSelect: () => void; onVisibility: () => void; onPick: (feature: BioFeature) => void; highlight?: BioFeature | null; onEditDetails?: () => void; onRename?: () => void }) {
  const { record, rows, total } = section;
  const composition = useMemo(() => {
    const counts = new Map<string, number>();
    annotationFeatures(record).forEach(f => counts.set(f.type, (counts.get(f.type) ?? 0) + 1));
    return [...counts].map(([type, count]) => `${count} ${type}`).join(' · ');
  }, [record]);
  const highlighted = useCallback((feature: BioFeature) => highlight ? feature === highlight : rows.includes(feature), [highlight, rows]);
  return <div className="border-b border-slate-200 bg-slate-50 px-5 text-xs text-slate-600" style={{ height: sequenceSectionHeight(section, folded, featureColors), paddingTop: layout.padding, paddingBottom: layout.padding, lineHeight: `${layout.line}px`, borderBottomWidth: layout.border, boxSizing: 'border-box' }}>
    <div className="flex items-center gap-3" style={{ height: layout.title }}>
      <button aria-label={`${folded ? 'Expand' : 'Collapse'} ${record.id}`} aria-expanded={!folded} onClick={onFold} className="p-2">{folded ? '▸' : '▾'}</button>
      <input type="checkbox" aria-label={`Select sequence ${record.id}`} checked={selected} onChange={onSelect} />
      <DisplayName record={record} onRename={onRename} />
      <span className="ml-auto">{record.sequence.length.toLocaleString('en-US')} {record.moleculeType === 'protein' ? 'aa' : 'bp'} · {rows.length === total ? total : `${rows.length}/${total}`} annotations{Boolean(record.tracks?.length) && ` · ${record.tracks?.length} tracks`}</span>
      <button aria-label={`${record.visible === false ? 'Show' : 'Hide'} ${record.id} in viewport`} onClick={onVisibility} className="p-2"><i aria-hidden="true" className={`fas ${record.visible === false ? 'fa-eye-slash' : 'fa-eye'}`} /></button>
    </div>
    <p className="truncate" style={{ height: layout.line }}>{isolateOf(record)}</p>
    {folded ? <p className="truncate" title={composition} style={{ height: layout.line, marginTop: layout.summaryGap }}>{composition}</p> : <>
      <div className="flex items-center gap-3" style={{ height: layout.line, marginTop: layout.detailGap, marginBottom: layout.detailGap }}><DetailsLine record={record} />{onEditDetails && <button onClick={onEditDetails} className="text-amber-700 underline">Edit details</button>}
      {record.isCircular && <span>CIRCULAR</span>}{isPartial(record) && <span>Partial</span>}{isUnannotated(record) && <span>Unannotated</span>}{isEdited(record) && <span>Edited</span>}</div>
      <GenomeStrip record={record} featureColors={featureColors} large highlight={highlighted} onPick={onPick} />
    </>}
  </div>;
}

export default memo(SequenceSectionHeader);

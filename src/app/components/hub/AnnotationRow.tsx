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

import type { BioFeature, SeqRecord } from '@/src/domain/bio/types';
import { getFeatureStrand } from '@/src/domain/bio/strand';
import { isolateOf } from '@/src/domain/bio/recordStatus';
import { getFeatureColor } from '@/src/app/viewer/colors';
import { useEffect, useRef } from 'react';
import { HubEditChip } from './HubEditMarks';
import { useTrackTooltip } from './TrackTooltip';
import { featureLength } from '@/src/app/logic/viewModel';

interface AnnotationRowProps {
  record: SeqRecord;
  feature: BioFeature;
  rowKey: string;
  kind: 'sequences' | 'features';
  selected: boolean;
  current: boolean;
  lastFocused: boolean;
  featureColors?: Record<string, string>;
  locked?: boolean;
  onSelect: () => void;
  onInspect: () => void;
  onEdit: () => void;
  onFocus: () => void;
  onDelete: () => void;
  onCurrent: () => void;
  onHover: (feature: BioFeature | null) => void;
}

export default function AnnotationRow({ record, feature, rowKey, kind, selected, current, lastFocused, featureColors, locked, onSelect, onInspect, onEdit, onFocus, onDelete, onCurrent, onHover }: AnnotationRowProps) {
  const tooltip = useTrackTooltip();
  const owner = useRef({});
  useEffect(() => () => tooltip(null, owner.current), [tooltip]);
  const strand = getFeatureStrand(feature);
  const color = feature.color || getFeatureColor(feature.type, featureColors);
  const product = feature.metadata?.product;
  const detail = kind === 'features'
    ? [feature.name, product !== feature.name ? product : undefined, isolateOf(record)].filter(Boolean).join(' · ')
    : product !== feature.name ? product : undefined;
  const location = feature.locationString || `${feature.start + 1}..${feature.end}`;
  const length = featureLength(record.sequence.length, feature.start, feature.end, feature.segments).toLocaleString('en-US');
  return <div data-row-key={rowKey} aria-current={current} tabIndex={0} onClick={event => { if (!(event.target as HTMLElement).closest('button, input')) onCurrent(); }} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onCurrent(); } }}
    onMouseEnter={event => { onHover(feature); tooltip({ record, feature, color, x: event.clientX, y: event.clientY }, owner.current); }} onMouseLeave={() => { onHover(null); tooltip(null, owner.current); }}
    className={`hub-row-grid group relative h-full border-b border-slate-100 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500 ${selected || current || lastFocused ? 'bg-slate-50' : 'bg-white hover:bg-slate-50'} ${current || lastFocused ? 'shadow-[inset_0_0_0_1.5px_theme(colors.slate.400)]' : ''}`}>
    <span aria-hidden="true" className="absolute left-[8px] inset-y-[8px] w-[3px] rounded-full" style={{ backgroundColor: color }} />
    <span className="hub-select-column"><input type="checkbox" aria-label={`Select annotation ${feature.name} on ${record.id}`} checked={selected} onChange={onSelect} /></span>
    <span className="flex h-[22px] max-w-full items-center truncate rounded-md border px-2 font-mono text-[11.5px]" style={{ background: `color-mix(in srgb, ${color} 13%, white)`, borderColor: `color-mix(in srgb, ${color} 28%, white)`, color: `color-mix(in srgb, ${color} 62%, #0f172a)` }}>{feature.type}</span>
    <span aria-label={strand === -1 ? 'Reverse strand' : strand === 1 ? 'Forward strand' : 'Unknown strand'} data-tip={strand === -1 ? 'Reverse strand' : strand === 1 ? 'Forward strand' : 'Unknown strand'} className={`flex h-[22px] w-[22px] items-center justify-center rounded-md ${strand === -1 ? 'text-rose-600 bg-rose-50' : strand === 1 ? 'text-emerald-600 bg-emerald-50' : 'text-slate-500 bg-slate-100'}`}>{strand === -1 ? '←' : strand === 1 ? '→' : '?'}</span>
    <div data-name-cell className="flex min-w-0 flex-nowrap items-center gap-2">
      <div className={`flex min-w-0 items-center gap-2 ${kind === 'features' ? 'flex-1 flex-nowrap' : 'flex-wrap'}`}>
        <strong className={`font-semibold text-slate-900 ${kind === 'features' ? 'shrink-0 whitespace-nowrap font-mono' : 'min-w-0 truncate'}`}>{kind === 'features' ? record.accession || record.id : feature.name}</strong>
        {kind === 'features' && record.label && record.label !== (record.accession || record.id) && <span data-row-display-name data-tip={record.label} className="min-w-0 max-w-[35%] truncate font-mono text-[10px] text-slate-500">{record.label}</span>}
        {kind === 'sequences' && <HubEditChip mark={feature.hubEdit} />}
        {detail && <span data-row-subtext data-tip={detail} className="min-w-0 flex-1 truncate text-slate-500">{detail}</span>}
        {kind === 'features' && <HubEditChip mark={feature.hubEdit} />}
        {lastFocused && <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-env bg-white px-2 text-[10px] text-amber-800"><i aria-hidden="true" className="fas fa-crosshairs" />Last focused</span>}
      </div>
    <div data-row-actions className={`hub-row-actions ml-auto flex shrink-0 justify-end gap-0.5 text-slate-500 ${selected || current || lastFocused ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'} transition-opacity motion-reduce:transition-none`}>
      <button aria-label={`Inspect ${feature.name} on ${record.id}`} data-tip="Details" className="h-[30px] w-[30px] rounded-lg hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500" onClick={onInspect}><i aria-hidden="true" className="fas fa-circle-info" /></button>
      <button disabled={locked} aria-label={`Edit ${feature.name} on ${record.id}`} data-tip="Edit annotation" className="h-[30px] w-[30px] rounded-lg hover:bg-slate-100 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500" onClick={onEdit}><i aria-hidden="true" className="fas fa-pen" /></button>
      <button aria-label={`Open ${feature.name} on ${record.id} in viewport`} data-tip="Open in the Visual Viewport" className="h-[30px] w-[30px] rounded-lg hover:bg-sky-50 hover:text-sky-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500" onClick={onFocus}><i aria-hidden="true" className="fas fa-crosshairs" /></button>
      <button disabled={locked} aria-label={`Delete ${feature.name} on ${record.id}`} data-tip="Delete annotation" className="h-[30px] w-[30px] rounded-lg hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500" onClick={onDelete}><i aria-hidden="true" className="fas fa-trash-can" /></button>
    </div>
    </div>
    <span data-tip={location} aria-label={`Location: ${location}`} className="min-w-0 truncate font-mono text-slate-600">{location}</span>
    <span className="text-right font-mono text-slate-600">{length} {record.moleculeType === 'protein' ? 'aa' : 'bp'}</span>

  </div>;
}

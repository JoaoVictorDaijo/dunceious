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
import DisplayName from './DisplayName';
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
  const strand = getFeatureStrand(feature);
  const color = feature.color || getFeatureColor(feature.type, featureColors);
  const product = feature.metadata?.product;
  const detail = kind === 'features'
    ? [feature.name, product !== feature.name ? product : undefined, isolateOf(record)].filter(Boolean).join(' · ')
    : product !== feature.name ? product : undefined;
  const location = feature.locationString || `${feature.start + 1}..${feature.end}`;
  const length = featureLength(record.sequence.length, feature.start, feature.end, feature.segments).toLocaleString('en-US');
  return <div data-row-key={rowKey} aria-current={current} tabIndex={0} onFocus={onCurrent} onClick={onCurrent}
    onMouseEnter={() => onHover(feature)} onMouseLeave={() => onHover(null)}
    className={`flex h-full items-center gap-3 border-b border-slate-100 px-5 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500 ${selected || current ? 'bg-amber-50' : 'bg-white'} ${lastFocused ? 'shadow-[inset_3px_0_0_0_#f59e0b]' : ''}`}>
    <input type="checkbox" aria-label={`Select annotation ${feature.name} on ${record.id}`} checked={selected} onChange={onSelect} />
    <span className="w-24 shrink-0" style={{ color }}>{feature.type} <span
      aria-label={strand === -1 ? 'Reverse strand' : strand === 1 ? 'Forward strand' : 'Unknown strand'}
      className={strand === -1 ? 'text-rose-600' : strand === 1 ? 'text-emerald-700' : 'text-slate-500'}>
      {strand === -1 ? '←' : strand === 1 ? '→' : '?'}</span></span>
    <div className="min-w-0 flex-1">
      <strong className="text-slate-900">{kind === 'features' ? <DisplayName record={record} /> : feature.name}</strong>
      {lastFocused && <span className="ml-2 text-amber-700">Last focused</span>}
      {detail && <p title={detail} className="truncate text-slate-500">{detail}</p>}
    </div>
    <span title={location} aria-label={`Location: ${location}`} className="min-w-0 w-[26ch] shrink-0 truncate font-mono text-slate-600">{location}</span>
    <span className="w-20 shrink-0 text-right font-mono text-slate-600">{length} {record.moleculeType === 'protein' ? 'aa' : 'bp'}</span>
    <div className="flex shrink-0 gap-1 text-slate-500">
      <button aria-label={`Inspect ${feature.name} on ${record.id}`} className="p-2" onClick={onInspect}><i aria-hidden="true" className="fas fa-info-circle" /></button>
      <button disabled={locked} aria-label={`Edit ${feature.name} on ${record.id}`} className="p-2 disabled:opacity-40" onClick={onEdit}><i aria-hidden="true" className="fas fa-pen" /></button>
      <button aria-label={`Open ${feature.name} on ${record.id} in viewport`} className="rounded border border-slate-200 px-2 py-1" onClick={onFocus}>Open in viewport</button>
      <button disabled={locked} aria-label={`Delete ${feature.name} on ${record.id}`} className="p-2 text-rose-600 disabled:opacity-40" onClick={onDelete}><i aria-hidden="true" className="fas fa-trash-alt" /></button>
    </div>
  </div>;
}

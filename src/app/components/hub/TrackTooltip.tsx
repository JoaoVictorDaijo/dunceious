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

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { BioFeature, SeqRecord } from '@/src/domain/bio/types';
import { featureLength } from '@/src/app/logic/viewModel';
import { getFeatureStrand } from '@/src/domain/bio/strand';
import { getFeatureColor } from '@/src/app/viewer/colors';
export type TrackHover = { record: SeqRecord; feature: BioFeature; color: string; x: number; y: number };
const TrackTooltipContext = createContext<(hover: TrackHover | null, owner: object) => void>(() => {});
export const useTrackTooltip = () => useContext(TrackTooltipContext);
export function TrackTooltipProvider({ children }: { children: ReactNode }) {
  const [hover, setHover] = useState<TrackHover | null>(null);
  const current = useRef<TrackHover | null>(null);
  const owner = useRef<object | null>(null);
  const update = useCallback((next: TrackHover | null, source: object) => {
    if (!next && owner.current !== source) return;
    owner.current = next ? source : null;
    if (current.current?.feature === next?.feature && current.current?.record === next?.record) return;
    current.current = next; setHover(next);
  }, []);
  return <TrackTooltipContext.Provider value={update}>{children}{hover && createPortal(<TrackTooltip hover={hover} />, document.body)}</TrackTooltipContext.Provider>;
}
function TrackTooltip({ hover }: { hover: TrackHover }) {
  const { feature, record, color } = hover;
  const length = featureLength(record.sequence.length, feature.start, feature.end, feature.segments);
  const strand = getFeatureStrand(feature);
  const aminoAcids = feature.metadata?.translation?.replace(/\s/g, '').length ?? Math.floor(Math.max(0, length - (Number(feature.metadata?.codon_start || 1) - 1)) / 3);
  const location = feature.locationString || `${feature.start + 1}..${feature.end}`;
  const tip = useRef<HTMLDivElement>(null);
  const ref = useCallback((element: HTMLDivElement | null) => {
    tip.current = element;
    if (!element) return;
    const bounds = element.getBoundingClientRect();
    element.style.left = `${Math.max(8, Math.min(window.innerWidth - bounds.width - 8, hover.x + 14))}px`;
    element.style.top = `${Math.max(8, Math.min(window.innerHeight - bounds.height - 8, hover.y + 16))}px`;
  }, [hover]);
  return <div ref={ref} role="tooltip" className="pointer-events-none fixed z-[100] max-w-xs rounded-xl border border-slate-800 bg-slate-900 p-3 text-xs text-slate-200 shadow-xl">
    <div className="mb-1 flex items-center gap-2"><span className="rounded-sm px-1.5 font-mono text-[11px]" style={{ background: color }}>{feature.type}</span><strong data-tooltip-feature>{feature.name}</strong></div>
    <dl className="grid grid-cols-[auto_1fr] gap-x-3"><dt>Location</dt><dd className="break-all font-mono">{location}</dd><dt>Length</dt><dd className="font-mono">{length.toLocaleString('en-US')} {record.moleculeType === 'protein' ? 'aa' : 'bp'}{feature.type === 'CDS' && record.moleculeType !== 'protein' && ` · ${aminoAcids.toLocaleString('en-US')} aa`}</dd><dt>Strand</dt><dd>{strand === 1 ? 'forward (+)' : strand === -1 ? 'reverse (−)' : 'unknown'}</dd><dt>Sequence</dt><dd className="font-mono">{record.id}</dd></dl>
    <p className="mt-2 text-slate-400">Click to jump to the row</p>
  </div>;
}
export function trackFeatureColor(feature: BioFeature, colors?: Record<string, string>) { return feature.color || getFeatureColor(feature.type, colors); }

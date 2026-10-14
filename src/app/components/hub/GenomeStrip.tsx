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

import { memo, useCallback, useEffect, useRef, useState, type MouseEvent, type KeyboardEvent } from 'react';
import type { BioFeature, SeqRecord } from '@/src/domain/bio/types';
import { packTrack, rulerTicks, trackMetrics, type TrackPart } from '@/src/app/logic/trackLayout';
import { trackFeatureColor, useTrackTooltip } from './TrackTooltip';
import type { TrackWindow } from './trackWindow';
type StripPart = TrackPart & { x: number; endX: number; y: number; color: string; path: string };
type StripPath = { key: string; d: string; color: string; opacity: number };
type StripGeometry = { parts: StripPart[]; ordered: BioFeature[]; metrics: ReturnType<typeof trackMetrics>; reverseLanes: number; views: { mask: string; paths: StripPath[] } | null };
const defaultColors = {};
const viewWidth = 1000;
// Immutable records and colour maps keep resize and hover from rebuilding geometry.
const geometryCache = new WeakMap<SeqRecord, WeakMap<Record<string, string>, Map<boolean, StripGeometry>>>();
function stripGeometry(record: SeqRecord, large: boolean, colors = defaultColors): StripGeometry {
  let byColors = geometryCache.get(record);
  let bySize = byColors?.get(colors);
  const cached = bySize?.get(large);
  if (cached) return cached;
  const layout = packTrack(record, { maxLanes: large ? 4 : 3, reverseLanes: large ? 4 : 1 });
  const metrics = trackMetrics(layout, large);
  const parts = layout.parts.map(part => {
    const x = part.start / record.sequence.length * viewWidth, endX = part.end / record.sequence.length * viewWidth;
    const y = metrics.y(part), width = endX - x;
    return { ...part, x, endX, y, color: trackFeatureColor(part.feature, colors), path: `M${x} ${y}h${width}v${metrics.laneHeight}h${-width}Z` };
  });
  const ordered = [...new Set(parts.map(part => part.feature))];
  const result = { parts, ordered, metrics, reverseLanes: layout.reverseLanes, views: null };
  if (!byColors) { byColors = new WeakMap(); geometryCache.set(record, byColors); }
  if (!bySize) { bySize = new Map(); byColors.set(colors, bySize); }
  bySize.set(large, result);
  return result;
}
function stripPaths(geometry: StripGeometry, highlight?: (feature: BioFeature) => boolean): StripPath[] {
  const mask = geometry.ordered.map(feature => !highlight || highlight(feature) ? '1' : '0').join('');
  if (geometry.views?.mask === mask) return geometry.views.paths;
  const selected = new Map(geometry.ordered.map((feature, index) => [feature, mask[index] === '1']));
  const groups = new Map<string, StripPath>();
  for (const part of geometry.parts) {
    const opacity = selected.get(part.feature) ? 1 : .25;
    const key = JSON.stringify([part.color, opacity]);
    const group = groups.get(key) ?? { key, d: '', color: part.color, opacity };
    group.d += part.path; groups.set(key, group);
  }
  const paths = [...groups.values()];
  geometry.views = { mask, paths };
  return paths;
}
export function genomeStripHeight(record: SeqRecord, large = false, featureColors?: Record<string, string>): number {
  return stripGeometry(record, large, featureColors).metrics.height + (large ? 16 : 0);
}
function GenomeStrip({ record, highlight, large = false, onPick, featureColors, trackWindow }: { record: SeqRecord; highlight?: (feature: BioFeature) => boolean; large?: boolean; featureColors?: Record<string, string>; onPick?: (feature: BioFeature) => void; trackWindow?: TrackWindow }) {
  const geometry = stripGeometry(record, large, featureColors);
  const [cursor, setCursor] = useState({ record, index: 0 });
  const [focused, setFocused] = useState(false);
  const [pointer, setPointer] = useState<{ record: SeqRecord; feature: BioFeature; x: number; y: number } | null>(null);
  const owner = useRef({});
  const hoveredRef = useRef<BioFeature | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const showTooltip = useTrackTooltip();
  const { ordered, metrics } = geometry;
  const index = cursor.record === record ? Math.min(cursor.index, ordered.length - 1) : 0;
  const current = ordered[index];
  const hovered = pointer?.record === record ? pointer.feature : null;
  const active = hovered || (focused ? current : null);
  const mask = useCallback((feature: BioFeature) => active ? feature === active : !highlight || highlight(feature), [active, highlight]);
  const paths = stripPaths(geometry, mask);
  const interactive = Boolean(onPick) && Boolean(current);
  useEffect(() => { if (root.current && trackWindow) return trackWindow.register(record.id, root.current); }, [record.id, trackWindow]);
  useEffect(() => {
    hoveredRef.current = null;
    setPointer(null);
  }, [record]);
  useEffect(() => {
    if (!active) { showTooltip(null, owner.current); return; }
    const bounds = svg.current?.getBoundingClientRect();
    const part = geometry.parts.find(part => part.feature === active)!;
    showTooltip({ record, feature: active, color: part.color, x: hovered ? pointer!.x : (bounds?.left ?? 0) + part.x / viewWidth * (bounds?.width ?? 0), y: hovered ? pointer!.y : (bounds?.top ?? 0) + part.y }, owner.current);
    return () => showTooltip(null, owner.current);
  }, [active, hovered, pointer, record, geometry, showTooltip]);
  const hit = (event: MouseEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return null;
    const x = (event.clientX - bounds.left) / bounds.width * viewWidth;
    const y = (event.clientY - bounds.top) / bounds.height * metrics.height;
    for (let i = geometry.parts.length - 1; i >= 0; i--) { const part = geometry.parts[i]; if (x >= part.x && x < part.endX && y >= part.y && y < part.y + metrics.laneHeight) return part; }
    return null;
  };
  const move = (event: MouseEvent<SVGSVGElement>) => {
    const part = hit(event);
    if (hoveredRef.current === (part?.feature ?? null)) return;
    hoveredRef.current = part?.feature ?? null;
    setPointer(part ? { record, feature: part.feature, x: event.clientX, y: event.clientY } : null);
  };
  const keyboard = (event: KeyboardEvent<SVGSVGElement>) => {
    if (!interactive || !['ArrowLeft', 'ArrowRight', 'Enter', ' '].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    hoveredRef.current = null; setPointer(null);
    if (event.key === 'Enter' || event.key === ' ') onPick?.(current);
    else setCursor({ record, index: Math.max(0, Math.min(ordered.length - 1, index + (event.key === 'ArrowRight' ? 1 : -1))) });
  };
  return <div ref={root} className={large ? 'relative ml-7' : 'relative overflow-hidden rounded-md border border-slate-800 bg-slate-950'}>
    {large && <><span aria-hidden="true" className="absolute -left-5 top-1 font-mono text-[10px]">+</span>{geometry.reverseLanes > 0 && <span aria-hidden="true" className="absolute -left-5 font-mono text-[10px]" style={{ top: metrics.axis + 3 }}>−</span>}</>}
    <div className="relative" style={{ height: metrics.height }}>
      <svg ref={svg} viewBox={`0 0 ${viewWidth} ${metrics.height}`} preserveAspectRatio="none" width="100%" style={{ height: metrics.height }}
        role={large && interactive ? 'button' : undefined} aria-hidden={large && interactive ? undefined : true}
        aria-label={large && interactive ? `Genome strip for ${record.id}: ${ordered.length} ${ordered.length === 1 ? 'annotation' : 'annotations'}` : undefined}
        tabIndex={large && interactive ? 0 : undefined} onMouseMove={move} onMouseLeave={() => { hoveredRef.current = null; setPointer(null); }} onClick={event => { const part = hit(event); if (part) { setCursor({ record, index: ordered.indexOf(part.feature) }); onPick?.(part.feature); } }} onKeyDown={keyboard} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        className={`block w-full rounded ${large ? 'border border-slate-200 bg-white' : ''} ${interactive ? 'cursor-crosshair focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500' : ''}`}>
        <line x1="0" x2={viewWidth} y1={metrics.axis} y2={metrics.axis} className={large ? 'stroke-slate-300' : 'stroke-slate-700'} vectorEffect="non-scaling-stroke" />
        {paths.map(path => <path key={path.key} d={path.d} fill={path.color} opacity={path.opacity} />)}
        {active && <path data-strip-focus d={geometry.parts.filter(part => part.feature === active).map(part => part.path).join('')} fill="none" className="stroke-slate-900" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />}
      </svg>
      <div hidden data-track-window className="pointer-events-none absolute inset-y-0 border-x-[1.5px] border-amber-500 bg-env/15" />
    </div>
    {large && <div className="relative h-4 font-mono text-[9.5px] text-slate-500">{rulerTicks(record.sequence.length).map(tick => <span key={tick.position} className="absolute -translate-x-1/2" style={{ left: `${tick.position}%` }}>{tick.label}</span>)}<span hidden data-track-window-label className="absolute right-0 bg-amber-50 text-amber-800" /></div>}
    {large && interactive && focused && <span role="status" aria-live="polite" className="sr-only">{current.name} · {current.locationString || `${current.start + 1}..${current.end}`}</span>}
  </div>;
}
export default memo(GenomeStrip);

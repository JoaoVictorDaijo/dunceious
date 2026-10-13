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

import { memo, useState, type MouseEvent, type KeyboardEvent } from 'react';
import type { BioFeature, SeqRecord } from '@/src/domain/bio/types';
import { annotationFeatures } from '@/src/domain/bio/recordStatus';
import { getFeatureColor } from '@/src/app/viewer/colors';

type StripPart = { feature: BioFeature; index: number; start: number; end: number; lane: number; color: string; paths: [string, string] };
type StripPath = { key: string; d: string; color: string; opacity: number };
type StripFeature = { feature: BioFeature; position: number; location: string; paths: [string, string] };
type StripGeometry = { parts: StripPart[]; features: StripFeature[]; ordered: StripFeature[]; lanes: number; views: Map<boolean, { mask: string; paths: StripPath[] }> };
const defaultColors = {};
const viewWidth = 1000;
// A fixed SVG viewBox scales cached geometry without measuring or rebuilding it on resize.
const geometryCache = new WeakMap<SeqRecord, WeakMap<Record<string, string>, StripGeometry>>();

function rectangle(start: number, end: number, lane: number, height: number): string {
  const width = end - start;
  return `M${start} ${lane * height}h${width}v${height - 1}h${-width}Z`;
}

function stripGeometry(record: SeqRecord, featureColors = defaultColors): StripGeometry {
  let byColors = geometryCache.get(record);
  const cached = byColors?.get(featureColors);
  if (cached) return cached;
  const annotations = annotationFeatures(record);
  const lanes = new Map<string, number>();
  const parts: StripPart[] = [];
  const features = annotations.map((feature, index) => {
    if (!lanes.has(feature.type)) lanes.set(feature.type, lanes.size);
    const lane = lanes.get(feature.type)!;
    const color = feature.color || getFeatureColor(feature.type, featureColors);
    const segments = feature.segments?.length ? feature.segments : feature.start > feature.end ? [{ start: feature.start, end: record.sequence.length }, { start: 0, end: feature.end }] : [feature];
    const featureParts = segments.map(part => {
      const start = part.start / record.sequence.length * viewWidth;
      const end = part.end / record.sequence.length * viewWidth;
      const value: StripPart = { feature, index, start, end, lane, color, paths: [rectangle(start, end, lane, 3), rectangle(start, end, lane, 6)] };
      parts.push(value);
      return value;
    });
    return { feature, position: Math.min(...featureParts.map(part => part.start)), location: feature.locationString || `${feature.start + 1}..${feature.end}`, paths: [featureParts.map(part => part.paths[0]).join(''), featureParts.map(part => part.paths[1]).join('')] as [string, string] };
  });
  const geometry: StripGeometry = { parts, features, ordered: [...features].sort((a, b) => a.position - b.position), lanes: lanes.size, views: new Map() };
  if (!byColors) { byColors = new WeakMap(); geometryCache.set(record, byColors); }
  byColors.set(featureColors, geometry);
  return geometry;
}

function stripPaths(geometry: StripGeometry, large: boolean, highlight?: (feature: BioFeature) => boolean): StripPath[] {
  const mask = geometry.features.map(({ feature }) => !highlight || highlight(feature) ? '1' : '0').join('');
  const cached = geometry.views.get(large);
  if (cached?.mask === mask) return cached.paths;
  const groups = new Map<string, StripPath>();
  for (const part of geometry.parts) {
    const opacity = mask[part.index] === '1' ? 1 : .25;
    const key = JSON.stringify([part.lane, part.color, opacity]);
    const group = groups.get(key) ?? { key, d: '', color: part.color, opacity };
    group.d += part.paths[large ? 1 : 0];
    groups.set(key, group);
  }
  const paths = [...groups.values()];
  // Only the latest mask per density is retained, so query history cannot grow the cache.
  geometry.views.set(large, { mask, paths });
  return paths;
}

function GenomeStrip({ record, highlight, large = false, onPick, featureColors }: { record: SeqRecord; highlight?: (feature: BioFeature) => boolean; large?: boolean; featureColors?: Record<string, string>; onPick?: (feature: BioFeature) => void }) {
  const geometry = stripGeometry(record, featureColors);
  const paths = stripPaths(geometry, large, highlight);
  const [cursor, setCursor] = useState({ record, index: 0 });
  const [focused, setFocused] = useState(false);
  const ordered = geometry.ordered;
  const index = cursor.record === record ? Math.min(cursor.index, ordered.length - 1) : 0;
  const current = ordered[index];
  const interactive = large && Boolean(onPick) && Boolean(current);
  const height = large ? 6 : 3;
  const totalHeight = Math.max(1, geometry.lanes) * height;
  const pick = (event: MouseEvent<SVGSVGElement>) => {
    if (!interactive) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const position = (event.clientX - bounds.left) / bounds.width * viewWidth;
    const lane = Math.floor((event.clientY - bounds.top) / bounds.height * totalHeight / height);
    for (let i = geometry.parts.length - 1; i >= 0; i--) {
      const part = geometry.parts[i];
      if (part.lane !== lane || position < part.start || position >= part.end) continue;
      setCursor({ record, index: ordered.findIndex(entry => entry.feature === part.feature) });
      onPick?.(part.feature);
      return;
    }
  };
  const keyboard = (event: KeyboardEvent<SVGSVGElement>) => {
    if (!interactive || !['ArrowLeft', 'ArrowRight', 'Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Enter' || event.key === ' ') onPick?.(current.feature);
    else setCursor({ record, index: Math.max(0, Math.min(ordered.length - 1, index + (event.key === 'ArrowRight' ? 1 : -1))) });
  };
  return <>
    <svg viewBox={`0 0 ${viewWidth} ${totalHeight}`} preserveAspectRatio="none" width="100%" style={{ height: totalHeight }}
      role={interactive ? 'button' : undefined} aria-hidden={interactive ? undefined : true}
      aria-label={interactive ? `Genome strip for ${record.id}: ${ordered.length} ${ordered.length === 1 ? 'annotation' : 'annotations'}` : undefined}
      tabIndex={interactive ? 0 : undefined} onClick={pick} onKeyDown={keyboard} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
      className={`block w-full rounded bg-slate-400/15 ${interactive ? 'cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500' : ''}`}>
      {paths.map(path => <path key={path.key} d={path.d} fill={path.color} opacity={path.opacity} />)}
      {interactive && focused && <path data-strip-focus d={current.paths[1]} fill="none" stroke="#f59e0b" strokeWidth="2" vectorEffect="non-scaling-stroke" />}
    </svg>
    {interactive && focused && <span role="status" aria-live="polite" className="sr-only">{current.feature.name} · {current.location}</span>}
  </>;
}

export default memo(GenomeStrip);

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

import { memo } from 'react';
import type { BioFeature, SeqRecord } from '@/src/domain/bio/types';
import { annotationFeatures } from '@/src/domain/bio/recordStatus';
import { getFeatureColor } from '@/src/app/viewer/colors';
type StripPart = { feature: BioFeature; key: string; left: string; width: string; lane: number; color: string };
type StripGeometry = { parts: StripPart[]; lanes: number };
const defaultColors = {};
// Immutable records invalidate geometry; weak keys release strips with removed records.
const geometryCache = new WeakMap<SeqRecord, WeakMap<Record<string, string>, StripGeometry>>();

function stripGeometry(record: SeqRecord, featureColors = defaultColors): StripGeometry {
  let byColors = geometryCache.get(record);
  const cached = byColors?.get(featureColors);
  if (cached) return cached;
  const features = annotationFeatures(record);
  const lanes = new Map<string, number>();
  const parts: StripPart[] = [];
  features.forEach((feature, index) => {
    if (!lanes.has(feature.type)) lanes.set(feature.type, lanes.size);
    const lane = lanes.get(feature.type)!;
    const color = feature.color || getFeatureColor(feature.type, featureColors);
    const segments = feature.segments?.length ? feature.segments : feature.start > feature.end ? [{ start: feature.start, end: record.sequence.length }, { start: 0, end: feature.end }] : [feature];
    segments.forEach((part, partIndex) => parts.push({ feature, key: `${index}:${partIndex}`, left: `${part.start / record.sequence.length * 100}%`, width: `${(part.end - part.start) / record.sequence.length * 100}%`, lane, color }));
  });
  const geometry = { parts, lanes: lanes.size };
  if (!byColors) { byColors = new WeakMap(); geometryCache.set(record, byColors); }
  byColors.set(featureColors, geometry);
  return geometry;
}

function GenomeStrip({ record, highlight, large = false, onPick, featureColors }: { record: SeqRecord; highlight?: (feature: BioFeature) => boolean; large?: boolean; featureColors?: Record<string, string>; onPick?: (feature: BioFeature) => void }) {
  const { parts, lanes } = stripGeometry(record, featureColors);
  const height = large ? 6 : 3;
  return <div aria-label={`Genome strip for ${record.id}`} className="relative w-full rounded bg-slate-400/15" style={{ height: Math.max(1, lanes) * height }}>
    {parts.map(({ feature, key, left, width, lane, color }) => <button key={key} disabled={!onPick} aria-label={`Jump to ${feature.name}`} onClick={() => onPick?.(feature)} className="absolute rounded-sm focus-visible:ring-2 focus-visible:ring-amber-500" style={{ left, width, top: lane * height, height: height - 1, backgroundColor: color, opacity: highlight && !highlight(feature) ? .25 : 1 }} />)}
  </div>;
}

export default memo(GenomeStrip);

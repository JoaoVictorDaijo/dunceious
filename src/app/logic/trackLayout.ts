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

import type { BioFeature, FeatureSegment, SeqRecord } from '@/src/domain/bio/types';
import { annotationFeatures } from '@/src/domain/bio/recordStatus';
import { getFeatureStrand } from '@/src/domain/bio/strand';
export type TrackPart = { feature: BioFeature; index: number; start: number; end: number; strand: 1 | -1; lane: number };
export type TrackLayout = { parts: TrackPart[]; forwardLanes: number; reverseLanes: number };
const cache = new WeakMap<SeqRecord, Map<string, TrackLayout>>();
/** Coalesce forced overlaps so capped lanes do not retain every crowded feature as occupancy. */
function reserveLane(occupied: FeatureSegment[], parts: TrackPart[]): FeatureSegment[] {
  const ranges = [...occupied, ...parts].sort((a, b) => a.start - b.start);
  const merged: FeatureSegment[] = [];
  for (const range of ranges) {
    const previous = merged.at(-1);
    if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
    else merged.push({ start: range.start, end: range.end });
  }
  return merged;
}
export function packTrack(record: SeqRecord, opts: { maxLanes: number; reverseLanes: number }): TrackLayout {
  const key = `${opts.maxLanes}:${opts.reverseLanes}`;
  let views = cache.get(record);
  const cached = views?.get(key);
  if (cached) return cached;
  const parts: TrackPart[] = [];
  annotationFeatures(record).forEach((feature, index) => {
    const segments = feature.segments?.length ? feature.segments : [feature];
    for (const segment of segments) {
      const strand = segment.strand === -1 || segment.strand === 1 ? segment.strand : getFeatureStrand(feature) === -1 ? -1 : 1;
      const ranges = segment.start > segment.end ? [{ start: 0, end: segment.end }, { start: segment.start, end: record.sequence.length }] : [segment];
      for (const range of ranges) if (range.end > range.start) parts.push({ feature, index, start: range.start, end: range.end, strand, lane: 0 });
    }
  });
  parts.sort((a, b) => a.start - b.start || b.end - a.end || a.index - b.index);
  const groups = new Map<string, TrackPart[]>();
  for (const part of parts) {
    const key = `${part.index}:${part.strand}`;
    const group = groups.get(key) ?? [];
    group.push(part);
    groups.set(key, group);
  }
  const forward: FeatureSegment[][] = [], reverse: FeatureSegment[][] = [];
  const gap = record.sequence.length * .004;
  // Reserve every piece together so a joined feature keeps its lane across gaps and the origin.
  for (const group of groups.values()) {
    const first = group[0];
    const lanes = first.strand === -1 ? reverse : forward;
    const maximum = Math.max(1, first.strand === -1 ? opts.reverseLanes : opts.maxLanes);
    for (let i = 0; i < lanes.length; i++) lanes[i] = lanes[i].filter(part => part.end + gap >= first.start);
    let lane = lanes.findIndex(occupied => group.every(part => occupied.every(other => other.end + gap < part.start || part.end + gap < other.start)));
    if (lane < 0) lane = Math.min(lanes.length, maximum - 1);
    for (const part of group) part.lane = lane;
    lanes[lane] = reserveLane(lanes[lane] ?? [], group);
  }
  const result = { parts, forwardLanes: forward.length, reverseLanes: reverse.length };
  if (!views) { views = new Map(); cache.set(record, views); }
  views.set(key, result);
  return result;
}
export function trackMetrics(layout: TrackLayout, large: boolean, _density: 'compact' | 'comfortable' = 'compact') {
  const laneHeight = large ? 10 : layout.reverseLanes ? 4.2 : 5.6;
  const gap = large ? 3 : 1.2;
  const miniTop = layout.forwardLanes ? 3 : 4.8;
  const miniBottom = layout.reverseLanes ? 3 + layout.forwardLanes * (laneHeight + gap) + 1.8 + (layout.reverseLanes - 1) * (laneHeight + gap) + laneHeight : 3 + Math.max(0, layout.forwardLanes - 1) * (laneHeight + gap) + laneHeight;
  const miniShift = (30 - (miniBottom - miniTop)) / 2 - miniTop;
  const axis = large ? 6 + layout.forwardLanes * (laneHeight + gap) + 2 : 3 + layout.forwardLanes * (laneHeight + gap) + miniShift;
  const height = large ? axis + 4 + layout.reverseLanes * (laneHeight + gap) + 4 : 30;
  return { laneHeight, gap, axis, height, y: (part: TrackPart) => part.strand === -1 ? axis + (large ? 4 : 1.8) + part.lane * (laneHeight + gap) : large ? axis - 2 - (part.lane + 1) * (laneHeight + gap) + gap : 3 + part.lane * (laneHeight + gap) + miniShift };
}
export function rulerTicks(length: number): { position: number; label: string }[] {
  if (length <= 0) return [];
  const power = 10 ** Math.floor(Math.log10(length / 7));
  const step = [1, 2, 2.5, 5, 10].map(n => n * power).find(n => length / n <= 7)!;
  const ticks: { position: number; label: string }[] = [];
  for (let value = step; value < length; value += step) ticks.push({ position: value / length * 100, label: value >= 1000 ? `${value / 1000} kb` : String(value) });
  return ticks;
}

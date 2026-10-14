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
import { annotationFeatures } from '@/src/domain/bio/recordStatus';
import { getFeatureStrand } from '@/src/domain/bio/strand';
export type TrackPart = { feature: BioFeature; index: number; start: number; end: number; strand: 1 | -1; lane: number };
export type TrackLayout = { parts: TrackPart[]; forwardLanes: number; reverseLanes: number };
const cache = new WeakMap<SeqRecord, Map<string, TrackLayout>>();
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
  const forward: number[] = [], reverse: number[] = [];
  const gap = record.sequence.length * .004;
  for (const part of parts) {
    const ends = part.strand === -1 ? reverse : forward;
    const maximum = Math.max(1, part.strand === -1 ? opts.reverseLanes : opts.maxLanes);
    let lane = ends.findIndex(end => end + gap < part.start);
    if (lane < 0) lane = Math.min(ends.length, maximum - 1);
    part.lane = lane;
    ends[lane] = Math.max(ends[lane] ?? 0, part.end);
  }
  const result = { parts, forwardLanes: forward.length, reverseLanes: reverse.length };
  if (!views) { views = new Map(); cache.set(record, views); }
  views.set(key, result);
  return result;
}
export function trackMetrics(layout: TrackLayout, large: boolean) {
  const laneHeight = large ? 7 : layout.reverseLanes ? 4.2 : 5.6;
  const gap = large ? 2 : 1.2;
  const axis = large ? 6 + layout.forwardLanes * (laneHeight + gap) + 2 : 3 + layout.forwardLanes * (laneHeight + gap);
  const height = large ? axis + 4 + layout.reverseLanes * (laneHeight + gap) + 4 : 30;
  return { laneHeight, gap, axis, height, y: (part: TrackPart) => part.strand === -1 ? axis + (large ? 4 : 1.8) + part.lane * (laneHeight + gap) : large ? axis - 2 - (part.lane + 1) * (laneHeight + gap) + gap : 3 + part.lane * (laneHeight + gap) };
}
export function rulerTicks(length: number): { position: number; label: string }[] {
  if (length <= 0) return [];
  const power = 10 ** Math.floor(Math.log10(length / 7));
  const step = [1, 2, 2.5, 5, 10].map(n => n * power).find(n => length / n <= 7)!;
  const ticks: { position: number; label: string }[] = [];
  for (let value = step; value < length; value += step) ticks.push({ position: value / length * 100, label: value >= 1000 ? `${value / 1000} kb` : String(value) });
  return ticks;
}

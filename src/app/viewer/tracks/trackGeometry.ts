/*
 * Dunceious
 * Copyright (C) 2026 João Victor Daijo and Murilo Cassiano
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


import type { DisplayTrack } from '@/src/domain/bio/types';
import { alignedEnvelope } from '@/src/domain/bio/quantitativeTracks';

export interface Rect { x: number; width: number }
export interface TrackShape extends Rect { index: number; value: number }

const placedCaches = new WeakMap<DisplayTrack, Set<number>>();

/** Envelope shapes intersect the shared residue mask; no interval/run product is allocated. */
export function trackGeometry(display: DisplayTrack, scale: (x: number) => number, viewport: [number, number]): { mask: Rect[]; shapes: TrackShape[] } {
  const rect = (start: number, end: number): Rect => ({ x: scale(start), width: scale(end) - scale(start) });
  let lo = 0, hi = display.runs.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    const run = display.runs[mid];
    if (run.column + run.length <= viewport[0]) lo = mid + 1;
    else hi = mid;
  }
  const mask: Rect[] = [];
  for (let index = lo; index < display.runs.length; index++) {
    const run = display.runs[index];
    if (run.column >= viewport[1]) break;
    mask.push(rect(Math.max(run.column, viewport[0]), Math.min(run.column + run.length, viewport[1])));
  }
  const shapes: TrackShape[] = [];
  let placed = placedCaches.get(display);
  if (!placed) { placed = new Set(display.placed); placedCaches.set(display, placed); }
  display.track.data.forEach((datum, index) => {
    if (!placed.has(index)) return;
    const envelope = alignedEnvelope(display, index);
    if (envelope.start >= viewport[1] || envelope.end <= viewport[0]) return;
    const x = scale(envelope.start);
    shapes.push({ x, width: scale(envelope.end) - x, index, value: datum.value });
  });
  return { mask, shapes };
}

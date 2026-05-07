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

import type { FeatureSegment } from './types';

/**
 * Clips an interval `[start, end)` to fit within the bounds `[min, max)`.
 *
 * Returns `null` when the interval does not overlap the clipping bounds at
 * all (i.e., `end <= min` or `start >= max`).
 */
export const clipInterval = (
  start: number,
  end: number,
  min: number,
  max: number
): FeatureSegment | null => {
  const clippedStart = Math.max(start, min);
  const clippedEnd = Math.min(end, max);

  if (clippedStart >= clippedEnd) return null;

  return { start: clippedStart, end: clippedEnd };
};

/**
 * Given a list of segments and a viewport `[viewStart, viewEnd)`, returns
 * only the portions of those segments that fall within the viewport.
 *
 * Segments that lie entirely outside the viewport are omitted.
 */
export const clipSegments = (
  segments: FeatureSegment[],
  viewStart: number,
  viewEnd: number
): FeatureSegment[] => {
  const result: FeatureSegment[] = [];

  for (const seg of segments) {
    const clipped = clipInterval(seg.start, seg.end, viewStart, viewEnd);
    if (clipped !== null) {
      result.push(clipped);
    }
  }

  return result;
};

/**
 * Splits a potentially wrap-around interval `[start, end)` on a circular
 * sequence of length `seqLength` into one or two linear segments.
 *
 * A wrap-around interval is one where `start > end` (e.g., a feature that
 * spans the origin of a circular sequence).
 */
export const splitWrapAround = (
  start: number,
  end: number,
  seqLength: number
): FeatureSegment[] => {
  if (start <= end) {
    return [{ start, end }];
  }
  // Wrap-around: covers [start, seqLength) and [0, end)
  const segments: FeatureSegment[] = [];
  if (start < seqLength) segments.push({ start, end: seqLength });
  if (end > 0) segments.push({ start: 0, end });
  return segments;
};

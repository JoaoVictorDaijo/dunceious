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

/**
 * The sequence slice a record/feature detail view should display.
 *
 * Extracted verbatim from RecordDetailsModal's inline `getDisplaySeq`. With no
 * feature the whole sequence is shown. A normal feature (`start <= end`) shows
 * `substring(start, end)`. A circular wrap-around feature (`start > end`, which
 * crosses the origin) shows the tail then the head: `substring(start) +
 * substring(0, end)`. Pure string math; the clipboard/log side-effects stay in
 * the component.
 */
export function getDisplaySeq(
  sequence: string,
  feature: { start: number; end: number } | null,
): string {
  if (!feature) return sequence;
  const { start, end } = feature;
  if (start <= end) return sequence.substring(start, end);
  return sequence.substring(start) + sequence.substring(0, end);
}

/**
 * The displayed length (in bp) of a feature, matching DatabaseHubPanel's inline
 * calc. Priority: (1) if it has segments, the sum of each segment's |end-start|;
 * (2) a circular wrap-around (`start > end`) on a known-length sequence spans
 * `(seqLen - start) + end`; (3) otherwise the simple `|end - start|`. If the
 * feature wraps but the owning record's length is unknown (`seqLen` undefined),
 * fall back to `|end - start|` (the component's record-not-found path). Returns
 * a raw number; the `.toLocaleString()` formatting stays in the component.
 */
export function featureLength(
  seqLen: number | undefined,
  start: number,
  end: number,
  segments?: { start: number; end: number }[],
): number {
  if (segments && segments.length > 0) {
    return segments.reduce((acc, seg) => acc + Math.abs(seg.end - seg.start), 0);
  }
  if (start > end) {
    return seqLen !== undefined ? (seqLen - start) + end : Math.abs(end - start);
  }
  return Math.abs(end - start);
}

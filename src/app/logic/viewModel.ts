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

/**
 * Fuzzy-match score as a whole-number percentage of the best score found,
 * matching SearchPanel's inline calc. Guards divide-by-zero: when
 * `maxScoreFound <= 0` returns 0. Otherwise `round((score / maxScoreFound) * 100)`.
 * The `%` suffix and the `match.score` truthiness guard stay in the component.
 */
export function scorePercent(score: number, maxScoreFound: number): number {
  return maxScoreFound > 0 ? Math.round((score / maxScoreFound) * 100) : 0;
}

/**
 * Alignment-related derived state for the App shell, combining the three inline
 * `useMemo` derivations verbatim:
 *  - `isAlignmentLoaded`: >= 2 records AND all (aligned-or-raw) lengths equal.
 *  - `alignmentLength`: max (aligned-or-raw) length; 0 for no records.
 *  - `sessionMoleculeType`: null for no records, else 'protein'/'nucleotide'
 *    from the session flag.
 * `alignedSequence || sequence` is the per-record length source. Pure; the
 * `useMemo` wiring stays in App.
 */
export function deriveAlignmentState(
  records: { sequence: string; alignedSequence?: string }[],
  isProteinSession: boolean,
): { isAlignmentLoaded: boolean; alignmentLength: number; sessionMoleculeType: 'nucleotide' | 'protein' | null } {
  const isAlignmentLoaded =
    records.length < 2
      ? false
      : new Set(records.map(r => (r.alignedSequence || r.sequence).length)).size === 1;
  const alignmentLength =
    records.length === 0
      ? 0
      : Math.max(...records.map(r => (r.alignedSequence || r.sequence).length));
  const sessionMoleculeType: 'nucleotide' | 'protein' | null =
    records.length === 0 ? null : isProteinSession ? 'protein' : 'nucleotide';
  return { isAlignmentLoaded, alignmentLength, sessionMoleculeType };
}

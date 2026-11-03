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
import { complementAlphabet, extractFeatureSequence } from '@/src/domain/bio/sequence';
import { featureEnvelope } from '@/src/domain/bio/featureEnvelope';
import { isOrderLocation, isPartialLocation } from '@/src/domain/bio/locationFlags';

/**
 * The sequence slice a record/feature detail view should display.
 *
 * With no feature the whole sequence is shown. A normal feature (`start <= end`)
 * shows
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

/** Wrapping features and segments need the source length to count across the origin. */
export function featureLength(
  seqLen: number | undefined,
  start: number,
  end: number,
  segments?: { start: number; end: number }[],
): number {
  if (segments && segments.length > 0) {
    return segments.reduce((acc, seg) => acc + featureLength(seqLen, seg.start, seg.end), 0);
  }
  if (start > end) {
    return seqLen !== undefined ? (seqLen - start) + end : Math.abs(end - start);
  }
  return Math.abs(end - start);
}

/**
 * The two sequences the annotation details window offers (LOC-7 in `docs/standards/locations.md`).
 *
 * - `feature`: the sequence the location defines ({@link extractFeatureSequence}); `null` for
 *   `order()`, which INSDC does not join (LOC-2).
 * - `region`: record bases over the feature's envelope, forward strand, gaps between intervals
 *   included; `regionStart > regionEnd` crosses the origin.
 *
 * `featureLength` is the sum of the location intervals; `regionLength` the envelope's length.
 */
export interface FeatureSequenceViews {
  feature: string | null;
  featureLength: number;
  intervals: number;
  region: string;
  regionLength: number;
  regionStart: number;
  regionEnd: number;
  partial: boolean;
}

export function featureSequenceViews(
  record: Pick<SeqRecord, 'sequence' | 'moleculeType'>,
  feature: BioFeature,
): FeatureSequenceViews {
  const { sequence } = record;
  const alphabet = record.moleculeType === 'protein' ? 'protein' : complementAlphabet(sequence, record.moleculeType);
  const envelope = featureEnvelope(feature);
  return {
    feature: isOrderLocation(feature) ? null : extractFeatureSequence(feature, sequence, alphabet).featureSeq,
    featureLength: featureLength(sequence.length, feature.start, feature.end, feature.segments),
    intervals: feature.segments?.length || 1,
    region: getDisplaySeq(sequence, envelope),
    regionLength: featureLength(sequence.length, envelope.start, envelope.end),
    regionStart: envelope.start,
    regionEnd: envelope.end,
    partial: isPartialLocation(feature),
  };
}

/**
 * Alignment-related derived state for the App shell, deriving:
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

/**
 * The patch produced by editing a feature's start or end coordinate in
 * FeatureEditorModal.
 *
 * The edited field is set to `parseInt(rawValue)`. When the feature has 0 or 1
 * segment, its `segments` is rebuilt to a single `[{ start, end }]` reflecting
 * the new coordinate (a single-range feature keeps segments and coordinates in
 * sync). A multi-segment feature (`length > 1`) gets NO `segments` in the patch
 * — only the envelope coordinate changes; the explicit segment list is edited
 * separately.
 *
 * NOTE: `parseInt` of an unparseable value yields `NaN`, which is stored as-is
 * (existing behavior — intentionally NOT guarded here). The `setFeature`/
 * `onChange` side-effect stays in the component.
 */
export function featureCoordPatch(
  feature: Pick<BioFeature, 'start' | 'end' | 'segments'>,
  field: 'start' | 'end',
  rawValue: string,
): Partial<BioFeature> {
  const val = parseInt(rawValue);
  const patch: Partial<BioFeature> = field === 'start' ? { start: val } : { end: val };
  if (!feature.segments || feature.segments.length <= 1) {
    patch.segments =
      field === 'start'
        ? [{ start: val, end: feature.end }]
        : [{ start: feature.start, end: val }];
  }
  return patch;
}

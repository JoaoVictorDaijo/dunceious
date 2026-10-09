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
 * Programmed ribosomal frameshifts inside a coding sequence.
 *
 * INSDC writes a frameshift as a `join` whose consecutive segments re-read a
 * base (−1: `join(266..13468,13468..21555)`) or skip one (+1:
 * `join(21..90,92..451)`), optionally flagged `/ribosomal_slippage`. The
 * shift is therefore readable from the coordinates alone: translation
 * continues without a gap in a different frame. A wider gap is an intron.
 */

import type { FeatureSegment } from './types';

/** Bases re-read (negative) or skipped (positive) between two consecutive codons. */
export type FrameShift = -2 | -1 | 1 | 2;

/** The largest |shift| that is a ribosomal frameshift rather than an intron or gap. */
const MAX_SHIFT = 2;

/**
 * Frame shift between two consecutive codons, from the genomic index of the
 * previous codon's last base and the next codon's first base, both in reading
 * order (a reverse-strand codon reads downwards). `0` when translation
 * continues in frame, `null` when the codons are not adjacent at all.
 */
export function frameShift(prevLast: number, nextFirst: number, strand: 1 | -1): FrameShift | 0 | null {
  const step = strand === 1 ? nextFirst - prevLast - 1 : prevLast - nextFirst - 1;
  if (Math.abs(step) > MAX_SHIFT) return null;
  return step as FrameShift | 0;
}

export interface SegmentFrameshift {
  /**
   * 0-based genomic index of the first base of the later segment: the shared
   * base of a −1 slip, the first base after the skipped one of a +1 slip.
   */
  position: number;
  shift: FrameShift;
}

/**
 * Frameshift junctions of a multi-segment feature. Segments are listed in
 * genomic order on both strands, so the step between a segment's end and the
 * next segment's start is the same shift read forward or in reverse.
 */
export function segmentFrameshifts(feature: { strand: 1 | -1; segments?: FeatureSegment[] }): SegmentFrameshift[] {
  const segments = feature.segments ?? [];
  const junctions: SegmentFrameshift[] = [];
  for (let i = 0; i + 1 < segments.length; i++) {
    const shift = frameShift(segments[i].end - 1, segments[i + 1].start, 1);
    if (shift) junctions.push({ position: segments[i + 1].start, shift });
  }
  return junctions;
}

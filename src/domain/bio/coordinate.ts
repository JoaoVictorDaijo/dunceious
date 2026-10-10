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


import type { BioFeature, FeatureSegment, SeqRecord } from "./types";
import { splitWrapAround } from "./intervals";

/**
 * Transposes a raw-sequence position to the corresponding index in an
 * aligned sequence that may contain gap characters ('-').
 *
 * Returns `alignedSeq.length` when `originalPos` exceeds the number of
 * non-gap characters in the aligned sequence.
 */
export const transposeCoordinates = (
  originalPos: number,
  alignedSeq: string,
): number => {
  let ungappedCount = 0;
  for (let i = 0; i < alignedSeq.length; i++) {
    if (ungappedCount === originalPos) {
      return i;
    }
    if (alignedSeq[i] !== "-") {
      ungappedCount++;
    }
  }
  return alignedSeq.length;
};

function createCoordinateLookup(alignedSeq: string): (start: number, end: number) => FeatureSegment {
  const boundaries = new Uint32Array(alignedSeq.length + 1);
  let ungappedLength = 0;

  // A boundary precedes any following gaps; position zero also precedes leading gaps.
  for (let i = 0; i < alignedSeq.length; i++) {
    if (alignedSeq[i] !== "-") {
      boundaries[++ungappedLength] = i + 1;
    }
  }

  const transposeEnd = (position: number) =>
    Number.isInteger(position) && position >= 0 && position <= ungappedLength
      ? boundaries[position]
      : alignedSeq.length;

  return (start, end) => ({
    // Empty intervals stay empty; a nonempty part starts on its first real base.
    start: start !== end && Number.isInteger(start) && start >= 0 && start < ungappedLength
      ? boundaries[start + 1] - 1
      : transposeEnd(start),
    end: transposeEnd(end),
  });
}

/**
 * Maps an ungapped half-open interval to aligned columns, excluding flanking
 * gaps but retaining internal gaps. A descending interval keeps its wrap order.
 * Empty intervals retain their boundary before following gaps.
 */
export function transposeInterval(start: number, end: number, alignedSeq: string): FeatureSegment {
  return createCoordinateLookup(alignedSeq)(start, end);
}

/**
 * Non-gap pieces of an aligned half-open search window. Search highlighting
 * excludes inserted gaps; annotation bars instead use continuous intervals.
 */
export const buildAlignedSegments = (
  alignedSeq: string,
  alignedStart: number,
  alignedEnd: number,
): FeatureSegment[] => {
  const segments: FeatureSegment[] = [];
  let currentStart: number | null = null;

  for (let i = alignedStart; i < alignedEnd; i++) {
    if (alignedSeq[i] !== "-") {
      if (currentStart === null) {
        currentStart = i;
      }
    } else {
      if (currentStart !== null) {
        segments.push({ start: currentStart, end: i });
        currentStart = null;
      }
    }
  }

  if (currentStart !== null) {
    segments.push({ start: currentStart, end: alignedEnd });
  }

  return segments;
};

/**
 * Processes a list of SeqRecords, transposing all their features from raw
 * sequence coordinates into aligned sequence coordinates.
 *
 * Each original part stays continuous across inserted gaps, excluding gaps
 * before its first or after its last base. Only circular origin crossings
 * split a part; joins retain their original part order and strands.
 */
export const processTransposition = (records: SeqRecord[]): SeqRecord[] => {
  return records.map((record) => {
    if (!record.alignedSequence) return record;
    if (record.features.length === 0) return { ...record, features: [] };

    const alignedSeq = record.alignedSequence;
    const transpose = createCoordinateLookup(alignedSeq);

    const transposedFeatures: BioFeature[] = record.features.map((feat) => {
      const originalSegments: FeatureSegment[] =
        feat.segments && feat.segments.length > 0
          ? feat.segments
          : [{ start: feat.start, end: feat.end }];

      const newSegments: FeatureSegment[] = [];

      for (const seg of originalSegments) {
        const parts = splitWrapAround(seg.start, seg.end, record.sequence.length);

        for (const part of parts) {
          const aligned = transpose(part.start, part.end);
          if (aligned.end <= aligned.start || alignedSeq[aligned.start] === "-") continue;
          newSegments.push(seg.strand === undefined ? aligned : { ...aligned, strand: seg.strand });
        }
      }

      return { ...feat, ...transpose(feat.start, feat.end), segments: newSegments };
    });

    return { ...record, features: transposedFeatures };
  });
};

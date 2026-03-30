import type { SeqRecord, BioFeature, FeatureSegment } from './types';

/**
 * Transposes a raw-sequence position to the corresponding index in an
 * aligned sequence that may contain gap characters ('-').
 *
 * Returns `alignedSeq.length` when `originalPos` exceeds the number of
 * non-gap characters in the aligned sequence.
 */
export const transposeCoordinates = (
  originalPos: number,
  alignedSeq: string
): number => {
  let ungappedCount = 0;
  for (let i = 0; i < alignedSeq.length; i++) {
    if (ungappedCount === originalPos) {
      return i;
    }
    if (alignedSeq[i] !== '-') {
      ungappedCount++;
    }
  }
  return alignedSeq.length;
};

/**
 * Given two aligned positions `alignedStart` (inclusive) and `alignedEnd`
 * (exclusive) in an aligned sequence, returns the non-gap sub-segments
 * between those positions.
 *
 * Gaps inside the region produce separate segments so that rendered
 * features skip over inserted gaps from other sequences.
 */
export const buildAlignedSegments = (
  alignedSeq: string,
  alignedStart: number,
  alignedEnd: number
): FeatureSegment[] => {
  const segments: FeatureSegment[] = [];
  let currentStart: number | null = null;

  for (let i = alignedStart; i < alignedEnd; i++) {
    if (alignedSeq[i] !== '-') {
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
 * Features that span wrap-around junctions (start > end on circular
 * sequences) are split into two coordinate ranges before transposition.
 */
export const processTransposition = (records: SeqRecord[]): SeqRecord[] => {
  return records.map(record => {
    if (!record.alignedSequence) return record;

    const alignedSeq = record.alignedSequence;

    const transposedFeatures: BioFeature[] = record.features.map(feat => {
      const originalSegments: FeatureSegment[] =
        feat.segments && feat.segments.length > 0
          ? feat.segments
          : [{ start: feat.start, end: feat.end }];

      const newSegments: FeatureSegment[] = [];

      for (const seg of originalSegments) {
        const isWrap = seg.start > seg.end;
        const parts: Array<{ s: number; e: number }> = isWrap
          ? [
              { s: seg.start, e: record.sequence.length },
              { s: 0, e: seg.end },
            ]
          : [{ s: seg.start, e: seg.end }];

        for (const part of parts) {
          const alignedStart = transposeCoordinates(part.s, alignedSeq);
          const alignedEnd = transposeCoordinates(part.e, alignedSeq);
          newSegments.push(...buildAlignedSegments(alignedSeq, alignedStart, alignedEnd));
        }
      }

      const newStart = transposeCoordinates(feat.start, alignedSeq);
      const newEnd = transposeCoordinates(feat.end, alignedSeq);

      return { ...feat, start: newStart, end: newEnd, segments: newSegments };
    });

    return { ...record, features: transposedFeatures };
  });
};

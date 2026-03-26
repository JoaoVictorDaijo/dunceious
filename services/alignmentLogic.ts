
import { SeqRecord, BioFeature } from '../types';

/**
 * Transposes coordinates from raw sequence to aligned sequence containing gaps.
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
 * Processes a list of SeqRecords, transposing all their features 
 * based on their provided alignedSequence.
 * Features are broken into segments that skip gaps in the alignment.
 */
export const processTransposition = (records: SeqRecord[]): SeqRecord[] => {
  return records.map(record => {
    if (!record.alignedSequence) return record;

    const transposedFeatures = record.features.map(feat => {
      // Original segments (if any) or fallback to start/end
      const originalSegments = feat.segments && feat.segments.length > 0 
        ? feat.segments 
        : [{ start: feat.start, end: feat.end }];

      const newSegments: { start: number, end: number }[] = [];

      originalSegments.forEach(seg => {
        // Handle potential wrap-around segments if they were somehow passed in raw
        const isWrap = seg.start > seg.end;
        const parts = isWrap 
          ? [{ s: seg.start, e: record.sequence.length }, { s: 0, e: seg.end }]
          : [{ s: seg.start, e: seg.end }];

        parts.forEach(part => {
          const alignedStart = transposeCoordinates(part.s, record.alignedSequence!);
          const alignedEnd = transposeCoordinates(part.e, record.alignedSequence!);
          
          // Scan the aligned sequence between alignedStart and alignedEnd
          // and create sub-segments that exclude gaps.
          let currentStart: number | null = null;
          for (let i = alignedStart; i < alignedEnd; i++) {
            const char = record.alignedSequence![i];
            if (char !== '-') {
              if (currentStart === null) {
                currentStart = i;
              }
            } else {
              if (currentStart !== null) {
                newSegments.push({ start: currentStart, end: i });
                currentStart = null;
              }
            }
          }
          if (currentStart !== null) {
            newSegments.push({ start: currentStart, end: alignedEnd });
          }
        });
      });

      // The overall start/end for the feature in aligned coordinates
      const newStart = transposeCoordinates(feat.start, record.alignedSequence!);
      const newEnd = transposeCoordinates(feat.end, record.alignedSequence!);

      return {
        ...feat,
        start: newStart,
        end: newEnd,
        segments: newSegments
      };
    });

    return {
      ...record,
      features: transposedFeatures
    };
  });
};

/**
 * Calculates a consensus sequence from aligned records.
 */
export const calculateConsensus = (records: SeqRecord[]): string => {
  if (records.length === 0) return "";
  
  const alignedRecords = records.filter(r => r.alignedSequence);
  if (alignedRecords.length === 0) return "";
  
  const length = Math.max(...alignedRecords.map(r => r.alignedSequence!.length));
  let consensus = "";

  for (let i = 0; i < length; i++) {
    const counts: Record<string, number> = {};
    alignedRecords.forEach(r => {
      const char = r.alignedSequence![i];
      if (char) {
        counts[char] = (counts[char] || 0) + 1;
      }
    });

    let maxChar = "-";
    let maxCount = 0;
    Object.entries(counts).forEach(([char, count]) => {
      if (count > maxCount) {
        maxCount = count;
        maxChar = char;
      }
    });

    consensus += maxChar;
  }

  return consensus;
};

/**
 * Improved mock alignment for demonstration.
 * Simulates a real MSA by keeping conserved regions and scattering indels.
 */
export const mockAlign = (records: SeqRecord[]): SeqRecord[] => {
  if (records.length === 0) return [];
  
  const baseLength = Math.max(...records.map(r => r.sequence.length));
  const targetLength = Math.floor(baseLength * 1.12);

  return records.map((r, recordIdx) => {
    let aligned = "";
    let seqPtr = 0;
    
    // Seeded random for "consistent" mock alignment per record
    let seed = recordIdx * 5678;
    const pseudoRandom = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };

    // We iterate through the target length and decide whether to pull from seq or add gap
    for (let i = 0; i < targetLength; i++) {
      const remainingTarget = targetLength - i;
      const remainingSeq = r.sequence.length - seqPtr;

      // Force remaining sequence if we're at the limit
      if (remainingTarget <= remainingSeq) {
        aligned += r.sequence[seqPtr] || "";
        seqPtr++;
        continue;
      }

      // 10% chance of gap unless we need to catch up
      if (pseudoRandom() < 0.08 && remainingSeq > 0) {
        aligned += "-";
      } else if (seqPtr < r.sequence.length) {
        aligned += r.sequence[seqPtr];
        seqPtr++;
      } else {
        aligned += "-";
      }
    }

    return { ...r, alignedSequence: aligned };
  });
};

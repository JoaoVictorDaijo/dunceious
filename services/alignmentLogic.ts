
import type { SeqRecord } from '../types';
export { transposeCoordinates, processTransposition } from '../src/domain/bio/coordinate';
export { calculateConsensus } from '../src/domain/bio/consensus';

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

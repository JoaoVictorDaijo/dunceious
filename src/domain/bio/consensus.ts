import type { SeqRecord } from './types';

/**
 * Calculates a majority-vote consensus sequence from a set of aligned records.
 *
 * Only records that have an `alignedSequence` property are considered.
 * Returns an empty string when no aligned records are present.
 */
export const calculateConsensus = (records: SeqRecord[]): string => {
  if (records.length === 0) return '';

  const alignedRecords = records.filter(r => r.alignedSequence);
  if (alignedRecords.length === 0) return '';

  const length = Math.max(...alignedRecords.map(r => r.alignedSequence!.length));
  let consensus = '';

  for (let i = 0; i < length; i++) {
    const counts: Record<string, number> = {};

    for (const r of alignedRecords) {
      const char = r.alignedSequence![i];
      if (char) {
        counts[char] = (counts[char] ?? 0) + 1;
      }
    }

    let maxChar = '-';
    let maxCount = 0;

    for (const [char, count] of Object.entries(counts)) {
      if (count > maxCount) {
        maxCount = count;
        maxChar = char;
      }
    }

    consensus += maxChar;
  }

  return consensus;
};

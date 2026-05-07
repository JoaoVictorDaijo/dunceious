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

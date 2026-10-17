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

import { expect, it } from 'vitest';
import { hitColumns } from '@/src/core/search/hitColumns';
import { formatPairAlignment, hitCountsText } from '../hitAlignmentText';

it('uses the hand-written EMBOSS pair layout across the 60-column boundary', () => {
  const columns = hitColumns({ cigar: '70=', query: 'A'.repeat(70), span: 'A'.repeat(70), mode: 'whole', alphabet: 'nucleotide' });
  expect(formatPairAlignment({ columns, queryName: 'Query', recordName: 'record', queryStart: 1, recordStart: 101, strand: 1 })).toBe(
`Query              1 AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA     60
                     ||||||||||||||||||||||||||||||||||||||||||||||||||||||||||||
record           101 AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA    160

Query             61 AAAAAAAAAA     70
                     ||||||||||
record           161 AAAAAAAAAA    170

`);
});
it('counts down reverse record coordinates and keeps gaps out of coordinate counts', () => {
  const columns = hitColumns({ cigar: '1=1I1D1X', query: 'ACT', span: 'AGC', mode: 'whole', alphabet: 'nucleotide' });
  expect(formatPairAlignment({ columns, queryName: 'Q', recordName: 'r', queryStart: 1, recordStart: 8, strand: -1 })).toBe(
`Q                       1 AC-T      3
                          |  .
r (reverse strand)      8 A-GC      6

`);
});
it('uses column counts and plural rules', () => {
  expect(hitCountsText({ identical: 61, mismatch: 2, insertion: 1, deletion: 1, ambiguity: 0, similar: 0 }, 'whole'))
    .toBe('61 identical, 2 mismatches, 1 insertion, 1 deletion');
  expect(hitCountsText({ identical: 0, mismatch: 1, insertion: 0, deletion: 0, ambiguity: 1, similar: 0 }, 'iupac'))
    .toBe('0 identical, 1 matched through an ambiguity code, 1 mismatch');
});

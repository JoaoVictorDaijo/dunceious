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

import { describe, expect, it } from 'vitest';
import { hitColumns, hitCounts, matchLineSymbol } from '../hitColumns';

describe('hit display classes', () => {
  it.each(['whole', 'iupac'] as const)('uses %s acceptance rather than CIGAR identity', mode => {
    const columns = hitColumns({ cigar: '1=1X1=1X', query: 'ATAT', span: 'AUAU', mode, alphabet: 'nucleotide' });
    expect(columns.map(c => c.cls)).toEqual(['identical', 'mismatch', 'identical', 'mismatch']);
    const ambiguity = hitColumns({ cigar: '5=', query: 'ACNAC', span: 'ACNAC', mode, alphabet: 'nucleotide' });
    expect(ambiguity[2]).toMatchObject({ cls: 'mismatch', recordAmbiguity: true });
    expect(hitCounts(ambiguity)).toEqual({ identical: 4, ambiguity: 0, similar: 0, mismatch: 1, insertion: 0, deletion: 0 });
    expect(hitColumns({ cigar: '1X', query: 'R', span: 'A', mode, alphabet: 'nucleotide' })[0]).toMatchObject({ cls: 'ambiguity', recordAmbiguity: false });
  });
  it('uses the protein alphabet for N and X', () => {
    expect(hitColumns({ cigar: '2=', query: 'NX', span: 'NX', mode: 'whole', alphabet: 'protein' }).map(c => [c.cls, c.recordAmbiguity]))
      .toEqual([['identical', false], ['mismatch', true]]);
  });
  it('preserves case while comparing case-insensitively', () => {
    const columns = hitColumns({ cigar: '4=', query: 'aCgT', span: 'ACGT', mode: 'whole', alphabet: 'nucleotide' });
    expect(columns.map(c => c.cls)).toEqual(['identical', 'identical', 'identical', 'identical']);
    expect(columns.map(c => c.queryBase).join('')).toBe('aCgT');
  });
  it('keeps Local identity independent of matrix similarity', () => {
    const columns = hitColumns({ cigar: '1=2X', query: 'NAC', span: 'NGT', mode: 'local', alphabet: 'nucleotide', matrixScore: q => q === 'A' ? 1 : -1 });
    expect(columns.map(c => c.cls)).toEqual(['identical', 'similar', 'mismatch']);
    expect(columns.every(c => !c.recordAmbiguity)).toBe(true);
    expect(() => hitColumns({ cigar: '1=', query: 'A', span: 'A', mode: 'local', alphabet: 'nucleotide' })).toThrow(Error);
  });
  it('skips clips and tracks offsets on both sides of indels', () => {
    const columns = hitColumns({ cigar: '2S3=1I1D', query: 'ttaCgG', span: 'ACgT', mode: 'whole', alphabet: 'nucleotide' });
    expect(columns).toEqual([
      { op: '=', cls: 'identical', queryIndex: 2, recordOffset: 0, queryBase: 'a', recordBase: 'A', recordAmbiguity: false },
      { op: '=', cls: 'identical', queryIndex: 3, recordOffset: 1, queryBase: 'C', recordBase: 'C', recordAmbiguity: false },
      { op: '=', cls: 'identical', queryIndex: 4, recordOffset: 2, queryBase: 'g', recordBase: 'g', recordAmbiguity: false },
      { op: 'I', cls: 'insertion', queryIndex: 5, recordOffset: null, queryBase: 'G', recordBase: null, recordAmbiguity: false },
      { op: 'D', cls: 'deletion', queryIndex: null, recordOffset: 3, queryBase: null, recordBase: 'T', recordAmbiguity: false },
    ]);
    expect(hitCounts(columns)).toEqual({ identical: 3, ambiguity: 0, similar: 0, mismatch: 0, insertion: 1, deletion: 1 });
  });
  it('uses EMBOSS pair-format match symbols', () => {
    expect((['identical', 'ambiguity', 'similar', 'mismatch', 'deletion', 'insertion'] as const).map(matchLineSymbol)).toEqual(['|', ':', ':', '.', ' ', ' ']);
  });
});

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

import { describe, it, expect } from 'vitest';
import { parseFasta } from '../fasta';

describe('parseFasta', () => {
  it('parses a single record and takes the id from the first whitespace token', () => {
    expect(parseFasta('>seq1 a description\nACGT')).toEqual([
      { id: 'seq1', name: 'seq1', sequence: 'ACGT', features: [], moleculeType: 'dna' },
    ]);
  });

  it('concatenates wrapped sequence lines', () => {
    const [rec] = parseFasta('>s\nAC\nGT\nAA');
    expect(rec.sequence).toBe('ACGTAA');
  });

  it('parses multiple records and infers molecule type per record', () => {
    const recs = parseFasta('>a\nACGT\n>b\nMKLEP');
    expect(recs.map(r => r.id)).toEqual(['a', 'b']);
    expect(recs[1].moleculeType).toBe('protein');
  });

  it('flushes the trailing record after the last header', () => {
    expect(parseFasta('>only\nACGT')).toHaveLength(1);
  });

  it('returns an empty array for empty or header-less content', () => {
    expect(parseFasta('')).toEqual([]);
    expect(parseFasta('ACGT\nACGT')).toEqual([]);
  });

  it('skips blank and whitespace-only sequence lines', () => {
    expect(parseFasta('>s\nAC\n\n  \nGT')[0].sequence).toBe('ACGT');
  });
});

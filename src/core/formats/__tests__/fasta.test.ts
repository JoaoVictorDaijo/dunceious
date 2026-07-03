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
import type { SeqRecord } from '@/src/domain/bio/types';
import { parseFasta, exportToFasta } from '../fasta';

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

function record(overrides: Partial<SeqRecord> = {}): SeqRecord {
  return { id: 'REC1', name: 'Record 1', sequence: 'ATGCAAATAG', features: [], ...overrides };
}

describe('exportToFasta', () => {
  it('wraps a single record at 60 characters per line', () => {
    expect(exportToFasta([record({ sequence: 'A'.repeat(70) })]))
      .toBe('>REC1\n' + 'A'.repeat(60) + '\n' + 'A'.repeat(10));
  });

  it('emits a plain header and unwrapped sequence for a short record', () => {
    expect(exportToFasta([record()])).toBe('>REC1\nATGCAAATAG');
  });

  it('slices to [start, end) and stamps the slice header when both are given', () => {
    // 'ATGCAAATAG'.substring(2, 5) → 'GCA'
    expect(exportToFasta([record()], 2, 5)).toBe('>REC1 [Slice: 2-5]\nGCA');
  });

  it('prefers alignedSequence over sequence when present', () => {
    expect(exportToFasta([record({ alignedSequence: 'XXXX' })])).toBe('>REC1\nXXXX');
  });

  it('joins multiple records with a blank line', () => {
    const out = exportToFasta([
      record({ id: 'A', sequence: 'AAA' }),
      record({ id: 'B', sequence: 'CCC' }),
    ]);
    expect(out).toBe('>A\nAAA\n\n>B\nCCC');
  });
});

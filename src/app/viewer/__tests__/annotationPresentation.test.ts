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

import { withSearchHit } from '@/src/domain/bio/searchHit';
import { annotationQueryMarks } from '../annotationPresentation';
import { annotationBase } from '../annotationPresentation';
import { complementAlphabet } from '@/src/domain/bio/sequence';
import { describe, expect, it } from 'vitest';
import type { BioFeature } from '@/src/domain/bio/types';
import { terminalSegmentIndex } from '../annotationPresentation';

const feature = (patch: Partial<BioFeature>): BioFeature => ({ type: 'CDS', name: 'f', start: 0, end: 10, strand: 1, ...patch });

describe('terminalSegmentIndex', () => {
  it('picks the last segment of a forward join, even when it crosses the origin', () => {
    expect(terminalSegmentIndex(feature({ segments: [{ start: 0, end: 4 }, { start: 6, end: 10 }] }))).toBe(1);
    expect(terminalSegmentIndex(feature({ start: 2426, end: 1758, segments: [{ start: 2426, end: 3308 }, { start: 0, end: 1758 }] }))).toBe(1);
  });

  it('picks the first segment of a whole-feature reverse join, which it reads backwards', () => {
    expect(terminalSegmentIndex(feature({ strand: -1, segments: [{ start: 0, end: 4 }, { start: 6, end: 10 }] }))).toBe(0);
  });

  it('reads per-segment strands in join order', () => {
    expect(terminalSegmentIndex(feature({ strand: -1, segments: [{ start: 6, end: 10, strand: -1 }, { start: 0, end: 4, strand: -1 }] }))).toBe(1);
  });

  it('returns -1 without segments', () => {
    expect(terminalSegmentIndex(feature({}))).toBe(-1);
  });
});


describe('minus-strand record alphabet', () => {
  it.each([
    ['TA', 'rna', 'AT'], ['UA', 'rna', 'AU'], ['TA', 'dna', 'AT'],
    ['MTA', 'protein', 'MTA'], ['tuAa', 'rna', 'aaUu'],
  ] as const)('complements %s declared %s in the record alphabet', (sequence, moleculeType, expected) => {
    const alphabet = moleculeType === 'protein' ? 'protein' : complementAlphabet(sequence, moleculeType);
    expect([...sequence].map(base => annotationBase(base, -1, alphabet)).join('')).toBe(expected);
    expect([...sequence].map(base => annotationBase(base, 1, alphabet)).join('')).toBe(sequence);
  });
});

it('draws Local soft clips and matrix similarity on the annotation layer', () => {
  const f = withSearchHit(feature({ start: 0, end: 2 }), {
    v: 1, query: 'CAT', mode: 'local', alphabet: 'nucleotide', params: { scoring: 'EDNAFULL, gap 10/0.5 (EMBOSS water defaults)' },
    strand: 1, cigar: '1S1=1X', span: { start: 0, end: 2, strand: 1 }, appVersion: 'test', createdAt: '', exportNote: false,
  });
  expect(annotationQueryMarks(f, 'AU', 'rna')?.marks.map(m => [m.column, m.cls, m.queryLetter])).toEqual([[0, 'identical', 'A'], [1, 'similar', 'T']]);
});

function queryFeature(query: string, cigar: string, end: number, strand: 1 | -1 = 1, mode: 'whole' | 'local' = 'whole', alphabet: 'nucleotide' | 'protein' = 'nucleotide') {
  return withSearchHit(feature({ end, strand }), {
    v: 1, query, cigar, mode, alphabet, params: {}, strand,
    span: { start: 0, end, strand }, appVersion: 'test', createdAt: '', exportNote: false,
  });
}

describe('annotation query layer', () => {
  it('omits absent and stale provenance while retaining a current aligned envelope', () => {
    expect(annotationQueryMarks(feature({}), 'AC', 'dna')).toBeNull();
    const current = queryFeature('AC', '2=', 2);
    expect(annotationQueryMarks({ ...current, end: 1 }, 'AC', 'dna')).toBeNull();
    const aligned = { ...current, start: 1, end: 4, segments: [{ start: 1, end: 4 }] };
    const expected = {
      marks: [
        { column: 1, recordBase: 'A', cls: 'identical', recordAmbiguity: false, queryLetter: 'A' },
        { column: 3, recordBase: 'C', cls: 'identical', recordAmbiguity: false, queryLetter: 'C' },
      ], insertions: [],
    };
    expect(annotationQueryMarks(aligned, '-A-C', 'dna')).toEqual(expected);
    expect(annotationQueryMarks(aligned, '-A-C', 'dna')).toEqual(expected);
    expect(annotationQueryMarks({ ...aligned, segments: [{ start: 1, end: 3 }] }, '-A-C', 'dna')).toBeNull();
  });

  it.each([
    [1, 'AC', 'TG', 'TG'],
    [-1, 'GT', 'AC', 'CA'],
  ] as const)('places and combines leading insertions on strand %s', (strand, sequence, inserted, displayed) => {
    const f = queryFeature(`${inserted}AC`, '2I2=', 2, strand);
    expect(annotationQueryMarks(f, sequence, 'dna')).toEqual({
      marks: [
        { column: 0, recordBase: sequence[0], cls: 'identical', recordAmbiguity: false, queryLetter: strand === 1 ? 'A' : 'C' },
        { column: 1, recordBase: sequence[1], cls: 'identical', recordAmbiguity: false, queryLetter: strand === 1 ? 'C' : 'A' },
      ],
      insertions: [{ afterColumn: strand === 1 ? -1 : 1, bases: displayed, flankStart: strand === 1 ? 0 : 2, flankEnd: strand === 1 ? 1 : 3 }],
    });
  });

  it('distinguishes ambiguity matches, ambiguous record bases, mismatches and deletions', () => {
    const f = queryFeature('RAC', '1X1=1X1D', 4);
    expect(annotationQueryMarks(f, 'ANGT', 'dna')?.marks).toEqual([
      { column: 0, recordBase: 'A', cls: 'ambiguity', recordAmbiguity: false, queryLetter: 'R' },
      { column: 1, recordBase: 'N', cls: 'mismatch', recordAmbiguity: true, queryLetter: 'A' },
      { column: 2, recordBase: 'G', cls: 'mismatch', recordAmbiguity: false, queryLetter: 'C' },
      { column: 3, recordBase: 'T', cls: 'deletion', recordAmbiguity: false, queryLetter: null },
    ]);
  });

  it('uses protein matrix similarity and invalidates cached marks when the sequence changes', () => {
    const f = queryFeature('ID', '2X', 2, 1, 'local', 'protein');
    expect(annotationQueryMarks(f, 'LE', 'protein')?.marks.map(m => [m.cls, m.queryLetter])).toEqual([['similar', 'I'], ['similar', 'D']]);
    expect(annotationQueryMarks(f, 'WW', 'protein')?.marks.map(m => m.cls)).toEqual(['mismatch', 'mismatch']);
  });
});

/*
 * Dunceious
 * Copyright (C) 2026 João Victor Daijo and Murilo Cassiano
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
import { conceptualTranslation, compareTranslation } from '../translation';
import type { BioFeature, SeqRecord } from '../types';
const feature = (length: number, metadata: Record<string, string> = {}): BioFeature => ({
  type: 'CDS', name: 'c', start: 0, end: length, strand: 1,
  segments: [{ start: 0, end: length }], metadata,
});
const record = (sequence: string, moleculeType: SeqRecord['moleculeType'] = 'dna'): SeqRecord => ({ id: 'r', name: 'r', sequence, moleculeType, features: [] });
describe('conceptual CDS translation, spec literal oracle', () => {
  it.each([
    ['GCN', 'A'], ['NNN', 'X'], ['RAY', 'B'], ['AUG', 'M'],
    ['ATGGC', 'MA'], ['ATGNN', 'M'], ['ATGAAATAA', 'MK'],
    ['ATGTAAGGGTAA', 'M*G'],
  ])('%s gives %s', (dna, residues) => {
    expect(conceptualTranslation(feature(dna.length), record(dna))).toMatchObject({ status: 'ok', residues });
  });
  it('gates protein before invalid code and exception', () => {
    expect(conceptualTranslation(feature(9, { transl_table: '99', transl_except: 'Sec' }), record('GCTAAAGCT', 'protein'))).toEqual({ status: 'unavailable', reason: 'protein-record' });
  });
  it('rebuilds the contextual table-28 terminal set', () => {
    const result = conceptualTranslation(feature(6, { transl_table: '28' }), record('ATGTAN'));
    expect(result).toMatchObject({ status: 'ok', residues: 'MX', threePrimeIndeterminate: true, internalStops: [] });
    if (result.status !== 'ok') throw new Error('expected translation');
    expect([...result.possible[1]].sort()).toEqual(['*', 'Y']);
    expect(compareTranslation('MQ', result).differing).toEqual([1]);
    expect(compareTranslation('MY', result).differing).toEqual([]);
  });
  it('uses partial ends for initiation and terminal context', () => {
    const f = feature(9, { transl_table: '11' });
    expect(conceptualTranslation(f, record('GTGAAATAA'))).toMatchObject({ residues: 'MK' });
    f.segments![0].partialStart = true;
    expect(conceptualTranslation(f, record('GTGAAATAA'))).toMatchObject({ residues: 'VK' });
    f.metadata = { transl_table: '27' }; f.segments = [{ start: 0, end: 9, partialEnd: true }];
    expect(conceptualTranslation(f, record('ATGAAATGA'))).toMatchObject({ residues: 'MKW' });
    f.metadata = {};
    expect(conceptualTranslation(f, record('ATGAAATAA'))).toMatchObject({ residues: 'MK', internalStops: [] });
  });
  it('stop beats stored X and unmatched tails use positions', () => {
    const result = conceptualTranslation(feature(12), record('ATGTAAGGGTAA'));
    if (result.status !== 'ok') throw new Error('expected translation');
    expect(compareTranslation('MXG', result)).toEqual({ differing: [1], storedExtra: '', storedShortBy: 0 });
    expect(compareTranslation('M*G', result).differing).toEqual([]);
    expect(compareTranslation('M', result).storedShortBy).toBe(2);
  });
});

it.each([
  ['ATGTAR', '28', 'M'], ['ATGTRA', '1', 'M'], ['ATGTMA', '1', 'MX'],
  ['ATGYTNTAA', '1', 'MX'], ['ATGYTNTAA', '3', 'MX'],
])('resolves literal ambiguous terminal sets for %s table %s', (dna, transl_table, residues) => {
  expect(conceptualTranslation(feature(dna.length, { transl_table }), record(dna))).toMatchObject({ status: 'ok', residues });
});
it('uses the feature strand for omitted orientations in a mixed explicit join', () => {
  const f: BioFeature = { ...feature(6), strand: -1, segments: [{ start: 0, end: 3, strand: -1 }, { start: 3, end: 6 }] };
  expect(conceptualTranslation(f, record('CATTTC'))).toMatchObject({ residues: 'ME', alignedIndices: [2, 1, 0, 5, 4, 3] });
  expect(f.segments![1].strand).toBeUndefined();
  f.segments = [{ start: 0, end: 3 }, { start: 3, end: 6 }];
  expect(conceptualTranslation(f, record('CATTTC'))).toMatchObject({ residues: 'EM' });
});
it.each([
  [{ transl_table: '99' }, 'invalid-code'], [{ transl_except: '' }, 'unsupported-exception'],
  [{ _gffStrand: '.' }, 'unknown-strand'], [{ _gffStrand: '?' }, 'unknown-strand'],
])('refuses an ineligible CDS %j', (metadata, reason) => {
  expect(conceptualTranslation(feature(9, metadata), record('ATGAAATAA'))).toEqual({ status: 'unavailable', reason });
});
it('refuses order, remote and unknown completeness while allowing a local join', () => {
  const f: BioFeature = { ...feature(12), segments: [{ start: 0, end: 3 }, { start: 6, end: 12 }], operator: 'order' };
  expect(conceptualTranslation(f, record('ATGCCCAAATAA'))).toEqual({ status: 'unavailable', reason: 'nonlocal-location' });
  f.operator = 'join';
  expect(conceptualTranslation(f, record('ATGCCCAAATAA'))).toMatchObject({ residues: 'MK' });
  f.remoteParts = [{ start: 6, end: 12, accession: 'J00194.1', strand: 1, index: 1 }];
  expect(conceptualTranslation(f, record('ATGCCCAAATAA'))).toEqual({ status: 'unavailable', reason: 'nonlocal-location' });
  expect(conceptualTranslation({ ...feature(9), segments: undefined }, record('ATGAAATAA'))).toEqual({ status: 'unavailable', reason: 'unknown-completeness' });
});
it.each(['dna', 'rna', undefined] as const)('keeps nucleotide eligibility for %s', moleculeType => {
  const r = record(moleculeType === 'rna' ? 'GCUAAAGCU' : 'GCTAAAGCT'); r.moleculeType = moleculeType;
  expect(conceptualTranslation(feature(9), r)).toMatchObject({ residues: 'AKA' });
});

it('uses reverse-strand biological partial ends for initiation and termination', () => {
  const initiation: BioFeature = { ...feature(9, { transl_table: '11' }), strand: -1, segments: [{ start: 0, end: 9, partialEnd: true }] };
  expect(conceptualTranslation(initiation, record('TTATTTCAC'))).toMatchObject({ residues: 'VK', possible: ['V', 'K'], internalStops: [], alignedIndices: [8, 7, 6, 5, 4, 3] });
  delete initiation.segments![0].partialEnd;
  expect(conceptualTranslation(initiation, record('TTATTTCAC'))).toMatchObject({ residues: 'MK' });
  const termination: BioFeature = { ...feature(9, { transl_table: '27' }), strand: -1, segments: [{ start: 0, end: 9, partialStart: true }] };
  expect(conceptualTranslation(termination, record('TCATTTCAT'))).toMatchObject({ residues: 'MKW', possible: ['M', 'K', 'W'], internalStops: [] });
  delete termination.segments![0].partialStart;
  expect(conceptualTranslation(termination, record('TCATTTCAT'))).toMatchObject({ residues: 'MK' });
});

it('uses the evaluated last interval for joined and mixed-strand terminal context', () => {
  const joined: BioFeature = { ...feature(12, { transl_table: '27' }), operator: 'join', segments: [{ start: 0, end: 6 }, { start: 9, end: 12, partialEnd: true }] };
  expect(conceptualTranslation(joined, record('ATGAAACCCTGA'))).toMatchObject({ residues: 'MKW', internalStops: [] });
  delete joined.segments![1].partialEnd;
  joined.segments![0].partialEnd = true;
  expect(conceptualTranslation(joined, record('ATGAAACCCTGA'))).toMatchObject({ residues: 'MK', internalStops: [] });
  const mixed: BioFeature = { ...feature(12, { transl_table: '27' }), operator: 'join', segments: [{ start: 0, end: 6, strand: 1 }, { start: 9, end: 12, strand: -1, partialStart: true }] };
  expect(conceptualTranslation(mixed, record('ATGAAACCCTCA'))).toMatchObject({ residues: 'MKW', possible: ['M', 'K', 'W'] });
  delete mixed.segments![1].partialStart;
  expect(conceptualTranslation(mixed, record('ATGAAACCCTCA'))).toMatchObject({ residues: 'MK', possible: ['M', 'K'] });
});

it.each([
  ['', 0, 0, '1', 'empty'],
  ['ATG', 3, 3, '1', 'empty'],
  ['AT', 0, 2, '3', 'empty'],
  ['---', 0, 3, '1', 'empty'],
  ['ATG', 3, 4, '1', 'unknown-completeness'],
  ['ATG', -1, 3, '1', 'unknown-completeness'],
] as const)('refuses empty or out-of-bounds coding input %s [%s,%s) frame %s', (sequence, start, end, codon_start, reason) => {
  const f: BioFeature = { ...feature(end, { codon_start }), start, segments: [{ start, end }] };
  expect(conceptualTranslation(f, record(sequence))).toEqual({ status: 'unavailable', reason });
});

it.each([
  ['G', '', []], ['GC', 'A', ['A']], ['TAA', '', []],
] as const)('handles the first whole-codon boundary for %s', (sequence, residues, possible) => {
  expect(conceptualTranslation(feature(sequence.length), record(sequence))).toMatchObject({ status: 'ok', residues, possible, internalStops: [] });
});

it('retains the preceding stop when a partial CDS has two terminal stops', () => {
  const f = feature(9); f.segments![0].partialEnd = true;
  expect(conceptualTranslation(f, record('ATGTAATAA'))).toMatchObject({ residues: 'M*', possible: ['M', '*'], internalStops: [1] });
});

it.each([
  ['1', 'FL', [1]], ['3', 'FLT', []],
] as const)('compares stored MT against the literal YTN readings in table %s', (transl_table, readings, differing) => {
  // gc.prt 4.6: TTN contributes F/L; CTN contributes L in table 1 and T in table 3.
  const result = conceptualTranslation(feature(9, { transl_table }), record('ATGYTNTAA'));
  if (result.status !== 'ok') throw new Error('expected translation');
  expect(result.residues).toBe('MX');
  expect(result.possible).toEqual(['M', readings]);
  expect(compareTranslation('MT', result)).toEqual({ differing, storedExtra: '', storedShortBy: 0 });
});

it('uses source biological geometry when extracting an aligned circular CDS', () => {
  const feature: BioFeature = { type: 'CDS', name: 'wrap', start: 3, end: 2, strand: 1, segments: [{ start: 3, end: 2 }], biological: { start: 3, end: 2, strand: 1, segments: [{ start: 3, end: 2 }] } };
  const record = { sequence: 'TAAATG--', isCircular: true, biologicalLength: 6 };
  expect(conceptualTranslation(feature, record)).toMatchObject({ status: 'ok', residues: 'M', internalStops: [] });
  expect(conceptualTranslation(feature, { ...record, isCircular: false }).status).toBe('unavailable');
});

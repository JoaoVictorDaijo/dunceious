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


import { describe, expect, it, vi } from 'vitest';
import { conceptualTranslation, compareTranslation } from '../translation';
import type { BioFeature } from '../types';
const f = (sequence: string, values: string[]): BioFeature => ({ type: 'CDS', name: 'c', start: 0, end: sequence.length, strand: 1, segments: [{ start: 0, end: sequence.length }], translationExceptions: values });
const run = (dna: string, values: string[]) => conceptualTranslation(f(dna, values), { sequence: dna, moleculeType: 'dna' });
describe('INSDC 11.4 code breaks, literal independent oracle', () => {
  it.each([
    ['ATGTGACCCTAA', ['(pos:4..6,aa:Sec)'], 'MUP'],
    ['AUGUGACCCUAA', ['(pos:4..6,aa:sEc)'], 'MUP'],
    ['ATGTGATAGCCCTAA', ['(pos:4..6,aa:Sec)', '(pos:7..9,aa:Pyl)'], 'MUOP'],
    ['ATGAAATGA', ['(pos:7..9,aa:Sec)'], 'MKU'],
    ['ATGAAACCCTAA', ['(pos:4..6,aa:TERM)'], 'M*P'],
    ['ATGTA', ['(pos:4..5,aa:TERM)'], 'M'],
    ['ATGT', ['(pos:4,aa:TERM)'], 'M'],
  ])('%s with %j gives %s', (dna, values, residues) => {
    expect(run(dna, values)).toMatchObject({ status: 'ok', residues, exceptions: values.map((raw, occurrence) => ({ raw, occurrence, status: 'applied' })) });
  });
  it.each(['', '(pos:4..5,aa:Sec)', '(pos:5..7,aa:Sec)', '(pos:4..6,aa:Banana)'])('does not certify malformed %s', value => {
    expect(run('ATGTGATAA', [value])).toMatchObject({ status: 'unavailable', exceptions: [{ status: 'malformed' }] });
  });
  it('drops an outside whole codon and computes with the retained one', () => {
    expect(run('ATGTGATAA', ['(pos:40..42,aa:Sec)', '(pos:4..6,aa:Sec)'])).toMatchObject({ residues: 'MU', exceptions: [{ status: 'dropped' }, { status: 'applied' }] });
  });
  it('OTHER matches every sense reading, but a definite stop beats X', () => {
    const result = run('ATGTGATAA', ['(pos:4..6,aa:OTHER)']);
    expect(result).toMatchObject({ residues: 'MX' });
    if (result.status !== 'ok') throw new Error('translation unavailable');
    for (const protein of ['MW', 'MU', 'MO', 'MB', 'MZ', 'MJ']) expect(compareTranslation(protein, result).differing).toEqual([]);
    expect(compareTranslation('M*', result).differing).toEqual([1]);
  });
});

it.each([
  ['TTAGGGTCACAT', -1, [{ start: 0, end: 12 }], '(pos:complement(7..9),aa:Sec)', 'MUP'],
  ['ATGAAATAA', -1, [{ start: 0, end: 9 }], '(pos:1..3,aa:Sec)', 'LFU'],
  ['ATGTNNNNNGATAA', 1, [{ start: 0, end: 4 }, { start: 9, end: 14 }], '(pos:join(4,10..11),aa:Sec)', 'MU'],
  ['TGATAAATG', 1, [{ start: 6, end: 9 }, { start: 0, end: 6 }], '(pos:1..3,aa:Sec)', 'MU'],
] as const)('maps biological visits for %s', (sequence, strand, segments, raw, residues) => {
  const feature = { ...f(sequence, [raw]), strand, segments: [...segments] };
  expect(conceptualTranslation(feature, { sequence, isCircular: true })).toMatchObject({ status: 'ok', residues });
});
it.each(['R', 'R.1', 'R.2', 'X.1'])('resolves exact qualified identity %s', identity => {
  const result = conceptualTranslation(f('ATGTGATAA', [`(pos:${identity}:4..6,aa:Sec)`]), { sequence: 'ATGTGATAA', accession: 'R', version: 'R.1' });
  expect(result).toMatchObject(['R', 'R.1'].includes(identity) ? { status: 'ok', residues: 'MU' } : { status: 'ok', residues: 'M*', exceptions: [{ status: 'dropped' }] });
});
it('retains the pre-trimming terminal slot evidence', () => {
  expect(run('ATGTA', ['(pos:4..5,aa:TERM)'])).toMatchObject({ residues: 'M', exceptions: [{ bases: [3, 4], codonIndex: 1, possible: '*' }] });
});
it('drops all conflicting survivors and reads ordinary DNA', () => {
  expect(run('ATGTGATAA', ['(pos:4..6,aa:Sec)', '(pos:4..6,aa:Pyl)'])).toMatchObject({ status: 'ok', residues: 'M*', exceptions: [{ status: 'dropped' }, { status: 'dropped' }] });
});

it('rejects explicit contrary orientation even for a single terminal base', () => {
  expect(run('ATGT', ['(pos:complement(4),aa:TERM)'])).toMatchObject({ status: 'unavailable', exceptions: [{ status: 'malformed', reason: expect.stringContaining('orientation') }] });
});

it('does not iterate over unrelated record bases when the CDS has no exceptions', () => {
  const sequence = 'ATGAAATAA' + 'N'.repeat(9000);
  const original = String.prototype[Symbol.iterator];
  const iterator = vi.spyOn(String.prototype, Symbol.iterator).mockImplementation(function(this: string) {
    if (String(this) === sequence) throw new Error('whole-record iteration');
    return original.call(this);
  });
  try { expect(conceptualTranslation(f('ATGAAATAA', []), { sequence })).toMatchObject({ residues: 'MK' }); }
  finally { iterator.mockRestore(); }
});

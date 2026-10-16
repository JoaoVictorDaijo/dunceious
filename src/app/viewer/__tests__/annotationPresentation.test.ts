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

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
import { compareToReference } from '../referenceComparison';

describe('compareToReference — nucleotide', () => {
  it('marks the same base as identical, ignoring case', () => {
    expect(compareToReference('A', 'A', 'nucleotide')).toBe('identical');
    expect(compareToReference('a', 'A', 'nucleotide')).toBe('identical');
  });

  it('treats U and T as the same base', () => {
    expect(compareToReference('U', 'T', 'nucleotide')).toBe('identical');
    expect(compareToReference('u', 'C', 'nucleotide')).toBe('substitution');
  });

  it('marks two different bases as a substitution (D614G: A→G)', () => {
    expect(compareToReference('G', 'A', 'nucleotide')).toBe('substitution');
  });

  it('marks a gap facing a base as a gap, in both directions', () => {
    expect(compareToReference('-', 'A', 'nucleotide')).toBe('gap');
    expect(compareToReference('A', '-', 'nucleotide')).toBe('gap');
    expect(compareToReference(undefined, 'A', 'nucleotide')).toBe('gap');
  });

  it('marks a gap facing a gap as identical', () => {
    expect(compareToReference('-', '-', 'nucleotide')).toBe('identical');
  });

  it('never calls an ambiguity code identical or a substitution', () => {
    expect(compareToReference('N', 'A', 'nucleotide')).toBe('ambiguous');
    expect(compareToReference('A', 'N', 'nucleotide')).toBe('ambiguous');
    expect(compareToReference('N', 'N', 'nucleotide')).toBe('ambiguous');
    expect(compareToReference('R', 'G', 'nucleotide')).toBe('ambiguous');
    expect(compareToReference('?', 'G', 'nucleotide')).toBe('ambiguous');
  });
});

describe('compareToReference — protein', () => {
  it('compares standard residues', () => {
    expect(compareToReference('D', 'D', 'protein')).toBe('identical');
    expect(compareToReference('G', 'D', 'protein')).toBe('substitution');
  });

  it('keeps U as selenocysteine rather than folding it into T', () => {
    expect(compareToReference('U', 'T', 'protein')).toBe('substitution');
  });

  it('treats X, B, Z and J as ambiguous', () => {
    for (const code of ['X', 'B', 'Z', 'J']) {
      expect(compareToReference(code, 'A', 'protein')).toBe('ambiguous');
    }
  });

  it('accepts a stop facing a stop as identical', () => {
    expect(compareToReference('*', '*', 'protein')).toBe('identical');
  });
});

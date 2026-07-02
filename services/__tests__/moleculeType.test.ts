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
import { detectMoleculeType } from '../moleculeType';

describe('detectMoleculeType', () => {
  it('classifies a pure ACGT sequence as dna', () => {
    expect(detectMoleculeType('ACGTACGT')).toBe('dna');
  });
  it('classifies a sequence with U (and no protein chars) as rna', () => {
    expect(detectMoleculeType('ACGU')).toBe('rna');
  });
  it('classifies a sequence with a protein-only residue as protein', () => {
    expect(detectMoleculeType('ACGTL')).toBe('protein'); // L never occurs in the nucleotide alphabet
  });
  it('prioritises protein over rna when both signals present', () => {
    expect(detectMoleculeType('ACGUL')).toBe('protein'); // L (protein) wins over U (rna)
  });
  it('is case-insensitive', () => {
    expect(detectMoleculeType('mkle')).toBe('protein'); // lowercase L/E are protein-only
  });
  it('treats an empty sequence as dna', () => {
    expect(detectMoleculeType('')).toBe('dna');
  });
  it('treats ambiguous nucleotide codes (N) as dna', () => {
    expect(detectMoleculeType('ACGTN')).toBe('dna');
  });
  it('classifies IUPAC nucleotide ambiguity codes as dna', () => {
    expect(detectMoleculeType('ACGTRYSWKMBDHVN')).toBe('dna');
  });
  it('classifies protein-only ambiguity codes (X/J/O/Z) as protein', () => {
    expect(detectMoleculeType('ACGTX')).toBe('protein');
    expect(detectMoleculeType('ACGTZ')).toBe('protein');
  });
  it('detects rna from lowercase u', () => {
    expect(detectMoleculeType('acgu')).toBe('rna');
  });
});

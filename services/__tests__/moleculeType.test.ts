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
  it('classifies a sequence with a protein-only char as protein', () => {
    expect(detectMoleculeType('ACGTM')).toBe('protein'); // M is protein-only
  });
  it('prioritises protein over rna when both signals present', () => {
    expect(detectMoleculeType('ACGUM')).toBe('protein');
  });
  it('is case-insensitive', () => {
    expect(detectMoleculeType('mkv')).toBe('protein');
  });
  it('treats an empty sequence as dna', () => {
    expect(detectMoleculeType('')).toBe('dna');
  });
  it('treats ambiguous nucleotide codes (N) as dna', () => {
    expect(detectMoleculeType('ACGTN')).toBe('dna');
  });
  it('classifies excluded/ambiguous codes (B/J/O/X/Z) as dna', () => {
    expect(detectMoleculeType('ACGTX')).toBe('dna');
  });
  it('detects rna from lowercase u', () => {
    expect(detectMoleculeType('acgu')).toBe('rna');
  });
});

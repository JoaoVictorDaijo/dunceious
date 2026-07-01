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
import {
  getNucleotideColor,
  getAminoAcidColor,
  getFeatureColor,
  getOriginalPos,
} from '../bioUtils';

describe('getNucleotideColor', () => {
  it('returns the canonical colour for each base (case-insensitive)', () => {
    expect(getNucleotideColor('A')).toBe('#22c55e');
    expect(getNucleotideColor('t')).toBe('#f43f5e');
    expect(getNucleotideColor('C')).toBe('#3b82f6');
    expect(getNucleotideColor('g')).toBe('#eab308');
  });

  it('returns the gap colour for "-"', () => {
    expect(getNucleotideColor('-')).toBe('#64748b');
  });

  it('returns the fallback colour for an unknown character', () => {
    expect(getNucleotideColor('X')).toBe('#94a3b8');
  });
});

describe('getAminoAcidColor', () => {
  it('colours hydrophobic non-polar residues amber', () => {
    for (const aa of ['A', 'V', 'I', 'L', 'M']) {
      expect(getAminoAcidColor(aa)).toBe('#f59e0b');
    }
  });

  it('colours each special/grouped residue by its convention', () => {
    expect(getAminoAcidColor('G')).toBe('#94a3b8'); // slate
    expect(getAminoAcidColor('P')).toBe('#d97706'); // dark amber
    expect(getAminoAcidColor('F')).toBe('#a855f7'); // aromatic purple
    expect(getAminoAcidColor('W')).toBe('#a855f7');
    expect(getAminoAcidColor('Y')).toBe('#8b5cf6'); // violet
    expect(getAminoAcidColor('K')).toBe('#3b82f6'); // positive blue
    expect(getAminoAcidColor('R')).toBe('#3b82f6');
    expect(getAminoAcidColor('H')).toBe('#60a5fa'); // sky blue
    expect(getAminoAcidColor('D')).toBe('#ef4444'); // negative red
    expect(getAminoAcidColor('E')).toBe('#f97316'); // orange-red
    expect(getAminoAcidColor('S')).toBe('#22c55e'); // polar green
    expect(getAminoAcidColor('T')).toBe('#22c55e');
    expect(getAminoAcidColor('N')).toBe('#10b981'); // emerald
    expect(getAminoAcidColor('Q')).toBe('#10b981');
    expect(getAminoAcidColor('C')).toBe('#eab308'); // cysteine yellow
  });

  it('colours stop codons (* and _) red and gaps slate', () => {
    expect(getAminoAcidColor('*')).toBe('#ef4444');
    expect(getAminoAcidColor('_')).toBe('#ef4444');
    expect(getAminoAcidColor('-')).toBe('#64748b');
  });

  it('is case-insensitive and falls back for unknown residues', () => {
    expect(getAminoAcidColor('a')).toBe('#f59e0b');
    expect(getAminoAcidColor('Z')).toBe('#94a3b8');
  });
});

describe('getFeatureColor', () => {
  it('returns the mapped colour for a known feature type', () => {
    expect(getFeatureColor('CDS')).toBe('#8b5cf6');
    expect(getFeatureColor('gene')).toBe('#0ea5e9');
  });

  it('prefers a custom colour override when provided', () => {
    expect(getFeatureColor('CDS', { CDS: '#123456' })).toBe('#123456');
  });

  it('falls through to the built-in map when the override lacks the type', () => {
    expect(getFeatureColor('gene', { CDS: '#123456' })).toBe('#0ea5e9');
  });

  it('returns the fallback colour for an unknown feature type', () => {
    expect(getFeatureColor('totally_unknown')).toBe('#94a3b8');
  });
});

describe('getOriginalPos', () => {
  it('is the identity for a gap-free sequence', () => {
    expect(getOriginalPos('ACGT', 4)).toBe(4);
    expect(getOriginalPos('ACGT', 0)).toBe(0);
  });

  it('discounts leading and internal gaps before the position', () => {
    // '--AC' up to pos 4 → 2 real bases
    expect(getOriginalPos('--AC', 4)).toBe(2);
    // 'A-C-G' up to pos 5 → A,C,G = 3
    expect(getOriginalPos('A-C-G', 5)).toBe(3);
  });

  it('clamps a position past the end of the aligned sequence', () => {
    expect(getOriginalPos('ACGT', 100)).toBe(4);
  });
});

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

import { describe, it, expect } from 'vitest';
import { frameShift, segmentFrameshifts } from '../frameshift';

describe('frameShift', () => {
  it('is 0 when the next codon starts right after the previous one', () => {
    expect(frameShift(2, 3, 1)).toBe(0);
  });

  it('is −1 when the next codon re-reads the last base (−1 PRF)', () => {
    // SARS-CoV-2 ORF1ab: AAC ends on 0-based 13467, CGG starts on 13467.
    expect(frameShift(13467, 13467, 1)).toBe(-1);
  });

  it('is +1 when one base is skipped (+1 PRF)', () => {
    expect(frameShift(89, 91, 1)).toBe(1);
  });

  it('reads reverse-strand codons downwards', () => {
    expect(frameShift(10, 9, -1)).toBe(0);
    expect(frameShift(10, 10, -1)).toBe(-1);
    expect(frameShift(10, 8, -1)).toBe(1);
  });

  it('is null across an intron or any gap wider than a frameshift', () => {
    expect(frameShift(10, 100, 1)).toBeNull();
    expect(frameShift(10, 5, 1)).toBeNull();
    expect(frameShift(10, 20, -1)).toBeNull();
  });
});

describe('segmentFrameshifts', () => {
  it('finds the −1 slip of a GenBank join whose segments share one base', () => {
    // join(266..13468,13468..21555)
    const f = { strand: 1 as const, segments: [{ start: 265, end: 13468 }, { start: 13467, end: 21555 }] };
    expect(segmentFrameshifts(f)).toEqual([{ position: 13467, shift: -1 }]);
  });

  it('finds a +1 slip across one skipped base', () => {
    // join(21..90,92..451)
    const f = { strand: 1 as const, segments: [{ start: 20, end: 90 }, { start: 91, end: 451 }] };
    expect(segmentFrameshifts(f)).toEqual([{ position: 91, shift: 1 }]);
  });

  it('reports a complemented join at the same shared base', () => {
    const f = { strand: -1 as const, segments: [{ start: 100, end: 200 }, { start: 199, end: 300 }] };
    expect(segmentFrameshifts(f)).toEqual([{ position: 199, shift: -1 }]);
  });

  it('ignores spliced joins, abutting segments and single-segment features', () => {
    expect(segmentFrameshifts({ strand: 1, segments: [{ start: 0, end: 10 }, { start: 200, end: 300 }] })).toEqual([]);
    expect(segmentFrameshifts({ strand: 1, segments: [{ start: 0, end: 10 }, { start: 10, end: 30 }] })).toEqual([]);
    expect(segmentFrameshifts({ strand: 1, segments: [{ start: 0, end: 10 }] })).toEqual([]);
    expect(segmentFrameshifts({ strand: 1 })).toEqual([]);
  });
});

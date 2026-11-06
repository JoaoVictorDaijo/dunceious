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

import { parseLocation } from '@/src/core/genbank/locationParser';
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

  it('reads a nested complement in written order, like the same intervals in a plain join', () => {
    // complement(join(complement(1..3),3..5)) is written 1..3 then 3..5, sharing base 3; the parser
    // stores the parts reversed (evaluation order).
    const f = { strand: 1 as const, locationString: 'complement(join(complement(1..3),3..5))',
      segments: [{ start: 2, end: 5, strand: -1 as const }, { start: 0, end: 3, strand: 1 as const }] };
    expect(segmentFrameshifts(f)).toEqual(segmentFrameshifts({ strand: 1, segments: [{ start: 0, end: 3 }, { start: 2, end: 5 }] }));
    expect(segmentFrameshifts(f)).toEqual([{ position: 2, shift: -1 }]);
  });

  it('ignores spliced joins, abutting segments and single-segment features', () => {
    expect(segmentFrameshifts({ strand: 1, segments: [{ start: 0, end: 10 }, { start: 200, end: 300 }] })).toEqual([]);
    expect(segmentFrameshifts({ strand: 1, segments: [{ start: 0, end: 10 }, { start: 10, end: 30 }] })).toEqual([]);
    expect(segmentFrameshifts({ strand: 1, segments: [{ start: 0, end: 10 }] })).toEqual([]);
    expect(segmentFrameshifts({ strand: 1 })).toEqual([]);
  });
});

// INSDC FT 11.4 /ribosomal_slippage: slippage is written with join; order() implies nothing about
// joining its elements (§3.4.2.2), so its gaps are never frameshifts. Location from the
// SARS-CoV-2 orf1ab polyprotein (YP_009724389.1) Site features.
describe('segmentFrameshifts – order()', () => {
  const segments = [{ start: 147, end: 152 }, { start: 153, end: 161 }, { start: 172, end: 175 }];
  it('reads no junctions in an order() location, with or without its text', () => {
    expect(segmentFrameshifts({ strand: 1, segments, operator: 'order' })).toEqual([]);
    expect(segmentFrameshifts({ strand: 1, segments, locationString: 'order(148..152,154..161,173..175)' })).toEqual([]);
  });

  it('still reads the same gaps under join', () => {
    expect(segmentFrameshifts({ strand: 1, segments, operator: 'join' })).toEqual([{ position: 153, shift: 1 }]);
  });
});

// #241: complement(join(complement(1..6),6..12)) shares base 6, a −1 junction in written order. It
// must survive an edit that clears the location text.
describe('segmentFrameshifts – nested written order without text', () => {
  it('keeps the −1 junction of a nested feature from its written order', () => {
    const parsed = parseLocation('complement(join(complement(1..6),6..12))');
    expect(segmentFrameshifts({ strand: parsed.strand, segments: parsed.segments, operator: parsed.operator,
      writtenOrder: parsed.writtenOrder })).toEqual([{ position: 5, shift: -1 }]);
  });
});

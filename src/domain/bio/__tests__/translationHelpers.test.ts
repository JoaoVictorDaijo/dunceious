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

/**
 * Unit tests for the translation helper functions in `@/src/domain/bio/sequence`:
 *   - extractCodingSequence  (multi-segment, circular wrap-around, strand handling)
 *   - detectEarlyStop        (early vs terminal stop codon)
 */

import { describe, it, expect } from 'vitest';
import { extractCodingSequence, detectEarlyStop, translateSequence } from '../sequence';

// ---------------------------------------------------------------------------
// extractCodingSequence
// ---------------------------------------------------------------------------

describe('extractCodingSequence – forward strand', () => {
  const seq = 'ATGCCCGAGTAGAAA'; // ATG=M, CCC=P, GAG=E, TAG=*, AAA=K

  it('extracts a simple linear feature', () => {
    const { codingSeq, alignedIndices } = extractCodingSequence(
      { strand: 1, start: 0, end: 9 },
      seq
    );
    expect(codingSeq).toBe('ATGCCCGAG');
    expect(alignedIndices).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('extracts a multi-segment (join) feature and concatenates segments in order', () => {
    // join(0..3, 6..9) → ATG + GAG = ATGGAG
    const { codingSeq, alignedIndices } = extractCodingSequence(
      { strand: 1, start: 0, end: 9, segments: [{ start: 0, end: 3 }, { start: 6, end: 9 }] },
      seq
    );
    expect(codingSeq).toBe('ATGGAG');
    expect(alignedIndices).toEqual([0, 1, 2, 6, 7, 8]);
  });

  it('skips gap characters ("-") from an aligned sequence', () => {
    const alignedSeq = 'ATG---CCCGAG';
    const { codingSeq, alignedIndices } = extractCodingSequence(
      { strand: 1, start: 0, end: 12 },
      alignedSeq
    );
    expect(codingSeq).toBe('ATGCCCGAG');
    expect(alignedIndices).toEqual([0, 1, 2, 6, 7, 8, 9, 10, 11]);
  });
});

describe('extractCodingSequence – reverse strand', () => {
  // Sequence: ATGCCC  positions 0-5
  // RC of ATGCCC = GGGCAT
  const seq = 'ATGCCCGAG';

  it('reverse-complements the coding sequence for a minus-strand feature', () => {
    const { codingSeq } = extractCodingSequence(
      { strand: -1, start: 0, end: 6 },
      seq
    );
    expect(codingSeq).toBe('GGGCAT'); // RC of ATGCCC
  });

  it('reverses alignedIndices for a minus-strand feature', () => {
    const { alignedIndices } = extractCodingSequence(
      { strand: -1, start: 0, end: 6 },
      seq
    );
    // alignedIndices before reverse: [0,1,2,3,4,5], after reverse: [5,4,3,2,1,0]
    expect(alignedIndices).toEqual([5, 4, 3, 2, 1, 0]);
  });
});

describe('extractCodingSequence – circular wrap-around (start > end)', () => {
  // Genome of length 10: 'CCCATGAAAG'
  // A circular CDS that wraps origin: positions 8..10 then 0..3 (i.e. start=8, end=3)
  // Genomic positions 8,9 → 'AG', then positions 0,1,2 → 'CCC'  → 'AGCCC'
  const genome = 'CCCATGAAAG'; // length 10

  it('wraps around origin using explicit segments', () => {
    const { codingSeq, alignedIndices } = extractCodingSequence(
      { strand: 1, start: 8, end: 3, segments: [{ start: 8, end: 10 }, { start: 0, end: 3 }] },
      genome
    );
    expect(codingSeq).toBe('AGCCC');
    expect(alignedIndices).toEqual([8, 9, 0, 1, 2]);
  });

  it('wraps around origin without explicit segments when start > end', () => {
    const { codingSeq, alignedIndices } = extractCodingSequence(
      { strand: 1, start: 8, end: 3 },
      genome
    );
    // positions 8,9 → 'AG', then 0,1,2 → 'CCC'
    expect(codingSeq).toBe('AGCCC');
    expect(alignedIndices).toEqual([8, 9, 0, 1, 2]);
  });

  it('wraps origin on reverse strand', () => {
    // Same region but reverse strand: RC of 'AGCCC' = 'GGGCT'
    const { codingSeq } = extractCodingSequence(
      { strand: -1, start: 8, end: 3 },
      genome
    );
    expect(codingSeq).toBe('GGGCT');
  });

  // Degenerate wrap cases: splitWrapAround omits an empty part; assert the
  // caller's output matches the old always-both-parts inline code (which
  // iterated the omitted part zero times).
  it('omits the empty leading part when start == seqLength', () => {
    const { codingSeq, alignedIndices } = extractCodingSequence(
      { strand: 1, start: 10, end: 3 },
      genome
    );
    expect(codingSeq).toBe('CCC');
    expect(alignedIndices).toEqual([0, 1, 2]);
  });

  it('omits the empty trailing part when end == 0', () => {
    const { codingSeq, alignedIndices } = extractCodingSequence(
      { strand: 1, start: 8, end: 0 },
      genome
    );
    expect(codingSeq).toBe('AG');
    expect(alignedIndices).toEqual([8, 9]);
  });
});

// ---------------------------------------------------------------------------
// detectEarlyStop
// ---------------------------------------------------------------------------

describe('detectEarlyStop', () => {
  it('returns false when there is no stop codon at all', () => {
    // ATG CCC GAG → M P E (no stop)
    expect(detectEarlyStop('ATGCCCGAG')).toBe(false);
  });

  it('returns false when the stop codon is the last codon (normal termination)', () => {
    // ATG CCC TAA → M P _ (normal stop at end)
    expect(detectEarlyStop('ATGCCCTAA')).toBe(false);
  });

  it('returns true when an in-frame stop codon appears before the last codon', () => {
    // ATG TAG GAG → M _ E (early stop at codon 1)
    expect(detectEarlyStop('ATGTAGGAG')).toBe(true);
  });

  it('returns true for TGA early stop', () => {
    // ATG TGA GAG → M _ E
    expect(detectEarlyStop('ATGTGAGAG')).toBe(true);
  });

  it('returns true for TAA early stop', () => {
    // CCC TAA GAG → P _ E
    expect(detectEarlyStop('CCCTAAGAG')).toBe(true);
  });

  it('returns false for a single codon (nothing before the last codon)', () => {
    expect(detectEarlyStop('ATG')).toBe(false);
  });

  it('returns false for two codons when only the last is a stop', () => {
    // ATG TAA → only one codon before the last
    // fullCodons=2, loop runs for i<1 (i=0 only), codon[0]=ATG ≠ stop
    expect(detectEarlyStop('ATGTAA')).toBe(false);
  });

  it('returns true for two codons when the first (non-last) is a stop', () => {
    // TAA ATG → stop is NOT the last codon
    expect(detectEarlyStop('TAAATG')).toBe(true);
  });

  it('is consistent with translateSequence output', () => {
    const seq = 'ATGTAGGAG'; // M _ E
    const protein = translateSequence(seq);
    expect(protein).toBe('M_E');
    expect(detectEarlyStop(seq)).toBe(true);
  });
});

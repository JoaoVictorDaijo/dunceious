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
  reverseComplement,
  translateSequence,
  extractCodingSequence,
  detectEarlyStop,
  detectMoleculeType,
  classifyLocusMoleculeType,
  removeGapsWithMap,
  mapUngappedRangeToAligned,
  getOriginalPos,
  PROTEIN_ONLY_RESIDUES,
  isProteinSession,
} from '../sequence';

describe('reverseComplement', () => {
  it('reverse-complements a simple DNA sequence', () => {
    expect(reverseComplement('ATCG')).toBe('CGAT');
  });
  it('maps N to N and preserves gap characters', () => {
    expect(reverseComplement('N')).toBe('N');
    expect(reverseComplement('A-T')).toBe('A-T');
  });
  it('preserves lowercase', () => {
    expect(reverseComplement('atcg')).toBe('cgat');
  });
  it('is its own inverse', () => {
    expect(reverseComplement(reverseComplement('AATTCCGG'))).toBe('AATTCCGG');
  });
});

describe('translateSequence', () => {
  it('translates whole codons and stops', () => {
    expect(translateSequence('ATGTAA')).toBe('M_');
  });
  it('ignores a trailing partial codon', () => {
    expect(translateSequence('ATGA')).toBe('M');
  });
  it('emits ? for an unknown codon', () => {
    expect(translateSequence('ATGNNN')).toBe('M?');
  });
});

describe('extractCodingSequence', () => {
  it('extracts a forward single-segment CDS', () => {
    const { codingSeq, alignedIndices } = extractCodingSequence(
      { strand: 1, start: 0, end: 3 }, 'ATGCCC',
    );
    expect(codingSeq).toBe('ATG');
    expect(alignedIndices).toEqual([0, 1, 2]);
  });
  it('reverse-complements a minus-strand CDS and reverses the indices', () => {
    const { codingSeq, alignedIndices } = extractCodingSequence(
      { strand: -1, start: 0, end: 3 }, 'ATGCCC',
    );
    expect(codingSeq).toBe('CAT');
    expect(alignedIndices).toEqual([2, 1, 0]);
  });
  it('splits a circular wrap-around (start > end) at the origin', () => {
    const { codingSeq, alignedIndices } = extractCodingSequence(
      { strand: 1, start: 4, end: 2 }, 'GGTTAA',
    );
    expect(codingSeq).toBe('AAGG');
    expect(alignedIndices).toEqual([4, 5, 0, 1]);
  });
  it('skips gap characters', () => {
    const { codingSeq, alignedIndices } = extractCodingSequence(
      { strand: 1, start: 0, end: 5 }, 'AT-GC',
    );
    expect(codingSeq).toBe('ATGC');
    expect(alignedIndices).toEqual([0, 1, 3, 4]);
  });
});

describe('detectEarlyStop', () => {
  it('is false when there is no internal stop', () => {
    expect(detectEarlyStop('ATGCCCGAG')).toBe(false);
  });
  it('is false for a normal terminal stop', () => {
    expect(detectEarlyStop('ATGCCCTAA')).toBe(false);
  });
  it('is true for an internal stop before the last codon', () => {
    expect(detectEarlyStop('ATGTAGGAG')).toBe(true);
  });
});

describe('detectMoleculeType (canonical alphabet)', () => {
  it('classifies a pure ACGT sequence as dna', () => {
    expect(detectMoleculeType('ACGTACGT')).toBe('dna');
  });
  it('classifies a U-bearing non-protein sequence as rna', () => {
    expect(detectMoleculeType('ACGU')).toBe('rna');
    expect(detectMoleculeType('acgu')).toBe('rna');
  });
  it('classifies a sequence with a protein-only residue as protein', () => {
    expect(detectMoleculeType('ACGTL')).toBe('protein'); // L never occurs in the nucleotide alphabet
    expect(detectMoleculeType('MKLEP')).toBe('protein'); // realistic peptide
  });
  it('lets a protein-only residue win over the U/rna signal', () => {
    expect(detectMoleculeType('ACGUL')).toBe('protein');
  });
  it('treats nucleotide ambiguity codes (R Y S W K M B D H V N) as dna', () => {
    expect(detectMoleculeType('ACGTRYSWKMBDHVN')).toBe('dna');
  });
  it('treats a nucleotide-overlapping "protein" (MKV) as dna', () => {
    expect(detectMoleculeType('MKV')).toBe('dna');
  });
  it('classifies protein-only ambiguity codes (X J O Z) as protein', () => {
    expect(detectMoleculeType('ACGTX')).toBe('protein');
    expect(detectMoleculeType('ACGTZ')).toBe('protein');
  });
  it('treats an empty sequence as dna', () => {
    expect(detectMoleculeType('')).toBe('dna');
  });
  it('exposes the documented alphabet constant', () => {
    expect(PROTEIN_ONLY_RESIDUES).toBe('EFIJLOPQXZ*');
  });
});

describe('classifyLocusMoleculeType', () => {
  it('classifies an "aa" LOCUS as protein', () => {
    expect(classifyLocusMoleculeType('LOCUS  P1  100 aa  linear  UNK 01-JAN-2020')).toBe('protein');
  });
  it('classifies an RNA molecule token as rna', () => {
    expect(classifyLocusMoleculeType('LOCUS  R1  100 bp  mRNA  linear')).toBe('rna');
  });
  it('classifies a bp/DNA LOCUS as dna', () => {
    expect(classifyLocusMoleculeType('LOCUS  D1  100 bp  DNA  linear')).toBe('dna');
  });
});

describe('removeGapsWithMap', () => {
  it('maps ungapped indices back to aligned positions', () => {
    expect(removeGapsWithMap('A-C--G')).toEqual({ ungapped: 'ACG', map: [0, 2, 5] });
  });
  it('returns empties for an all-gap or empty sequence', () => {
    expect(removeGapsWithMap('----')).toEqual({ ungapped: '', map: [] });
    expect(removeGapsWithMap('')).toEqual({ ungapped: '', map: [] });
  });
});

describe('mapUngappedRangeToAligned', () => {
  it('returns {0,0} for an empty map', () => {
    expect(mapUngappedRangeToAligned([], 0, 4)).toEqual({ start: 0, end: 0 });
  });
  it('maps a mid-range and clamps out-of-range ends', () => {
    const map = [0, 2, 4, 5, 6, 7];
    expect(mapUngappedRangeToAligned(map, 1, 3)).toEqual({ start: 2, end: 5 });
    // Out-of-range: safeStart clamps to map.length-1 (=5) → map[5]=7, end=map[5]+1=8.
    expect(mapUngappedRangeToAligned(map, 10, 20)).toEqual({ start: 7, end: 8 });
  });
});

describe('getOriginalPos', () => {
  it('counts non-gap characters up to the aligned position', () => {
    expect(getOriginalPos('ACGT', 4)).toBe(4);
    expect(getOriginalPos('--AC', 4)).toBe(2);
    expect(getOriginalPos('A-C-G', 5)).toBe(3);
  });
  it('clamps an aligned position beyond the sequence length', () => {
    expect(getOriginalPos('ACGT', 100)).toBe(4);
  });
});

describe('isProteinSession', () => {
  it('is true when any record is protein', () => {
    expect(isProteinSession([{ moleculeType: 'dna' }, { moleculeType: 'protein' }])).toBe(true);
  });
  it('is false when no record is protein', () => {
    expect(isProteinSession([{ moleculeType: 'dna' }, { moleculeType: 'rna' }])).toBe(false);
  });
  it('is false for an empty session', () => {
    expect(isProteinSession([])).toBe(false);
  });
});

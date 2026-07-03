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
 * Pure sequence primitives — the canonical home for biology algorithms that
 * operate on raw residue strings: reverse-complement, codon translation,
 * molecule-type detection, and gap↔ungapped coordinate mapping.
 *
 * This module imports only sibling `domain` modules (`./intervals`, for
 * `splitWrapAround` — a legal `domain`→`domain` import per spec §4.1); every
 * export is a pure function over strings/number arrays.
 */

import { splitWrapAround } from './intervals';

// ---------------------------------------------------------------------------
// Reverse complement
// ---------------------------------------------------------------------------

/** Reverse-complements a nucleotide string, preserving case and gap ('-') characters. */
export function reverseComplement(seq: string): string {
  const complement: Record<string, string> = {
    'A': 'T', 'T': 'A', 'C': 'G', 'G': 'C', 'N': 'N',
    'R': 'Y', 'Y': 'R', 'S': 'S', 'W': 'W', 'K': 'M',
    'M': 'K', 'B': 'V', 'D': 'H', 'H': 'D', 'V': 'B',
    'a': 't', 't': 'a', 'c': 'g', 'g': 'c', 'n': 'n',
    '-': '-',
  };
  return seq.split('').reverse().map(base => complement[base] || base).join('');
}

// ---------------------------------------------------------------------------
// Translation
// ---------------------------------------------------------------------------

const GENETIC_CODE: Record<string, string> = {
  'ATA':'I', 'ATC':'I', 'ATT':'I', 'ATG':'M', 'ACA':'T', 'ACC':'T', 'ACG':'T', 'ACT':'T',
  'AAC':'N', 'AAT':'N', 'AAA':'K', 'AAG':'K', 'AGC':'S', 'AGT':'S', 'AGA':'R', 'AGG':'R',
  'CTA':'L', 'CTC':'L', 'CTG':'L', 'CTT':'L', 'CCA':'P', 'CCC':'P', 'CCG':'P', 'CCT':'P',
  'CAC':'H', 'CAT':'H', 'CAA':'Q', 'CAG':'Q', 'CGA':'R', 'CGC':'R', 'CGG':'R', 'CGT':'R',
  'GTA':'V', 'GTC':'V', 'GTG':'V', 'GTT':'V', 'GCA':'A', 'GCC':'A', 'GCG':'A', 'GCT':'A',
  'GAC':'D', 'GAT':'D', 'GAA':'E', 'GAG':'E', 'GGA':'G', 'GGC':'G', 'GGG':'G', 'GGT':'G',
  'TCA':'S', 'TCC':'S', 'TCG':'S', 'TCT':'S', 'TTC':'F', 'TTT':'F', 'TTA':'L', 'TTG':'L',
  'TAC':'Y', 'TAT':'Y', 'TAA':'_', 'TAG':'_', 'TGC':'C', 'TGT':'C', 'TGA':'_', 'TGG':'W',
};

export const translateSequence = (seq: string): string => {
  let protein = "";
  for (let i = 0; i < seq.length - 2; i += 3) {
    const tCodon = seq.substring(i, i + 3).toUpperCase();
    protein += GENETIC_CODE[tCodon] || '?';
  }
  return protein;
};

/**
 * Extracts the coding sequence for a feature from the full genome sequence,
 * respecting multi-part (join) and circular wrap-around locations.
 *
 * For reverse-strand features the nucleotide string is reverse-complemented
 * and `alignedIndices` is reversed so that codon position `i` maps to the
 * correct genomic coordinate.
 *
 * @param feature  A BioFeature-like object with strand, start, end, and optional segments.
 * @param seq      The raw genome sequence (no gap characters expected, but '-' is tolerated).
 * @returns        `{ codingSeq, alignedIndices }` ready for codon-by-codon rendering.
 */
export function extractCodingSequence(
  feature: {
    strand: 1 | -1;
    start: number;
    end: number;
    segments?: { start: number; end: number }[];
  },
  seq: string
): { codingSeq: string; alignedIndices: number[] } {
  const seqLen = seq.length;
  let segments: { start: number; end: number }[];

  if (feature.segments && feature.segments.length > 0) {
    segments = feature.segments;
  } else {
    segments = splitWrapAround(feature.start, feature.end, seqLen);
  }

  let codingSeq = '';
  const alignedIndices: number[] = [];

  segments.forEach(seg => {
    for (let j = seg.start; j < seg.end; j++) {
      const char = seq[j];
      if (char && char !== '-') {
        codingSeq += char;
        alignedIndices.push(j);
      }
    }
  });

  if (feature.strand === -1) {
    codingSeq = reverseComplement(codingSeq);
    alignedIndices.reverse();
  }

  return { codingSeq, alignedIndices };
}

/**
 * Returns `true` when the coding sequence contains an in-frame stop codon
 * before the final codon – indicating a "broken" (truncated) protein.
 *
 * A CDS that ends normally with a stop codon is NOT considered broken;
 * only an internal stop codon before the last position is flagged.
 *
 * @param codingSeq  Nucleotide string in translation-ready order (already
 *                   reverse-complemented for minus-strand features).
 */
export function detectEarlyStop(codingSeq: string): boolean {
  const fullCodons = Math.floor(codingSeq.length / 3);
  // Examine every codon except the last one
  for (let i = 0; i < fullCodons - 1; i++) {
    if (translateSequence(codingSeq.substring(i * 3, i * 3 + 3)) === '_') {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Molecule-type detection  (canonical — IUPAC-aware alphabet)
// ---------------------------------------------------------------------------

/**
 * Residues that occur ONLY in protein sequences — the complement of the IUPAC
 * nucleotide alphabet (A C G T U N R Y S W K M B D H V) within A–Z, plus the
 * stop symbol `*`. Presence of any of these proves a sequence is protein.
 * `U` (selenocysteine) is deliberately EXCLUDED because it is also RNA uracil.
 */
export const PROTEIN_ONLY_RESIDUES = 'EFIJLOPQXZ*';

// '*' is a literal inside a character class; the set has no other regex-special
// characters, and the pattern is non-global so `.test()` is stateless.
const PROTEIN_ONLY_PATTERN = new RegExp(`[${PROTEIN_ONLY_RESIDUES}]`);

/**
 * Classifies a residue string as DNA, RNA, or protein from its alphabet alone.
 *
 * `protein` when the sequence contains any residue that never occurs in the
 * IUPAC nucleotide alphabet (see {@link PROTEIN_ONLY_RESIDUES}); otherwise
 * `rna` when it contains `U`; otherwise `dna`.
 *
 * Note: nucleotide ambiguity codes (R Y S W K M B D H V) and the amino-acid
 * letters overlapping them are treated as *nucleotide*, so a hypothetical
 * protein composed only of nucleotide-overlapping residues (e.g. "MKV") is
 * classified `dna`. Such sequences are vanishingly rare; load them via GenBank,
 * where the LOCUS line declares the molecule type explicitly.
 */
export const detectMoleculeType = (seq: string): 'dna' | 'rna' | 'protein' => {
  const upper = seq.toUpperCase();
  if (PROTEIN_ONLY_PATTERN.test(upper)) return 'protein';
  if (upper.includes('U')) return 'rna';
  return 'dna';
};

/**
 * Classifies a GenBank LOCUS line by its molecule-type/unit field.
 *
 * Protein records use "aa" (amino acids); RNA molecule tokens contain "rna"
 * (mRNA, rRNA, tRNA, ncRNA…); everything else is DNA. Reproduces the exact
 * logic previously inlined in `services/genbank/headerParser.ts`.
 */
export const classifyLocusMoleculeType = (locusLine: string): 'dna' | 'rna' | 'protein' => {
  const lower = locusLine.toLowerCase();
  if (/\baa\b/.test(lower)) return 'protein';
  if (lower.includes('rna')) return 'rna';
  return 'dna';
};

// ---------------------------------------------------------------------------
// Gap ↔ ungapped coordinate mapping
// ---------------------------------------------------------------------------

/**
 * Strips alignment gaps ('-') from a sequence, returning the ungapped string
 * plus `map`, where `map[i]` is the aligned-space index of the i-th ungapped
 * residue. Inverse of `mapUngappedRangeToAligned`.
 */
export function removeGapsWithMap(seq: string): { ungapped: string; map: number[] } {
  const chars: string[] = [];
  const map: number[] = [];
  for (let i = 0; i < seq.length; i++) {
    if (seq[i] !== '-') {
      chars.push(seq[i]);
      map.push(i);
    }
  }
  return { ungapped: chars.join(''), map };
}

/**
 * Maps an ungapped-space half-open range `[start, end)` back to aligned-space
 * coordinates using a `map` from `removeGapsWithMap`. `start`/`end` are clamped
 * into range; the aligned end is exclusive (last mapped index + 1). Returns
 * `{ start: 0, end: 0 }` for an empty map.
 */
export function mapUngappedRangeToAligned(
  map: number[],
  start: number,
  end: number,
): { start: number; end: number } {
  if (map.length === 0) return { start: 0, end: 0 };
  const safeStart = Math.max(0, Math.min(start, map.length - 1));
  const safeEndExclusive = Math.max(safeStart + 1, Math.min(end, map.length));

  const alignedStart = map[safeStart] ?? 0;
  const alignedEnd = (map[safeEndExclusive - 1] ?? alignedStart) + 1;
  return { start: alignedStart, end: alignedEnd };
}

/**
 * Maps a position in an aligned sequence (with gaps) back to the original sequence index.
 */
export const getOriginalPos = (alignedSeq: string, alignedPos: number): number => {
  let originalPos = 0;
  const limit = Math.min(alignedPos, alignedSeq.length);
  for (let i = 0; i < limit; i++) {
    if (alignedSeq[i] !== '-') {
      originalPos++;
    }
  }
  return originalPos;
};

// ---------------------------------------------------------------------------
// Session-level molecule-type
// ---------------------------------------------------------------------------

/**
 * True when any loaded record is a protein — the single canonical replacement
 * for the duplicated `records.some(r => r.moleculeType === 'protein')` checks in
 * the app hooks. `viewModel.deriveAlignmentState` still receives the resulting
 * boolean as a parameter (unchanged); this only dedups the computation.
 */
export function isProteinSession(records: { moleculeType?: 'dna' | 'rna' | 'protein' }[]): boolean {
  return records.some(r => r.moleculeType === 'protein');
}

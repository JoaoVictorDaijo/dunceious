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
    'A': 'T', 'T': 'A', 'U': 'A', 'C': 'G', 'G': 'C', 'N': 'N',
    'R': 'Y', 'Y': 'R', 'S': 'S', 'W': 'W', 'K': 'M',
    'M': 'K', 'B': 'V', 'D': 'H', 'H': 'D', 'V': 'B',
    'a': 't', 't': 'a', 'u': 'a', 'c': 'g', 'g': 'c', 'n': 'n',
    '-': '-',
  };
  return seq.split('').reverse().map(base => complement[base] || base).join('');
}

// ---------------------------------------------------------------------------
// Translation
// ---------------------------------------------------------------------------

/** NCBI translation table 1 — the Standard Code. `_` marks a stop codon. */
const STANDARD_CODE: Record<string, string> = {
  'ATA':'I', 'ATC':'I', 'ATT':'I', 'ATG':'M', 'ACA':'T', 'ACC':'T', 'ACG':'T', 'ACT':'T',
  'AAC':'N', 'AAT':'N', 'AAA':'K', 'AAG':'K', 'AGC':'S', 'AGT':'S', 'AGA':'R', 'AGG':'R',
  'CTA':'L', 'CTC':'L', 'CTG':'L', 'CTT':'L', 'CCA':'P', 'CCC':'P', 'CCG':'P', 'CCT':'P',
  'CAC':'H', 'CAT':'H', 'CAA':'Q', 'CAG':'Q', 'CGA':'R', 'CGC':'R', 'CGG':'R', 'CGT':'R',
  'GTA':'V', 'GTC':'V', 'GTG':'V', 'GTT':'V', 'GCA':'A', 'GCC':'A', 'GCG':'A', 'GCT':'A',
  'GAC':'D', 'GAT':'D', 'GAA':'E', 'GAG':'E', 'GGA':'G', 'GGC':'G', 'GGG':'G', 'GGT':'G',
  'TCA':'S', 'TCC':'S', 'TCG':'S', 'TCT':'S', 'TTC':'F', 'TTT':'F', 'TTA':'L', 'TTG':'L',
  'TAC':'Y', 'TAT':'Y', 'TAA':'_', 'TAG':'_', 'TGC':'C', 'TGT':'C', 'TGA':'_', 'TGG':'W',
};

/**
 * Per-table codon reassignments relative to {@link STANDARD_CODE}, keyed by NCBI
 * `transl_table` id. Only internal-codon differences are modeled (alternative
 * start codons are handled via the annotated `/translation` and `/codon_start`,
 * not here). Tables 1 and 11 use the standard code for internal codons.
 */
const CODE_OVERRIDES: Record<number, Record<string, string>> = {
  2: { 'AGA': '_', 'AGG': '_', 'ATA': 'M', 'TGA': 'W' }, // Vertebrate Mitochondrial
  3: { 'ATA': 'M', 'CTA': 'T', 'CTC': 'T', 'CTG': 'T', 'CTT': 'T', 'TGA': 'W' }, // Yeast Mitochondrial
  4: { 'TGA': 'W' }, // Mold/Protozoan/Coelenterate Mitochondrial + Mycoplasma/Spiroplasma
  5: { 'AGA': 'S', 'AGG': 'S', 'ATA': 'M', 'TGA': 'W' }, // Invertebrate Mitochondrial
};

const codeTable = (translTable: number): Record<string, string> => {
  const overrides = CODE_OVERRIDES[translTable];
  return overrides ? { ...STANDARD_CODE, ...overrides } : STANDARD_CODE;
};

/**
 * Translates a nucleotide string codon-by-codon.
 *
 * @param seq         Coding sequence (5'→3', translation-ready).
 * @param translTable NCBI genetic-code id (default 1, the Standard Code).
 *                    Unknown ids fall back to the standard code.
 * @returns Amino-acid string; `_` for stop codons, `?` for unresolvable codons.
 */
export const translateSequence = (seq: string, translTable = 1): string => {
  const table = codeTable(translTable);
  let protein = "";
  for (let i = 0; i < seq.length - 2; i += 3) {
    const tCodon = seq.substring(i, i + 3).toUpperCase();
    protein += table[tCodon] || '?';
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
 * The GenBank `/codon_start` qualifier (1, 2, or 3) is honored last, against
 * the fully-oriented coding sequence: the leading `codon_start - 1` bases (and
 * their `alignedIndices`) are dropped so translation begins in the right frame.
 * Absent or invalid values default to frame 1 (no offset).
 *
 * @param feature  A BioFeature-like object with strand, start, end, optional segments, and optional metadata (read for `codon_start`).
 * @param seq      The raw genome sequence (no gap characters expected, but '-' is tolerated).
 * @returns        `{ codingSeq, alignedIndices }` ready for codon-by-codon rendering.
 */
export function extractCodingSequence(
  feature: {
    strand: 1 | -1;
    start: number;
    end: number;
    segments?: { start: number; end: number; strand?: 1 | -1 }[];
    metadata?: Record<string, any>;
  },
  seq: string
): { codingSeq: string; alignedIndices: number[] } {
  const seqLen = seq.length;
  let segments: { start: number; end: number; strand?: 1 | -1 }[];

  if (feature.segments && feature.segments.length > 0) {
    segments = feature.segments;
  } else {
    segments = splitWrapAround(feature.start, feature.end, seqLen);
  }

  let codingSeq = '';
  const alignedIndices: number[] = [];

  // Mixed-strand (trans-spliced) features carry a per-segment strand: orient
  // each segment individually, in join order, with no whole-feature flip.
  const perSegmentStrand = segments.some(s => s.strand !== undefined);

  if (perSegmentStrand) {
    segments.forEach(seg => {
      let segSeq = '';
      const segIndices: number[] = [];
      for (let j = seg.start; j < seg.end; j++) {
        const char = seq[j];
        if (char && char !== '-') {
          segSeq += char;
          segIndices.push(j);
        }
      }
      if (seg.strand === -1) {
        segSeq = reverseComplement(segSeq);
        segIndices.reverse();
      }
      codingSeq += segSeq;
      alignedIndices.push(...segIndices);
    });
  } else {
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
  }

  const codonStart = parseInt(String(feature.metadata?.codon_start ?? '1'), 10);
  const offset = Number.isFinite(codonStart) && codonStart > 1 ? codonStart - 1 : 0;
  if (offset > 0) {
    codingSeq = codingSeq.slice(offset);
    alignedIndices.splice(0, offset);
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
 * @param codingSeq   Nucleotide string in translation-ready order (already
 *                    reverse-complemented for minus-strand features).
 * @param translTable NCBI genetic-code id (default 1). A codon that is a stop
 *                    under one code may be a sense codon under another (e.g.
 *                    TGA is Trp under the mitochondrial codes), so the table
 *                    must match the feature's `/transl_table`.
 */
export function detectEarlyStop(codingSeq: string, translTable = 1): boolean {
  const fullCodons = Math.floor(codingSeq.length / 3);
  // Examine every codon except the last one
  for (let i = 0; i < fullCodons - 1; i++) {
    if (translateSequence(codingSeq.substring(i * 3, i * 3 + 3), translTable) === '_') {
      return true;
    }
  }
  return false;
}

/**
 * Amino-acid string for a feature's coding sequence, preferring the authoritative
 * `/translation` qualifier over recomputation where present — one residue per
 * codon, aligned to the codons of `codingSeq` (hence to
 * {@link extractCodingSequence}'s `alignedIndices`).
 *
 * `/translation` is right where codon-by-codon recomputation is not: an
 * alternative start codon shows as its annotated initiator (Met) rather than the
 * literal residue, and `transl_except` recodings (selenocysteine `U`, pyrrolysine
 * `O`) are preserved. It omits the terminal stop and uses `X` for ambiguity, so
 * any codon at or beyond its length — the terminal stop, or a tail past a length
 * mismatch — falls back to the computed residue.
 */
export function translateFeature(
  feature: { translation?: string },
  codingSeq: string,
  translTable = 1,
): string {
  const computed = translateSequence(codingSeq, translTable);
  const stored = feature.translation;
  if (!stored) return computed;
  let protein = '';
  for (let i = 0; i < computed.length; i++) {
    protein += i < stored.length ? stored[i] : computed[i];
  }
  return protein;
}

/**
 * Whether a feature's protein carries an internal (early) stop — a "broken" CDS.
 *
 * Prefers the authoritative `/translation`: an annotated protein with no internal
 * stop is not broken, which avoids the false positive recomputation raises for a
 * `transl_except` recoding (e.g. a selenocysteine TGA read as a stop under the
 * base code). A trailing stop is tolerated as normal termination. Falls back to
 * {@link detectEarlyStop} on `codingSeq` when `/translation` is absent.
 */
export function isFeatureBroken(
  feature: { translation?: string },
  codingSeq: string,
  translTable = 1,
): boolean {
  const stored = feature.translation;
  if (stored) return /[_*]/.test(stored.slice(0, -1));
  return detectEarlyStop(codingSeq, translTable);
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
 * (mRNA, rRNA, tRNA, ncRNA…); everything else is DNA.
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

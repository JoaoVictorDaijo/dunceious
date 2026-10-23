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

import { NCBI_GENETIC_CODES } from './geneticCodes';
import { splitWrapAround } from './intervals';
import type { SeqRecord } from './types';

// ---------------------------------------------------------------------------
// Reverse complement
// ---------------------------------------------------------------------------

/**
 * Reverse-complements nucleotides, preserving case, IUPAC ambiguity and gaps.
 * Defaults to DNA output for existing callers; RNA output pairs A with U.
 */
export function reverseComplement(seq: string, moleculeType: SeqRecord['moleculeType'] = 'dna'): string {
  const complement: Record<string, string> = {
    'A': moleculeType === 'rna' ? 'U' : 'T', 'T': 'A', 'U': 'A', 'C': 'G', 'G': 'C', 'N': 'N',
    'R': 'Y', 'Y': 'R', 'S': 'S', 'W': 'W', 'K': 'M',
    'M': 'K', 'B': 'V', 'D': 'H', 'H': 'D', 'V': 'B',
    '-': '-',
  };
  return seq.split('').reverse().map(base => {
    const paired = complement[base.toUpperCase()];
    if (!paired) return base;
    return base === base.toLowerCase() ? paired.toLowerCase() : paired;
  }).join('');
}

/**
 * The alphabet a record's reverse complement is written in: RNA only when the
 * record contains U, or contains neither T nor U and is declared RNA. GenBank
 * writes RNA genomes with T under an RNA LOCUS line, and complementing those
 * into U would stop a T query from matching their reverse strand. Pass the
 * whole record sequence, not a slice, so every part of a record agrees.
 */
export function complementAlphabet(sequence: string, moleculeType?: SeqRecord['moleculeType']): 'dna' | 'rna' {
  if (/u/i.test(sequence)) return 'rna';
  if (/t/i.test(sequence)) return 'dna';
  return moleculeType === 'rna' ? 'rna' : 'dna';
}

// ---------------------------------------------------------------------------
// Translation
// ---------------------------------------------------------------------------

const CODON_BASES = 'TCAG';

/** Index of a codon in gc.prt's TCAG order, or -1 when it has a base outside T, C, A, G. */
const codonIndex = (codon: string): number => {
  let index = 0;
  for (const base of codon) {
    const value = CODON_BASES.indexOf(base);
    if (value < 0) return -1;
    index = index * 4 + value;
  }
  return index;
};

/** Whether `id` is one of the NCBI genetic codes (`/transl_table` values) in gc.prt. */
export const isNcbiGeneticCode = (id: number): boolean => Object.hasOwn(NCBI_GENETIC_CODES, id);

/**
 * The feature's `/transl_table` id: 1 (the Standard Code) when the qualifier is absent, as
 * INSDC defines, or NaN when its value is not an integer (an empty `/transl_table=` included).
 * A NaN or unknown id is not replaced by table 1, so {@link translateSequence} claims no
 * residue for it.
 */
export const featureTranslTable = (feature: { metadata?: Record<string, unknown> }): number => {
  const value = feature.metadata?.transl_table;
  if (value === undefined || value === null) return 1;
  const text = String(value).trim();
  return /^\d+$/.test(text) ? Number(text) : NaN;
};

/**
 * Translates DNA or RNA codon-by-codon with an NCBI genetic code (gc.prt; see
 * docs/standards/translation.md, TRANS-1); U is normalized only for table lookup.
 *
 * Each codon gets its own residue, independent of position: a codon that the code allows to
 * terminate in context (tables 27, 28 and 31) shows its sense residue, as gc.prt's `ncbieaa`
 * row does, and an alternative initiation codon shows its sense residue, not Met.
 * {@link translateFeature} reads the last such codon of a complete CDS as the stop.
 *
 * @param seq         Coding sequence (5'→3', translation-ready).
 * @param translTable NCBI genetic-code id (default 1, the Standard Code).
 * @returns Amino-acid string; `_` for stop codons, `?` for a codon with an ambiguous base and
 *          for every codon when `translTable` is not an NCBI genetic code.
 */
export const translateSequence = (seq: string, translTable = 1): string => {
  const code = NCBI_GENETIC_CODES[translTable];
  let protein = '';
  for (let i = 0; i < seq.length - 2; i += 3) {
    const index = code ? codonIndex(seq.substring(i, i + 3).toUpperCase().replace(/U/g, 'T')) : -1;
    const residue = index < 0 ? '?' : code.aminoAcids[index];
    protein += residue === '*' ? '_' : residue;
  }
  return protein;
};

/**
 * Extracts the coding sequence for a feature from the full genome sequence,
 * respecting multi-part (join) and circular wrap-around locations. Gap columns
 * are omitted from both outputs so aligned annotation spans do not alter codons.
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
 * @param seq      Raw or aligned genome sequence, in the feature's coordinate space.
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
 *                    must match the feature's `/transl_table`. Under an id that is
 *                    not an NCBI genetic code no codon is known, so none is a stop.
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
 * A complete CDS ends at a codon that terminates: where the code lets that codon be a stop or a
 * residue depending on context (gc.prt `sncbieaa` `*` with a residue in `ncbieaa`, tables 27, 28
 * and 31), the last codon reads as the stop. This matches Biopython 1.88 `translate(cds=True)`.
 * A partial feature (`<` or `>` in its location) or a length that is not whole codons is left
 * as translated, since its last codon need not be the end of the protein.
 */
function terminateLastCodon(
  feature: { locationString?: string },
  codingSeq: string,
  translTable: number,
  protein: string,
): string {
  const code = NCBI_GENETIC_CODES[translTable];
  if (!code || protein.length === 0 || codingSeq.length % 3 !== 0 || /[<>]/.test(feature.locationString ?? '')) {
    return protein;
  }
  const lastCodon = codingSeq.slice(-3).toUpperCase().replace(/U/g, 'T');
  const index = codonIndex(lastCodon);
  return index >= 0 && code.starts[index] === '*' ? `${protein.slice(0, -1)}_` : protein;
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
  feature: { translation?: string; locationString?: string },
  codingSeq: string,
  translTable = 1,
): string {
  const computed = terminateLastCodon(feature, codingSeq, translTable, translateSequence(codingSeq, translTable));
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
 *
 * The stored translation is trusted as-is: a stale/edited one that truncates
 * before a real internal stop is not flagged. Standard GenBank stays covered —
 * a real internal stop is written `*` (caught here) and pseudogenes omit
 * `/translation` (recomputed via the fallback).
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
/**
 * `getOriginalPos` for every column at once: `positions[col]` is the number of
 * residues before column `col`, so a residue column maps to its own biological
 * index and a gap column to the next residue's. One pass over the sequence,
 * for callers that would otherwise ask per codon.
 */
export const alignedToOriginalPositions = (alignedSeq: string): Uint32Array => {
  const positions = new Uint32Array(alignedSeq.length + 1);
  let count = 0;
  for (let i = 0; i < alignedSeq.length; i++) {
    positions[i] = count;
    if (alignedSeq[i] !== '-') count++;
  }
  positions[alignedSeq.length] = count;
  return positions;
};

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

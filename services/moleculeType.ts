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
 * Detects whether a sequence is a protein (amino-acid) sequence.
 *
 * Amino-acid sequences may contain D, E, F, H, I, K, L, M, P, Q, R, S, V, W, Y
 * which do not appear in a strict DNA/RNA alphabet (A, C, G, T/U, N, gap).
 * If any of those protein-only characters are present the sequence is classified
 * as a protein; otherwise it is treated as DNA.
 *
 * Note: sequences composed entirely of characters that overlap with nucleotides
 * (A, C, G, T, N) will be classified as DNA even if they are protein sequences.
 * In practice such sequences are extremely rare and are best loaded via GenBank
 * format where the molecule type is declared explicitly on the LOCUS line.
 */
export const detectMoleculeType = (seq: string): 'dna' | 'rna' | 'protein' => {
  const upper = seq.toUpperCase();
  // Characters found only in amino-acid sequences, not in DNA/RNA
  if (/[DEFHIKLMPQRSVWY]/.test(upper)) return 'protein';
  if (/U/.test(upper)) return 'rna';
  return 'dna';
};

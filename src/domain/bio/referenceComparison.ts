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
 * How one aligned residue relates to the reference residue in the same column.
 *
 * - `identical`: the same unambiguous residue, or a gap facing a gap.
 * - `substitution`: two different unambiguous residues.
 * - `gap`: a gap facing a residue, in either direction (an indel relative to the reference).
 * - `ambiguous`: either side is an ambiguity code or unknown symbol (N, R, X, ?…),
 *   so identity can be neither confirmed nor ruled out.
 */
export type ResidueComparison = 'identical' | 'substitution' | 'gap' | 'ambiguous';

export type ComparisonAlphabet = 'nucleotide' | 'protein';

const NUCLEOTIDES = new Set('ACGT');
// The 20 standard amino acids plus selenocysteine (U), pyrrolysine (O) and stop.
const AMINO_ACIDS = new Set('ACDEFGHIKLMNPQRSTVWYUO*');

const normalize = (residue: string, alphabet: ComparisonAlphabet): string => {
  const upper = residue.toUpperCase();
  // U and T are the same base read from RNA and DNA; for protein U is selenocysteine.
  return alphabet === 'nucleotide' && upper === 'U' ? 'T' : upper;
};

/**
 * Compares one aligned residue with the reference residue at the same column.
 * Case never matters. A missing residue (past the end of a shorter row) counts as a gap.
 */
export const compareToReference = (
  residue: string | undefined,
  referenceResidue: string | undefined,
  alphabet: ComparisonAlphabet,
): ResidueComparison => {
  const isGap = !residue || residue === '-';
  const referenceIsGap = !referenceResidue || referenceResidue === '-';
  if (isGap && referenceIsGap) return 'identical';
  if (isGap || referenceIsGap) return 'gap';

  const known = alphabet === 'nucleotide' ? NUCLEOTIDES : AMINO_ACIDS;
  const a = normalize(residue, alphabet);
  const b = normalize(referenceResidue, alphabet);
  if (!known.has(a) || !known.has(b)) return 'ambiguous';
  return a === b ? 'identical' : 'substitution';
};

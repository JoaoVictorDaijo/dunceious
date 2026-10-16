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

const IUPAC_MAP: Record<string, string> = {
  'A': 'A', 'C': 'C', 'G': 'G', 'T': 'T', 'U': 'U',
  'R': 'AG', 'Y': 'CTU', 'S': 'GC', 'W': 'ATU',
  'K': 'GTU', 'M': 'AC', 'B': 'CGTU', 'D': 'AGTU',
  'H': 'ACTU', 'V': 'ACG', 'N': 'ACGTU',
};

const PROTEIN_IUPAC_MAP: Record<string, string> = {
  // Standard 20 amino acids
  'A': 'A', 'C': 'C', 'D': 'D', 'E': 'E', 'F': 'F',
  'G': 'G', 'H': 'H', 'I': 'I', 'K': 'K', 'L': 'L',
  'M': 'M', 'N': 'N', 'P': 'P', 'Q': 'Q', 'R': 'R',
  'S': 'S', 'T': 'T', 'V': 'V', 'W': 'W', 'Y': 'Y',
  // IUPAC ambiguity codes
  'B': 'DN',   // Asp or Asn
  'Z': 'EQ',   // Glu or Gln
  'J': 'IL',   // Ile or Leu
  'X': 'ACDEFGHIKLMNPQRSTVWY',  // Any amino acid
  'U': 'U',      // Selenocysteine
  'O': 'O',      // Pyrrolysine
};

export type ResidueAlphabet = 'nucleotide' | 'protein';

/**
 * The uppercase text residues one query residue accepts: an IUPAC code expands
 * to its alternatives (`N` → `ACGTU`, protein `B` → `DN`); any other character
 * accepts only its own uppercase form. Literal T and U stay distinct.
 */
export function residueAlternatives(residue: string, alphabet: ResidueAlphabet = 'nucleotide'): string {
  const upper = residue.toUpperCase();
  const map = alphabet === 'protein' ? PROTEIN_IUPAC_MAP : IUPAC_MAP;
  return map[upper] ?? upper;
}

/**
 * Compiles a degenerate (IUPAC) query into a search regex.
 *
 * - An empty query returns a **never-match** regex (`/$.^/`).
 * - `moleculeType` selects the ambiguity map (see `residueAlternatives`).
 * - Residues are joined with `-*` so matches tolerate alignment gaps between
 *   them; literal gap runs require at least their query length. A sole `-`
 *   matches exactly one gap. The regex is **global + case-insensitive** (`gi`).
 */
export function degenerateToRegex(
  query: string,
  moleculeType: ResidueAlphabet = 'nucleotide',
): RegExp {
  if (!query) return /$.^/;
  if (query === '-') return /-/gi;
  const pattern: string[] = [];
  for (let index = 0; index < query.length;) {
    if (query[index] === '-') {
      const start = index;
      while (query[index] === '-') index++;
      // A single greedy run avoids redistributing identical gaps among
      // adjacent optional separators during failed matches.
      pattern.push(`-{${index - start},}`);
    } else {
      if (index > 0 && query[index - 1] !== '-') pattern.push('-*');
      const alternatives = residueAlternatives(query[index], moleculeType).replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
      pattern.push(alternatives.length > 1 ? `[${alternatives}]` : alternatives);
      index++;
    }
  }
  return new RegExp(pattern.join(''), 'gi');
}

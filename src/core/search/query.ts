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
  'R': '[AG]', 'Y': '[CT]', 'S': '[GC]', 'W': '[AT]',
  'K': '[GT]', 'M': '[AC]', 'B': '[CGT]', 'D': '[AGT]',
  'H': '[ACT]', 'V': '[ACG]', 'N': '[ACGT]',
};

const PROTEIN_IUPAC_MAP: Record<string, string> = {
  // Standard 20 amino acids
  'A': 'A', 'C': 'C', 'D': 'D', 'E': 'E', 'F': 'F',
  'G': 'G', 'H': 'H', 'I': 'I', 'K': 'K', 'L': 'L',
  'M': 'M', 'N': 'N', 'P': 'P', 'Q': 'Q', 'R': 'R',
  'S': 'S', 'T': 'T', 'V': 'V', 'W': 'W', 'Y': 'Y',
  // IUPAC ambiguity codes
  'B': '[DN]',   // Asp or Asn
  'Z': '[EQ]',   // Glu or Gln
  'J': '[IL]',   // Ile or Leu
  'X': '[ACDEFGHIKLMNPQRSTVWY]',  // Any amino acid
  'U': 'U',      // Selenocysteine
  'O': 'O',      // Pyrrolysine
};

export function degenerateToRegex(
  query: string,
  moleculeType: 'nucleotide' | 'protein' = 'nucleotide',
): RegExp {
  if (!query) return /$.^/;
  const map = moleculeType === 'protein' ? PROTEIN_IUPAC_MAP : IUPAC_MAP;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = escaped
    .toUpperCase()
    .split('')
    .map(char => map[char] || char)
    // Allow optional alignment gaps between residues
    .join('-*');
  return new RegExp(pattern, 'gi');
}

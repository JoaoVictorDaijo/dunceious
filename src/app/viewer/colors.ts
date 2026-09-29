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

export const getNucleotideColor = (char: string): string => {
  const c = char.toUpperCase();
  if (c === 'A') return '#22c55e'; // Emerald
  if (c === 'T' || c === 'U') return '#f43f5e'; // Rose (U is the RNA analogue of T)
  if (c === 'C') return '#3b82f6'; // Blue
  if (c === 'G') return '#eab308'; // Amber
  if (c === '-') return '#64748b'; // Slate (Gap)
  return '#94a3b8';
};

/**
 * Returns a display colour for a single-letter amino-acid code.
 *
 * Colour groupings follow chemical/biochemical property conventions
 * (similar to ClustalX / RasMol):
 *
 * - Hydrophobic non-polar (A V I L M P G):  amber tones
 * - Aromatic            (F W Y):            purple tones
 * - Positively charged  (K R):              blue
 * - Histidine           (H):                sky-blue (partly positive)
 * - Negatively charged  (D E):              red tones
 * - Polar uncharged     (S T N Q):          green tones
 * - Cysteine            (C):                yellow (unique reactivity)
 * - Stop / unknown      (* _):              red
 * - Gap                 (-):                slate
 */
export const getAminoAcidColor = (char: string): string => {
  const c = char.toUpperCase();
  switch (c) {
    // Hydrophobic non-polar
    case 'A': case 'V': case 'I': case 'L': case 'M':
      return '#f59e0b'; // Amber
    case 'G':
      return '#94a3b8'; // Slate – smallest / most flexible
    case 'P':
      return '#d97706'; // Dark amber – rigid ring
    // Aromatic
    case 'F': case 'W':
      return '#a855f7'; // Purple
    case 'Y':
      return '#8b5cf6'; // Violet – aromatic + hydroxyl
    // Positively charged
    case 'K': case 'R':
      return '#3b82f6'; // Blue
    case 'H':
      return '#60a5fa'; // Sky blue – weakly basic
    // Negatively charged
    case 'D':
      return '#ef4444'; // Red
    case 'E':
      return '#f97316'; // Orange-red
    // Polar uncharged
    case 'S': case 'T':
      return '#22c55e'; // Green
    case 'N': case 'Q':
      return '#10b981'; // Emerald
    // Unique
    case 'C':
      return '#eab308'; // Yellow – disulfide bridges
    // Stop codon
    case '*': case '_':
      return '#ef4444'; // Red
    // Gap
    case '-':
      return '#64748b'; // Slate
    default:
      return '#94a3b8'; // Unknown
  }
};

export const getFeatureColor = (type: string, customColors?: Record<string, string>): string => {
  if (customColors && customColors[type]) return customColors[type];
  
  const colors: Record<string, string> = {
    'gene': '#0ea5e9',      // Sky
    'CDS': '#8b5cf6',       // Violet
    'mRNA': '#10b981',      // Emerald
    'tRNA': '#ec4899',      // Pink
    'rRNA': '#f97316',      // Orange
    'exon': '#14b8a6',      // Teal
    'intron': '#475569',    // Slate Dark
    'promoter': '#fbbf24',  // Amber
    'regulatory': '#f43f5e',// Rose
    'misc_feature': '#a855f7', // Purple
    'mat_peptide': '#0891b2', // Cyan – cleaved mature-peptide product
    'stem_loop': '#a16207',   // Yellow-brown – RNA secondary structure
    'primer': '#ef4444',    // Red
    'origin': '#84cc16',    // Lime
    'quantitative_data': '#6366f1' // Indigo
  };
  return colors[type] || '#94a3b8';
};

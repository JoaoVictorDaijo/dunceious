/**
 * Parses the header section of a single-record GenBank line array.
 * Handles LOCUS (including the circular flag), multi-line DEFINITION, and
 * SOURCE fallback for the display name.
 */

export interface HeaderData {
  /** LOCUS identifier (accession) */
  id: string;
  /** Display name – derived from DEFINITION (truncated) or SOURCE */
  name: string;
  /** Full DEFINITION text (multi-line values are space-joined) */
  definition: string;
  /** True when the LOCUS line contains the word "circular" */
  isCircular: boolean;
  /** Molecule type derived from the LOCUS line unit field */
  moleculeType: 'dna' | 'rna' | 'protein';
}

const INDENT12 = ' '.repeat(12);

export function parseHeader(lines: string[]): HeaderData {
  let id = 'Unknown';
  let name = 'Unknown';
  let definition = '';
  let isCircular = false;
  let moleculeType: 'dna' | 'rna' | 'protein' = 'dna';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('LOCUS')) {
      const parts = line.split(/\s+/);
      id = parts[1] || 'Unknown';
      name = id;
      isCircular = line.toLowerCase().includes('circular');

      // Determine molecule type from the unit field on the LOCUS line.
      // Protein GenBank records use "aa" (amino acids); nucleotide records use "bp".
      // RNA molecule types contain "RNA" anywhere in the molecule-type token
      // (e.g. "mRNA", "rRNA", "tRNA", "ncRNA").
      const locusLower = line.toLowerCase();
      if (/\baa\b/.test(locusLower)) {
        moleculeType = 'protein';
      } else if (locusLower.includes('rna')) {
        moleculeType = 'rna';
      } else {
        moleculeType = 'dna';
      }
      continue;
    }

    if (line.startsWith('DEFINITION')) {
      // GenBank format: keyword in columns 1-12 (0-indexed 0-11), value from column 13
      definition = line.substring(12).trim();
      // Accumulate continuation lines (indented by 12 spaces)
      while (i + 1 < lines.length && lines[i + 1].startsWith(INDENT12)) {
        definition += ' ' + lines[++i].trim();
      }
      name = definition.length > 30 ? definition.substring(0, 27) + '...' : definition;
      continue;
    }

    if (line.startsWith('SOURCE')) {
      // GenBank format: SOURCE value also starts at column 13
      const source = line.substring(12).trim();
      // Only use SOURCE as name when DEFINITION was not found
      if (!definition) name = source;
      continue;
    }

    // Stop scanning at FEATURES or ORIGIN (data sections)
    if (line.startsWith('FEATURES') || line.startsWith('ORIGIN')) break;
  }

  return { id, name, definition, isCircular, moleculeType };
}

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
 * Parses the header section of a single-record GenBank line array.
 * Handles LOCUS (including the circular flag), multi-line DEFINITION, and
 * SOURCE fallback for the display name.
 */

import { classifyLocusMoleculeType } from '../../src/domain/bio';

export interface HeaderData {
  /** LOCUS identifier (accession) */
  id: string;
  /** ACCESSION (or VERSION fallback) */
  accession?: string;
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
  let accession: string | undefined;
  let isCircular = false;
  let moleculeType: 'dna' | 'rna' | 'protein' = 'dna';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('LOCUS')) {
      const parts = line.split(/\s+/);
      id = parts[1] || 'Unknown';
      name = id;
      isCircular = line.toLowerCase().includes('circular');

      moleculeType = classifyLocusMoleculeType(line);
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

    if (line.startsWith('ACCESSION')) {
      const values = line.substring(12).trim().split(/\s+/).filter(Boolean);
      if (values.length > 0) accession = values[0];
      continue;
    }

    if (!accession && line.startsWith('VERSION')) {
      const value = line.substring(12).trim().split(/\s+/)[0];
      if (value) accession = value;
      continue;
    }

    // Stop scanning at FEATURES or ORIGIN (data sections)
    if (line.startsWith('FEATURES') || line.startsWith('ORIGIN')) break;
  }

  return { id, name, definition, accession, isCircular, moleculeType };
}

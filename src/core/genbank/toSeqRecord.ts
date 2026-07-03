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
 * Assembles a SeqRecord from a single-record GenBank line array by
 * combining the outputs of the individual sub-parsers.
 */

import type { SeqRecord } from '@/src/domain/bio/types';
import { parseHeader } from './headerParser';
import { parseFeatures } from './featureParser';

/** Extracts the nucleotide sequence from the ORIGIN section */
function parseSequence(lines: string[]): string {
  let sequence = '';
  let inOrigin = false;

  for (const line of lines) {
    if (line.startsWith('ORIGIN')) {
      inOrigin = true;
      continue;
    }
    if (inOrigin) {
      if (line.trim().startsWith('//')) break;
      sequence += line.replace(/[^A-Za-z\-*]/g, '').toUpperCase();
    }
  }

  return sequence;
}

export function toSeqRecord(recordStr: string): SeqRecord {
  const lines = recordStr.split(/\r?\n/);

  const header = parseHeader(lines);
  const features = parseFeatures(lines);
  const sequence = parseSequence(lines);

  return {
    id: header.id,
    name: header.name,
    definition: header.definition,
    accession: header.accession ?? (header.id !== 'Unknown' ? header.id : undefined),
    moleculeType: header.moleculeType,
    sequence,
    features,
    isCircular: header.isCircular,
  };
}

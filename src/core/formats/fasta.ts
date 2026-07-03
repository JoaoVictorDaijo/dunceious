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

import type { BioFeature, SeqRecord } from '@/src/domain/bio/types';
import { detectMoleculeType } from '@/src/domain/bio';

/** Minimal FASTA record (subset of SeqRecord). */
export interface FastaRecord {
  id: string;
  name: string;
  sequence: string;
  features: BioFeature[];
  moleculeType: 'dna' | 'rna' | 'protein';
}

/**
 * Parses FASTA content into simple record objects.
 */
export const parseFasta = (content: string): FastaRecord[] => {
  const lines = content.split('\n');
  const results: FastaRecord[] = [];
  let currentId = '';
  let currentSeq = '';

  lines.forEach(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith('>')) {
      if (currentId) {
        results.push({ id: currentId, name: currentId, sequence: currentSeq, features: [], moleculeType: detectMoleculeType(currentSeq) });
      }
      currentId = trimmed.substring(1).split(/\s+/)[0];
      currentSeq = '';
    } else if (trimmed) {
      currentSeq += trimmed;
    }
  });

  if (currentId) {
    results.push({ id: currentId, name: currentId, sequence: currentSeq, features: [], moleculeType: detectMoleculeType(currentSeq) });
  }
  return results;
};

/**
 * Serializes records to FASTA, using `alignedSequence || sequence`.
 *
 * When both `start` and `end` are given, emits only the half-open slice
 * `[start, end)` (clamped to the sequence bounds) and annotates the header with
 * a `[Slice: start-end]` tag; otherwise the full sequence. Wrapped at 60
 * chars/line.
 */
export const exportToFasta = (records: SeqRecord[], start?: number, end?: number): string => {
  return records.map(r => {
    const seq = r.alignedSequence || r.sequence;
    const finalSeq = (start !== undefined && end !== undefined) 
      ? seq.substring(Math.max(0, start), Math.min(seq.length, end)) 
      : seq;
    const formattedSeq = finalSeq.match(/.{1,60}/g)?.join('\n') || '';
    return `>${r.id}${start !== undefined ? ` [Slice: ${start}-${end}]` : ''}\n${formattedSeq}`;
  }).join('\n\n');
};

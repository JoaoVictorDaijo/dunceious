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

import { processTransposition, calculateConsensus } from '../../src/domain/bio/index';
import { parseGenBank } from '@/src/core/genbank/index';
import type { BioFeature } from '../../src/domain/bio/types';
import type { BioWorkerRequest, BioWorkerResponse } from '../../src/workers/protocol';
import { parseFasta } from '../parsers/fasta';
import { parseBED, parseGFF3, parseBedGraph, type AnnotationTrack } from '../parsers/annotations';

/** Pure router for bio-worker messages: maps a request to its response. */
export function handleBioMessage(msg: BioWorkerRequest): BioWorkerResponse {
  if (msg.type === 'PROCESS_RECORDS') {
    try {
      const transposed = processTransposition(msg.records);
      const consensus = calculateConsensus(transposed);
      return { type: 'SUCCESS', records: transposed, consensus };
    } catch (error) {
      return { type: 'ERROR', error: (error as Error).message };
    }
  } else if (msg.type === 'PARSE_GENBANK') {
    try {
      return { type: 'PARSE_SUCCESS', records: parseGenBank(msg.content) };
    } catch (error) {
      return { type: 'ERROR', error: (error as Error).message };
    }
  } else if (msg.type === 'PARSE_FASTA') {
    try {
      return { type: 'FASTA_SUCCESS', alignedData: parseFasta(msg.content), asAlignment: msg.asAlignment };
    } catch (error) {
      return { type: 'ERROR', error: (error as Error).message };
    }
  } else {
    // PARSE_ANNOTATIONS
    try {
      const ext = msg.filename.split('.').pop()?.toLowerCase();
      let parsed: Record<string, AnnotationTrack[] | BioFeature[]>;
      if (ext === 'bed') parsed = parseBED(msg.content, msg.filename);
      else if (ext === 'gff' || ext === 'gff3') parsed = parseGFF3(msg.content);
      else if (ext === 'bedgraph') parsed = parseBedGraph(msg.content, msg.filename);
      else if (msg.content.includes('\t') && msg.content.split('\n')[0].split('\t').length === 9) {
        parsed = parseGFF3(msg.content);
      } else {
        parsed = parseBED(msg.content, msg.filename);
      }
      return { type: 'ANNOTATIONS_SUCCESS', annotations: parsed };
    } catch (error) {
      return { type: 'ERROR', error: (error as Error).message };
    }
  }
}

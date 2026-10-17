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

import { complementAlphabet, getNonGapSegments, mapUngappedRangeToAligned, removeGapsWithMap, reverseComplement } from '@/src/domain/bio';
import type { SearchableRecord, SearchResult } from '@/src/domain/bio/types';
import { hitColumns } from '../hitColumns';
import type { LocalEngine } from './engine';
import { localMetrics } from './metrics';
import { encodeResidues, scoreOf, type LocalScoring } from './scoring';

export interface LocalFilters { minIdentity: number | null; minQueryCoverage: number | null }
export interface LocalStreamOutcome {
  recordIndex: number;
  strand: 1 | -1;
  hits: SearchResult[];
  exhausted: boolean;
  hiddenByOverlap: number;
  hiddenByFilters: number;
  noPositive: boolean;
}

/** Greedy record-span exclusion follows matcher enumeration, before display filters.
 * The cutoff's whole score group is necessary for forward-coordinate tie ordering.
 */
export function runLocalStream(engine: LocalEngine, input: {
  query: string; queryCodes: Uint8Array; record: SearchableRecord; recordIndex: number;
  strand: 1 | -1; scoring: LocalScoring; moleculeType: SearchableRecord['moleculeType'];
  limit: number; filters: LocalFilters;
}, onProgress?: (fraction: number) => void): LocalStreamOutcome {
  const { query, queryCodes, record, recordIndex, strand, scoring, moleculeType, limit, filters } = input;
  if (!Number.isInteger(limit) || limit < 1) throw new Error('Local result limit must be positive');
  if (moleculeType === 'protein' && strand === -1) throw new Error('Protein search has no reverse stream');
  const seq = record.alignedSequence || record.sequence;
  const oriented = strand === 1 ? seq : reverseComplement(seq, complementAlphabet(seq, record.moleculeType ?? moleculeType));
  const { ungapped, map } = removeGapsWithMap(oriented);
  const encoded = encodeResidues(ungapped, scoring);
  if ('invalid' in encoded) throw new Error(`Unsupported record characters: ${encoded.invalid.join(', ')}`);
  const outcome: LocalStreamOutcome = { recordIndex, strand, hits: [], exhausted: false,
    hiddenByOverlap: 0, hiddenByFilters: 0, noPositive: true };
  const occupied: Array<{ start: number; end: number }> = [];
  let cutoff: number | null = null;
  const iterator = engine.enumerate(queryCodes, encoded.codes, scoring, onProgress);
  try {
    while (true) {
      const next = iterator.next();
      if (next.done) { outcome.exhausted = true; break; }
      const a = next.value;
      outcome.noPositive = false;
      if (cutoff !== null && a.score2 < cutoff) break;
      if (occupied.some(b => a.recordStart < b.end && b.start < a.recordEnd)) {
        outcome.hiddenByOverlap++;
        continue;
      }
      occupied.push({ start: a.recordStart, end: a.recordEnd });
      const columns = hitColumns({ cigar: a.cigar, query,
        span: ungapped.slice(a.recordStart, a.recordEnd), mode: 'local',
        alphabet: moleculeType === 'protein' ? 'protein' : 'nucleotide',
        matrixScore: (q, r) => scoreOf(scoring, q, r) });
      const local = localMetrics(columns, a, scoring, query.length);
      if ((filters.minIdentity !== null && 100 * local.identical / local.length < filters.minIdentity)
        || (filters.minQueryCoverage !== null && 100 * (local.queryEnd - local.queryStart) / local.queryLength < filters.minQueryCoverage)) {
        outcome.hiddenByFilters++;
        continue;
      }
      const range = mapUngappedRangeToAligned(map, a.recordStart, a.recordEnd);
      const start = strand === 1 ? range.start : seq.length - range.end;
      const end = strand === 1 ? range.end : seq.length - range.start;
      outcome.hits.push({ start, end, recordId: record.id, strand, cigar: a.cigar,
        local, sequence: seq.slice(start, end), segments: getNonGapSegments(seq, start, end) });
      if (outcome.hits.length === limit) cutoff = a.score2;
    }
  } finally { iterator.return?.(); }
  return outcome;
}

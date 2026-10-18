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
import type { LocalAlignment, LocalEngine } from './engine';
import { localMetrics } from './metrics';
import { encodeResidues, scoreOf, type LocalScoring } from './scoring';

export interface LocalFilters { minIdentity: number | null; minQueryCoverage: number | null }
export interface LocalStreamOutcome {
  recordIndex: number;
  strand: 1 | -1;
  hits: SearchResult[];
  exhausted: boolean;
  hiddenByOverlapScores: number[];
  hiddenByFilterScores: number[];
  noPositive: boolean;
  alignmentsEnumerated: number;
  firstScore2: number | null;
}
export interface LocalStreamInput {
  query: string; queryCodes: Uint8Array; record: SearchableRecord; recordIndex: number;
  strand: 1 | -1; scoring: LocalScoring; moleculeType: SearchableRecord['moleculeType'];
  limit: number; filters: LocalFilters;
}

/** EMBOSS 6.6.0 matcher exclusion precedes display filters; hidden spans stay occupied.
 * Each classified alignment yields so workers can receive bounds between engine steps.
 * Bootstrap ranking must compare streams without retaining their engine contexts.
 */
export function* iterateLocalStream(engine: LocalEngine, input: LocalStreamInput,
  onProgress?: (fraction: number) => void, getBoundScore2?: () => number | null,
  firstOnly = false): Generator<SearchResult | null, LocalStreamOutcome> {
  const { query, queryCodes, record, recordIndex, strand, scoring, moleculeType, limit, filters } = input;
  if (!Number.isInteger(limit) || limit < 1) throw new Error('Local result limit must be positive');
  if (moleculeType === 'protein' && strand === -1) throw new Error('Protein search has no reverse stream');
  const seq = record.alignedSequence || record.sequence;
  const oriented = strand === 1 ? seq : reverseComplement(seq, complementAlphabet(seq, record.moleculeType ?? moleculeType));
  const { ungapped, map } = removeGapsWithMap(oriented);
  const encoded = encodeResidues(ungapped, scoring);
  if ('invalid' in encoded) throw new Error(`Unsupported record characters: ${encoded.invalid.join(', ')}`);
  const outcome: LocalStreamOutcome = { recordIndex, strand, hits: [], exhausted: false,
    hiddenByOverlapScores: [], hiddenByFilterScores: [], noPositive: true, alignmentsEnumerated: 0,
    firstScore2: null };
  const occupied: Array<{ start: number; end: number }> = [];
  const iterator = engine.enumerate(queryCodes, encoded.codes, scoring, onProgress);
  const classify = (a: LocalAlignment): SearchResult | null => {
    if (occupied.some(b => a.recordStart < b.end && b.start < a.recordEnd)) {
      outcome.hiddenByOverlapScores.push(a.score2);
      return null;
    }
    occupied.push({ start: a.recordStart, end: a.recordEnd });
    const columns = hitColumns({ cigar: a.cigar, query,
      span: ungapped.slice(a.recordStart, a.recordEnd), mode: 'local',
      alphabet: moleculeType === 'protein' ? 'protein' : 'nucleotide',
      matrixScore: (q, r) => scoreOf(scoring, q, r) });
    const local = localMetrics(columns, a, scoring, query.length);
    if ((filters.minIdentity !== null && 100 * local.identical / local.length < filters.minIdentity)
      || (filters.minQueryCoverage !== null && 100 * (local.queryEnd - local.queryStart) / local.queryLength < filters.minQueryCoverage)) {
      outcome.hiddenByFilterScores.push(a.score2);
      return null;
    }
    const range = mapUngappedRangeToAligned(map, a.recordStart, a.recordEnd);
    const start = strand === 1 ? range.start : seq.length - range.end;
    const end = strand === 1 ? range.end : seq.length - range.start;
    return { start, end, recordId: record.id, strand, cigar: a.cigar,
      local, sequence: seq.slice(start, end), segments: getNonGapSegments(seq, start, end) };
  };
  try {
    while (true) {
      const next = iterator.next();
      if (next.done) { outcome.exhausted = true; break; }
      const a = next.value;
      outcome.noPositive = false;
      outcome.alignmentsEnumerated++;
      outcome.firstScore2 ??= a.score2;
      const bound = firstOnly ? null : getBoundScore2?.();
      if (bound != null && a.score2 < bound) break;
      const hit = classify(a);
      if (hit) outcome.hits.push(hit);
      yield hit;
      if (firstOnly) break;
    }
  } finally { iterator.return?.(); }
  return outcome;
}

export function runLocalStream(engine: LocalEngine, input: LocalStreamInput,
  onProgress?: (fraction: number) => void): LocalStreamOutcome {
  const iterator = iterateLocalStream(engine, input, onProgress);
  let next = iterator.next();
  while (!next.done) next = iterator.next();
  return next.value;
}

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

import type { SearchResult, SeqRecord } from '@/src/domain/bio/types';
import { complementAlphabet, reverseComplement } from '@/src/domain/bio/sequence';
import { hitColumns, type HitColumnClass } from '@/src/core/search/hitColumns';
import { pathQuery } from '@/src/core/search/editPath';
import { ungappedSpan } from '@/src/core/search/hitPaths';
import type { CompletedSearch } from '../logic/searchState';

export const SEARCH_QUERY_LANE_HEIGHT = 48;
export interface ForwardMark {
  column: number;
  cls: HitColumnClass;
  recordBase: string;
  queryLetter: string | null;
  recordAmbiguity: boolean;
}
export interface InsertionMark {
  afterColumn: number;
  bases: string;
  flankStart: number;
  flankEnd: number;
}
export interface HitMarks { marks: ForwardMark[]; insertions: InsertionMark[] }
const cache = new WeakMap<SearchResult, { record: SeqRecord; search: CompletedSearch; value: HitMarks }>();

/** SAM path offsets map to forward aligned columns; record gap columns consume no operation. */
export function hitMarks(result: SearchResult, record: SeqRecord, search: CompletedSearch): HitMarks {
  const cached = cache.get(result);
  if (cached?.record === record && cached.search === search) return cached.value;
  const seq = record.alignedSequence || record.sequence;
  const alphabet = complementAlphabet(seq, record.moleculeType);
  const positions: number[] = [];
  for (let i = result.start; i < result.end; i++) if (seq[i] !== '-') positions.push(i);
  const forwardPositions = [...positions];
  if (result.strand === -1) positions.reverse();
  const columns = hitColumns({ ...search, cigar: result.cigar,
    query: pathQuery(search.query, search.mode), span: ungappedSpan(result, record) });
  const marks: ForwardMark[] = [];
  const insertions: InsertionMark[] = [];
  let consumed = 0;
  for (const col of columns) {
    if (col.op === 'I') {
      const boundary = result.strand === 1 ? consumed : positions.length - consumed;
      const afterColumn = forwardPositions[boundary - 1] ?? result.start - 1;
      const base = result.strand === -1 ? reverseComplement(col.queryBase!, alphabet) : col.queryBase!;
      const previous = insertions.at(-1);
      if (previous?.afterColumn === afterColumn) previous.bases = result.strand === 1 ? previous.bases + base : base + previous.bases;
      else {
        const flankStart = seq.slice(0, afterColumn + 1).replace(/-/g, '').length;
        insertions.push({ afterColumn, bases: base, flankStart, flankEnd: flankStart + 1 });
      }
      continue;
    }
    const column = positions[consumed++];
    const recordBase = seq[column];
    const queryLetter = col.queryBase === null ? null : result.strand === 1 ? col.queryBase
      : col.cls === 'identical' ? recordBase : reverseComplement(col.queryBase, alphabet);
    marks.push({ column, cls: col.cls, recordBase, queryLetter, recordAmbiguity: col.recordAmbiguity });
  }
  marks.sort((a, b) => a.column - b.column);
  insertions.sort((a, b) => a.afterColumn - b.afterColumn);
  const value = { marks, insertions };
  cache.set(result, { record, search, value });
  return value;
}

function lowerBound<T>(items: T[], value: number, column: (item: T) => number): number {
  let lo = 0; let hi = items.length;
  while (lo < hi) { const mid = (lo + hi) >>> 1; if (column(items[mid]) < value) lo = mid + 1; else hi = mid; }
  return lo;
}

/** Cached paths are clipped before drawing; active marks take precedence over results order. */
export function visibleMarks(results: SearchResult[], active: SearchResult | undefined, record: SeqRecord,
  search: CompletedSearch, start: number, end: number): HitMarks {
  const marks = new Map<number, ForwardMark>();
  const insertions = new Map<number, InsertionMark>();
  const ordered = active && results.includes(active) ? [active, ...results.filter(r => r !== active)] : results;
  for (const result of ordered) {
    if (result.end < start || result.start > end) continue;
    const layout = hitMarks(result, record, search);
    const from = lowerBound(layout.marks, start, m => m.column);
    const to = lowerBound(layout.marks, end, m => m.column);
    for (const mark of layout.marks.slice(from, to)) if (!marks.has(mark.column)) marks.set(mark.column, mark);
    const insFrom = lowerBound(layout.insertions, start - 1, m => m.afterColumn);
    const insTo = lowerBound(layout.insertions, end, m => m.afterColumn);
    for (const insertion of layout.insertions.slice(insFrom, insTo)) {
      if (!insertions.has(insertion.afterColumn)) insertions.set(insertion.afterColumn, insertion);
    }
  }
  return { marks: [...marks.values()].sort((a, b) => a.column - b.column), insertions: [...insertions.values()] };
}

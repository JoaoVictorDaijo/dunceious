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

import { iupacPath } from './editPath';
import { degenerateToRegex } from '@/src/core/search/query';
import { reverseComplement, getNonGapSegments, complementAlphabet } from '@/src/domain/bio';
import type { SearchResult, SearchableRecord } from '@/src/domain/bio/types';

interface ExactCandidate {
  start: number;
  end: number;
  sequence: string;
  recordId: string;
  strand: 1 | -1;
  source: string;
  order: number;
}

function compareCandidates(a: ExactCandidate, b: ExactCandidate): number {
  return a.start - b.start || a.recordId.localeCompare(b.recordId) || a.order - b.order;
}

function siftDown(heap: ExactCandidate[]): void {
  let index = 0;
  while (index * 2 + 1 < heap.length) {
    let child = index * 2 + 1;
    if (child + 1 < heap.length && compareCandidates(heap[child + 1], heap[child]) > 0) child++;
    if (compareCandidates(heap[index], heap[child]) >= 0) break;
    [heap[index], heap[child]] = [heap[child], heap[index]];
    index = child;
  }
}

function createCollector(searchQuery: string, maxResults?: number) {
  const results: SearchResult[] = [];
  const capacity = maxResults !== undefined && Number.isFinite(maxResults) && maxResults >= 0
    ? Math.floor(maxResults)
    : null;
  const heap: ExactCandidate[] = [];
  let order = 0;

  const retain = (start: number, end: number, sequence: string, recordId: string, strand: 1 | -1, source: string) => {
    if (capacity === null) {
      results.push({
        cigar: iupacPath(searchQuery, sequence.replace(/-/g, '')),
        start, end, sequence, recordId, strand, segments: getNonGapSegments(source, start, end),
      });
      return;
    }
    const encounter = order++;
    if (heap.length === capacity) {
      const worst = heap[0];
      const comparison = start - worst.start || recordId.localeCompare(worst.recordId) || encounter - worst.order;
      if (comparison >= 0) return;
      worst.start = start;
      worst.end = end;
      worst.sequence = sequence;
      worst.recordId = recordId;
      worst.strand = strand;
      worst.source = source;
      worst.order = encounter;
      siftDown(heap);
      return;
    }
    heap.push({ start, end, sequence, recordId, strand, source, order: encounter });
    let index = heap.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (compareCandidates(heap[parent], heap[index]) >= 0) break;
      [heap[parent], heap[index]] = [heap[index], heap[parent]];
      index = parent;
    }
  };

  const finish = (): SearchResult[] => {
    if (capacity !== null) {
      return heap.sort(compareCandidates).map(hit => ({
        cigar: iupacPath(searchQuery, hit.sequence.replace(/-/g, '')),
        start: hit.start,
        end: hit.end,
        sequence: hit.sequence,
        recordId: hit.recordId,
        strand: hit.strand,
        segments: getNonGapSegments(hit.source, hit.start, hit.end),
      }));
    }
    if (maxResults === undefined) return results;
    results.sort((a, b) => a.start - b.start || a.recordId.localeCompare(b.recordId));
    return results.length > maxResults ? results.slice(0, maxResults) : results;
  };
  return { retain, finish };
}

/**
 * Omitting maxResults preserves scan order and all matches. Supplying it returns
 * the stable start/record-ID sort followed by the callers' conditional slice.
 * Finite nonnegative caps retain only the best candidates; segment arrays are
 * deferred until selection so dense matches do not allocate discarded results.
 */
export function runExactSearch(
  searchQuery: string,
  records: SearchableRecord[],
  isProtein: boolean,
  strand: 'fwd' | 'rev' | 'both',
  moleculeType?: SearchableRecord['moleculeType'],
  maxResults?: number,
): SearchResult[] {
  const regex = degenerateToRegex(searchQuery, isProtein ? 'protein' : 'nucleotide');
  if (maxResults !== undefined && maxResults >= 0 && maxResults < 1) return [];
  const { retain, finish } = createCollector(searchQuery, maxResults);

  for (const record of records) {
    const seq = record.alignedSequence || record.sequence;
    if (!seq) continue;
    const L = seq.length;

    // Forward search
    if (strand === 'both' || strand === 'fwd') {
      let match;
      regex.lastIndex = 0;
      while ((match = regex.exec(seq)) !== null) {
        const start = match.index;
        const end = match.index + match[0].length;
        retain(start, end, match[0], record.id, 1, seq);
        regex.lastIndex = match.index + 1;
      }
    }

    // Reverse search (nucleotide only — proteins have no reverse complement)
    if (!isProtein && (strand === 'both' || strand === 'rev')) {
      const rcSeq = reverseComplement(seq, complementAlphabet(seq, record.moleculeType ?? moleculeType));
      let match;
      regex.lastIndex = 0;
      while ((match = regex.exec(rcSeq)) !== null) {
        const rcStart = match.index;
        const rcEnd = match.index + match[0].length;
        const start = L - rcEnd;
        const end = L - rcStart;
        retain(start, end, match[0], record.id, -1, seq);
        regex.lastIndex = match.index + 1;
      }
    }
  }

  return finish();
}

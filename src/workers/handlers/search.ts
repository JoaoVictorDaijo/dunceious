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

import { reverseComplement, getNonGapSegments } from '@/src/domain/bio';
import type { SearchResult } from '@/src/domain/bio/types';
import type { SearchWorkerRequest, SearchWorkerResponse } from '@/src/workers/protocol';
import { runExactSearch } from '@/src/core/search/exact';
import { collectSeededFuzzyHits } from '@/src/core/search/fuzzy';

/** Pure search-worker body: maps a search request to its response. */
export function runSearch(request: SearchWorkerRequest): SearchWorkerResponse {
  const { requestId, searchQuery, records, mode, options, moleculeType } = request;
  const { minScore = 5, strand = 'both', maxResults = 100 } = options;
  const isProtein = moleculeType === 'protein';

  if (!searchQuery || searchQuery.length < 1) {
    return { requestId, results: [] };
  }

  try {
    let results: SearchResult[] = [];
    const queryUpper = searchQuery.toUpperCase();

    if (mode === 'fuzzy') {
      records.forEach((record) => {
        const seq = record.alignedSequence || record.sequence;
        const L = seq.length;
        if (strand === 'both' || strand === 'fwd') {
          results.push(...collectSeededFuzzyHits(queryUpper, seq, record.id, 1, minScore));
        }
        if (!isProtein && (strand === 'both' || strand === 'rev')) {
          const rcSeq = reverseComplement(seq);
          const revHits = collectSeededFuzzyHits(queryUpper, rcSeq, record.id, -1, minScore);
          revHits.forEach(hit => {
            const start = L - hit.end;
            const end = L - hit.start;
            results.push({
              ...hit,
              start,
              end,
              sequence: seq.substring(start, end),
              segments: getNonGapSegments(seq, start, end),
            });
          });
        }
      });
    } else {
      results = runExactSearch(searchQuery, records, isProtein, strand);
    }

    // Sort results
    if (mode === 'fuzzy') {
      results.sort((a, b) => (b.score || 0) - (a.score || 0) || a.start - b.start);
    } else {
      results.sort((a, b) => a.start - b.start || a.recordId.localeCompare(b.recordId));
    }

    // Apply maxResults limit
    if (results.length > maxResults) {
      results = results.slice(0, maxResults);
    }

    return { requestId, results };
  } catch (error) {
    return { requestId, error: String(error) };
  }
}

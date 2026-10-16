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

import type { SearchResult } from '@/src/domain/bio/types';
import type { SearchWorkerRequest, SearchWorkerResponse } from '@/src/workers/protocol';
import { runExactSearch } from '@/src/core/search/exact';
import { runFuzzySearch } from '@/src/core/search/fuzzy';

/** Pure search-worker body: maps a search request to its response. */
export function runSearch(request: SearchWorkerRequest): SearchWorkerResponse {
  const { requestId, searchQuery, records, mode, options, moleculeType } = request;
  const { minIdentity, strand = 'both', maxResults = 100 } = options;
  const isProtein = moleculeType === 'protein';

  if (!searchQuery || searchQuery.length < 1) {
    return { requestId, results: [] };
  }

  try {
    if (mode === 'fuzzy') {
      return { requestId, results: runFuzzySearch(searchQuery, records, isProtein, strand, moleculeType, minIdentity, maxResults) };
    }

    const results: SearchResult[] = runExactSearch(searchQuery, records, isProtein, strand, moleculeType);
    results.sort((a, b) => a.start - b.start || a.recordId.localeCompare(b.recordId));
    return { requestId, results: results.slice(0, maxResults) };
  } catch (error) {
    return { requestId, error: String(error) };
  }
}

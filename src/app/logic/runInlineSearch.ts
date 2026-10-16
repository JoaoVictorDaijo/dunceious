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
import type { SearchWorkerRequest } from '@/src/workers/protocol';
import { runExactSearch } from '@/src/core/search/exact';
import { runFuzzySearch } from '@/src/core/search/fuzzy';

/**
 * Synchronous search used for exact mode and whenever the Web Worker is
 * unavailable. Runs the same `runExactSearch` / `runFuzzySearch` cores as the
 * worker, so both paths return identical results.
 */
export function runInlineSearch(request: SearchWorkerRequest): SearchResult[] {
  const { searchQuery, records, mode, options, moleculeType } = request;
  const { minIdentity, strand = 'both', maxResults = 100 } = options;
  const isProtein = moleculeType === 'protein';

  if (!searchQuery || searchQuery.length < 1) return [];

  if (mode === 'fuzzy') {
    return runFuzzySearch(searchQuery, records, isProtein, strand, moleculeType, minIdentity, maxResults);
  }

  return runExactSearch(searchQuery, records, isProtein, strand, moleculeType, maxResults);
}

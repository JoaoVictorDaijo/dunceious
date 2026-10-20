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
 * The bundled showroom and direct tests can run synchronously over controlled
 * inputs. Main-app searches require a worker to keep the page responsive.
 * Result limits follow the core helpers without worker-specific normalization.
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

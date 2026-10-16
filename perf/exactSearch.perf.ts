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

import { describe, it, expect, vi } from 'vitest';
import * as bio from '../src/domain/bio';
import { runExactSearch } from '../src/core/search/exact';
import { bench } from './perfUtils';
import { runSearch } from '../src/workers/handlers/search';
import { runInlineSearch } from '../src/app/logic/runInlineSearch';

describe('exact search — dense bounded collection', () => {
  it.each([{ name: 'worker', search: runSearch }, { name: 'inline', search: runInlineSearch }])('caps exact materialization through the $name caller', ({ search }) => {
    const segments = vi.spyOn(bio, 'getNonGapSegments');
    try {
      const output = search({ searchQuery: 'AA', records: [{ id: 'dense', sequence: 'A'.repeat(10_000) }],
        mode: 'exact', options: { strand: 'fwd', maxResults: 10, minScore: 0 } });
      const hits = Array.isArray(output) ? output : 'results' in output ? output.results : [];
      expect(hits).toHaveLength(10);
      expect(segments).toHaveBeenCalledTimes(10);
    } finally {
      segments.mockRestore();
    }
  });

  it.each(['fwd', 'rev'] as const)('bounds materialized hits on the %s strand', (strand) => {
    const records = [{ id: 'dense', sequence: (strand === 'fwd' ? 'A' : 'T').repeat(50_000) }];
    const segments = vi.spyOn(bio, 'getNonGapSegments');
    try {
      const complete = runExactSearch('AA', records, false, strand, 'dna');
      expect(complete).toHaveLength(49_999);
      expect(segments).toHaveBeenCalledTimes(49_999);
      segments.mockClear();
      const capped = runExactSearch('AA', records, false, strand, 'dna', 100);
      expect(capped.map(hit => hit.start)).toEqual(Array.from({ length: 100 }, (_, index) => index));
      expect(segments).toHaveBeenCalledTimes(100);
    } finally {
      segments.mockRestore();
    }

    const baseline = bench(() => runExactSearch('AA', records, false, strand, 'dna')
      .sort((a, b) => a.start - b.start || a.recordId.localeCompare(b.recordId)).slice(0, 100),
    { warmup: 2, iterations: 5 });
    const bounded = bench(() => runExactSearch('AA', records, false, strand, 'dna', 100),
      { warmup: 2, iterations: 5 });
    console.log(JSON.stringify({ strand, scannedHits: 49_999, materializedBaseline: 49_999,
      materializedBounded: 100, baseline, bounded }));
  });
});

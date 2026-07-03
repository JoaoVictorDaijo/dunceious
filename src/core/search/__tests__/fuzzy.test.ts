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

import { describe, it, expect } from 'vitest';
import { collectSeededFuzzyHits } from '../fuzzy';

describe('collectSeededFuzzyHits', () => {
  it('returns [] for an all-gap sequence', () => {
    expect(collectSeededFuzzyHits('ACGT', '----', 'r1', 1, 5)).toEqual([]);
  });
  it('finds the query region in an ungapped sequence with the given recordId/strand', () => {
    const hits = collectSeededFuzzyHits('ACGTACGT', 'TTTACGTACGTTTT', 'r1', 1, 5);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every(h => h.recordId === 'r1' && h.strand === 1)).toBe(true);
  });
  it('uses the full-sequence Smith-Waterman fallback for a query shorter than the seed length', () => {
    const hits = collectSeededFuzzyHits('A', 'AAAA', 'r1', 1, 2);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every(h => h.recordId === 'r1' && h.strand === 1)).toBe(true);
  });
});

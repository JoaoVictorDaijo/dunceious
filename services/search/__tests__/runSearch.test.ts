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
import { runSearch } from '../runSearch';
import type { SearchWorkerRequest } from '../../../src/workers/protocol';

function req(overrides: Partial<SearchWorkerRequest> & Pick<SearchWorkerRequest, 'searchQuery' | 'records' | 'mode'>): SearchWorkerRequest {
  return {
    requestId: 1,
    options: { minScore: 5, strand: 'both', maxResults: 100 },
    ...overrides,
  } as SearchWorkerRequest;
}

describe('runSearch — guards & echo', () => {
  it('short-circuits an empty query to results:[] and echoes requestId', () => {
    const res = runSearch(req({ requestId: 7, searchQuery: '', records: [{ id: 'r1', sequence: 'ACGT' }], mode: 'exact' }));
    expect(res).toEqual({ requestId: 7, results: [] });
  });
});

describe('runSearch — exact mode', () => {
  it('finds a forward match with rebased coordinates', () => {
    const res = runSearch(req({
      searchQuery: 'ACG', records: [{ id: 'r1', sequence: 'TTACGTT' }],
      mode: 'exact', options: { minScore: 5, strand: 'fwd', maxResults: 100 },
    }));
    if ('error' in res) throw new Error(res.error);
    expect(res.results).toEqual([
      { start: 2, end: 5, sequence: 'ACG', recordId: 'r1', strand: 1, segments: [{ start: 2, end: 5 }] },
    ]);
  });

  it('finds a reverse-strand match remapped onto the forward coordinates', () => {
    const res = runSearch(req({
      searchQuery: 'ACG', records: [{ id: 'r1', sequence: 'TTACGTT' }],
      mode: 'exact', options: { minScore: 5, strand: 'rev', maxResults: 100 },
    }));
    if ('error' in res) throw new Error(res.error);
    expect(res.results).toHaveLength(1);
    expect(res.results[0]).toMatchObject({ strand: -1, start: 3, end: 6 });
  });

  it('skips the reverse strand for a protein molecule type', () => {
    const res = runSearch(req({
      searchQuery: 'ACG', records: [{ id: 'r1', sequence: 'TTACGTT' }],
      mode: 'exact', moleculeType: 'protein',
      options: { minScore: 5, strand: 'both', maxResults: 100 },
    }));
    if ('error' in res) throw new Error(res.error);
    expect(res.results.every(r => r.strand === 1)).toBe(true);
  });

  it('sorts by start then recordId and applies maxResults', () => {
    const res = runSearch(req({
      searchQuery: 'A', records: [{ id: 'r1', sequence: 'AAA' }],
      mode: 'exact', options: { minScore: 5, strand: 'fwd', maxResults: 2 },
    }));
    if ('error' in res) throw new Error(res.error);
    expect(res.results).toHaveLength(2);
    expect(res.results[0].start).toBeLessThanOrEqual(res.results[1].start);
  });
});

describe('runSearch — fuzzy mode', () => {
  it('returns score-bearing hits sorted by score descending', () => {
    const res = runSearch(req({
      searchQuery: 'ACGTACGT',
      records: [{ id: 'r1', sequence: 'TTTACGTACGTTTT' }],
      mode: 'fuzzy', options: { minScore: 5, strand: 'fwd', maxResults: 100 },
    }));
    if ('error' in res) throw new Error(res.error);
    expect(res.results.length).toBeGreaterThan(0);
    expect(res.results[0].score).toBeGreaterThanOrEqual(res.results[res.results.length - 1].score ?? 0);
    expect(res.results[0].recordId).toBe('r1');
  });
});

describe('runSearch — reverse fuzzy & exact tiebreak', () => {
  it('finds fuzzy hits on the reverse strand (strand -1)', () => {
    // 'TTTACGTACGTTTT' reverse-complemented contains 'ACGTACGT'.
    const res = runSearch(req({
      searchQuery: 'ACGTACGT',
      records: [{ id: 'r1', sequence: 'TTTACGTACGTTTT' }],
      mode: 'fuzzy', options: { minScore: 5, strand: 'rev', maxResults: 100 },
    }));
    if ('error' in res) throw new Error(res.error);
    expect(res.results.some(r => r.strand === -1)).toBe(true);
    res.results.forEach(r => expect(r.start).toBeLessThan(r.end));
  });
  it('breaks equal-start exact ties by recordId ascending', () => {
    const res = runSearch(req({
      searchQuery: 'AAA',
      records: [{ id: 'r2', sequence: 'AAA' }, { id: 'r1', sequence: 'AAA' }],
      mode: 'exact', options: { minScore: 5, strand: 'fwd', maxResults: 100 },
    }));
    if ('error' in res) throw new Error(res.error);
    const atZero = res.results.filter(r => r.start === 0);
    expect(atZero.map(r => r.recordId)).toEqual(['r1', 'r2']);
  });
});

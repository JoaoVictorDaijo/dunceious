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

import { describe, expect, it } from 'vitest';
import type { SearchWorkerRequest } from '@/src/workers/protocol';
import { completedSearchFor } from '../searchState';

function request(overrides: Partial<SearchWorkerRequest> = {}): SearchWorkerRequest {
  return {
    searchQuery: 'ACGU',
    records: [],
    mode: 'exact',
    moleculeType: 'dna',
    options: { minIdentity: 80, strand: 'both', maxResults: 100 },
    ...overrides,
  };
}

describe('completedSearchFor', () => {
  it('exact maps to iupac', () => {
    expect(completedSearchFor(request(), false)).toStrictEqual({
      query: 'ACGU',
      mode: 'iupac',
      alphabet: 'nucleotide',
      options: { minIdentity: 80, strand: 'both', maxResults: 100 },
    });
  });

  it('fuzzy without local maps to whole', () => {
    expect(completedSearchFor(request({
      searchQuery: 'MKW', mode: 'fuzzy', moleculeType: 'protein',
      options: { fuzzyMethod: 'local', minIdentity: 75, strand: 'fwd', maxResults: 20 },
    }), false)).toStrictEqual({
      query: 'MKW',
      mode: 'whole',
      alphabet: 'protein',
      options: { fuzzyMethod: 'local', minIdentity: 75, strand: 'fwd', maxResults: 20 },
    });
  });

  it('local carries matrixScore', () => {
    const matrixScore = (q: string, r: string) => q === r ? 5 : -4;

    expect(completedSearchFor(request({ mode: 'fuzzy', moleculeType: 'rna' }), true, matrixScore))
      .toStrictEqual({
        query: 'ACGU',
        mode: 'local',
        alphabet: 'nucleotide',
        options: { minIdentity: 80, strand: 'both', maxResults: 100 },
        matrixScore,
      });
  });

  it('options are copied, not shared', () => {
    const input = request({ moleculeType: undefined });
    const completed = completedSearchFor(input, false);

    input.options.minIdentity = 95;
    input.options.strand = 'rev';
    input.options.maxResults = 1;

    expect(completed.options).not.toBe(input.options);
    expect(completed.options).toStrictEqual({ minIdentity: 80, strand: 'both', maxResults: 100 });
    expect(completed.alphabet).toBe('nucleotide');
  });
});

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
import { runInlineSearch } from '../runInlineSearch';
import type { SearchWorkerRequest } from '@/src/workers/protocol';

function req(
  overrides: Partial<SearchWorkerRequest> & Pick<SearchWorkerRequest, 'searchQuery' | 'records' | 'mode'>,
): SearchWorkerRequest {
  return {
    requestId: 1,
    options: { minIdentity: 80, strand: 'both', maxResults: 100 },
    ...overrides,
  } as SearchWorkerRequest;
}

describe('runInlineSearch — guards', () => {
  it('returns [] for an empty query', () => {
    expect(runInlineSearch(req({ searchQuery: '', records: [{ id: 'r1', sequence: 'ACGT' }], mode: 'exact' }))).toEqual([]);
  });
});

describe('runInlineSearch — exact mode (delegates to runExactSearch)', () => {
  it('finds a forward match with pinned coordinates', () => {
    expect(runInlineSearch(req({
      searchQuery: 'ACG', records: [{ id: 'r1', sequence: 'TTACGTT' }],
      mode: 'exact', options: { minIdentity: 80, strand: 'fwd', maxResults: 100 },
    }))).toEqual([
      { start: 2, end: 5, sequence: 'ACG', recordId: 'r1', strand: 1, segments: [{ start: 2, end: 5 }] },
    ]);
  });

  it('remaps a reverse exact match onto forward coordinates', () => {
    expect(runInlineSearch(req({
      searchQuery: 'ACG', records: [{ id: 'r1', sequence: 'TTACGTT' }],
      mode: 'exact', options: { minIdentity: 80, strand: 'rev', maxResults: 100 },
    }))).toEqual([
      { start: 3, end: 6, sequence: 'ACG', recordId: 'r1', strand: -1, segments: [{ start: 3, end: 6 }] },
    ]);
  });

  it('sorts by start then recordId and applies maxResults', () => {
    const out = runInlineSearch(req({
      searchQuery: 'AA', records: [{ id: 'r1', sequence: 'AAAA' }],
      mode: 'exact', options: { minIdentity: 80, strand: 'fwd', maxResults: 2 },
    }));
    expect(out).toEqual([
      { start: 0, end: 2, sequence: 'AA', recordId: 'r1', strand: 1, segments: [{ start: 0, end: 2 }] },
      { start: 1, end: 3, sequence: 'AA', recordId: 'r1', strand: 1, segments: [{ start: 1, end: 3 }] },
    ]);
  });

  it('breaks recordId ties ascending when start positions tie', () => {
    const out = runInlineSearch(req({
      searchQuery: 'AAA', records: [{ id: 'r2', sequence: 'AAA' }, { id: 'r1', sequence: 'AAA' }],
      mode: 'exact', options: { minIdentity: 80, strand: 'fwd', maxResults: 100 },
    }));
    expect(out.map(r => r.recordId)).toEqual(['r1', 'r2']);
    expect(out.every(r => r.start === 0)).toBe(true);
  });

  it('scans alignedSequence when present, splitting segments across a gap', () => {
    // executeSearchInline derives seq from alignedSequence via typeof-guard; the
    // IUPAC regex for 'ACG' matches the gapped run 'A-CG' → segments split.
    const out = runInlineSearch(req({
      searchQuery: 'ACG', records: [{ id: 'r1', sequence: 'AAA', alignedSequence: 'A-CGTT' }],
      mode: 'exact', options: { minIdentity: 80, strand: 'fwd', maxResults: 100 },
    }));
    expect(out).toEqual([
      { start: 0, end: 4, sequence: 'A-CG', recordId: 'r1', strand: 1, segments: [{ start: 0, end: 1 }, { start: 2, end: 4 }] },
    ]);
  });
});

describe('runInlineSearch — fuzzy mode', () => {
  it('reports the occurrence with its edits and identity', () => {
    const out = runInlineSearch(req({
      searchQuery: 'ACGTACGT', records: [{ id: 'r1', sequence: 'TTTACGTACGTTTT' }],
      mode: 'fuzzy', options: { minIdentity: 80, strand: 'fwd', maxResults: 100 },
    }));
    expect(out).toEqual([{
      recordId: 'r1', strand: 1, start: 3, end: 11, sequence: 'ACGTACGT',
      edits: 0, identity: 100, segments: [{ start: 3, end: 11 }],
    }]);
  });

  it('finds fuzzy hits on the reverse strand', () => {
    const out = runInlineSearch(req({
      searchQuery: 'ACGTACGT', records: [{ id: 'r1', sequence: 'TTTACGTACGTTTT' }],
      mode: 'fuzzy', options: { minIdentity: 80, strand: 'rev', maxResults: 100 },
    }));
    expect(out.some(r => r.strand === -1)).toBe(true);
    out.forEach(r => expect(r.start).toBeLessThan(r.end));
  });

  it('does not crash on an all-gap alignedSequence (both strands)', () => {
    // Both strands are empty once gaps are removed, so nothing is searched.
    const out = runInlineSearch(req({
      searchQuery: 'ACGT', records: [{ id: 'r1', sequence: 'ACGT', alignedSequence: '----' }],
      mode: 'fuzzy', options: { minIdentity: 80, strand: 'both', maxResults: 100 },
    }));
    expect(Array.isArray(out)).toBe(true);
    expect(out).toEqual([]);
  });
});

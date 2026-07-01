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
import { runExactSearch } from '../exact';

describe('runExactSearch — forward strand', () => {
  it('finds a forward match with rebased coordinates and non-gap segments', () => {
    expect(runExactSearch('ACG', [{ id: 'r1', sequence: 'TTACGTT' }], false, 'fwd')).toEqual([
      { start: 2, end: 5, sequence: 'ACG', recordId: 'r1', strand: 1, segments: [{ start: 2, end: 5 }] },
    ]);
  });

  it('finds overlapping matches via lastIndex = index + 1', () => {
    const out = runExactSearch('AA', [{ id: 'r1', sequence: 'AAAA' }], false, 'fwd');
    expect(out.map(r => r.start)).toEqual([0, 1, 2]);
    expect(out.every(r => r.strand === 1 && r.sequence === 'AA')).toBe(true);
  });
});

describe('runExactSearch — reverse strand remap', () => {
  it('remaps a reverse match onto forward coordinates (start = L - rcEnd)', () => {
    const out = runExactSearch('ACG', [{ id: 'r1', sequence: 'TTACGTT' }], false, 'rev');
    expect(out).toEqual([
      { start: 3, end: 6, sequence: 'ACG', recordId: 'r1', strand: -1, segments: [{ start: 3, end: 6 }] },
    ]);
  });

  it('skips the reverse strand for a protein molecule (isProtein=true, strand=both)', () => {
    const out = runExactSearch('M', [{ id: 'r1', sequence: 'MKMK' }], true, 'both');
    expect(out.map(r => ({ start: r.start, strand: r.strand }))).toEqual([
      { start: 0, strand: 1 },
      { start: 2, strand: 1 },
    ]);
  });
});

describe('runExactSearch — gapped alignedSequence & empty guard', () => {
  it('matches across a gap because degenerateToRegex emits A-*C-*G, splitting segments', () => {
    // degenerateToRegex('ACG','nucleotide').source === 'A-*C-*G' — it deliberately
    // allows gap runs between residues, so 'A-CG' inside 'A-CGTT' matches. The raw
    // matched substring is 'A-CG'; getNonGapSegments splits it at the gap.
    const out = runExactSearch('ACG', [{ id: 'r1', sequence: 'AAA', alignedSequence: 'A-CGTT' }], false, 'fwd');
    expect(out).toEqual([
      { start: 0, end: 4, sequence: 'A-CG', recordId: 'r1', strand: 1, segments: [{ start: 0, end: 1 }, { start: 2, end: 4 }] },
    ]);
  });

  it('skips a record whose derived seq is empty', () => {
    expect(runExactSearch('A', [{ id: 'r1', sequence: '' }], false, 'fwd')).toEqual([]);
  });
});

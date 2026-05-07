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
import {
  degenerateToRegex,
  reverseComplement,
  getNonGapSegments,
  smithWaterman,
} from '../searchLogic';

// ---------------------------------------------------------------------------
// reverseComplement
// ---------------------------------------------------------------------------

describe('reverseComplement', () => {
  it('reverse-complements a simple DNA sequence', () => {
    expect(reverseComplement('ATCG')).toBe('CGAT');
  });

  it('handles N (any base)', () => {
    expect(reverseComplement('N')).toBe('N');
  });

  it('handles gap characters', () => {
    // 'A-T' reversed = ['T','-','A']; complement: T→A, -→-, A→T → 'A-T'
    // (self-complementary palindrome with gap)
    expect(reverseComplement('A-T')).toBe('A-T');
  });

  it('is its own inverse', () => {
    const seq = 'AATTCCGG';
    expect(reverseComplement(reverseComplement(seq))).toBe(seq);
  });
});

// ---------------------------------------------------------------------------
// degenerateToRegex (exact / IUPAC mode)
// ---------------------------------------------------------------------------

describe('degenerateToRegex', () => {
  it('matches an exact DNA query', () => {
    const re = degenerateToRegex('ACGT');
    expect(re.test('ACGT')).toBe(true);
    expect(re.test('TTTT')).toBe(false);
  });

  it('expands IUPAC N to match any base', () => {
    // degenerateToRegex uses 'gi' flag; re-create the regex for each test
    // to avoid lastIndex accumulation from the global flag.
    expect(degenerateToRegex('N').test('A')).toBe(true);
    expect(degenerateToRegex('N').test('C')).toBe(true);
    expect(degenerateToRegex('N').test('G')).toBe(true);
    expect(degenerateToRegex('N').test('T')).toBe(true);
  });

  it('expands IUPAC R to match A or G', () => {
    expect(degenerateToRegex('R').test('A')).toBe(true);
    expect(degenerateToRegex('R').test('G')).toBe(true);
    expect(degenerateToRegex('R').test('C')).toBe(false);
  });

  it('matches consecutive IUPAC symbols without separators', () => {
    expect(degenerateToRegex('RY').test('AC')).toBe(true);
    expect(degenerateToRegex('RY').test('GT')).toBe(true);
    expect(degenerateToRegex('RY').test('AG')).toBe(false);
  });

  it('returns a non-matching regex for an empty query', () => {
    const re = degenerateToRegex('');
    expect(re.test('ACGT')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getNonGapSegments
// ---------------------------------------------------------------------------

describe('getNonGapSegments', () => {
  it('returns one segment for a gap-free region', () => {
    expect(getNonGapSegments('ACGTACGT', 0, 4)).toEqual([{ start: 0, end: 4 }]);
  });

  it('splits around internal gaps', () => {
    // 'AC--GT': positions 0-6; slice [0,6) → [0,2) and [4,6)
    expect(getNonGapSegments('AC--GT', 0, 6)).toEqual([
      { start: 0, end: 2 },
      { start: 4, end: 6 },
    ]);
  });

  it('returns empty array when the slice is all gaps', () => {
    expect(getNonGapSegments('----', 0, 4)).toEqual([]);
  });

  it('respects the start offset', () => {
    // 'XXXXAC--GT'; slice [4,10) → segments with start offset 4
    expect(getNonGapSegments('XXXXAC--GT', 4, 10)).toEqual([
      { start: 4, end: 6 },
      { start: 8, end: 10 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Exact search – via degenerateToRegex  (simulating worker exact mode)
// ---------------------------------------------------------------------------

describe('exact sequence search (degenerateToRegex)', () => {
  const TARGET = 'AAATTTCCCGGG';

  it('finds an exact substring match', () => {
    const re = degenerateToRegex('TTT');
    re.lastIndex = 0;
    const m = re.exec(TARGET);
    expect(m).not.toBeNull();
    expect(m!.index).toBe(3);
  });

  it('finds no match when query is absent', () => {
    const re = degenerateToRegex('AAAA');
    re.lastIndex = 0;
    expect(re.exec(TARGET)).toBeNull();
  });

  it('finds multiple non-overlapping matches', () => {
    const seq = 'ATGATG';
    const re = degenerateToRegex('ATG');
    const matches: number[] = [];
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(seq)) !== null) {
      matches.push(m.index);
      re.lastIndex = m.index + 1;
    }
    expect(matches).toEqual([0, 3]);
  });

  it('finds a match on the reverse complement strand', () => {
    // 'CCC' in forward → 'GGG' is its RC; search for GGG on RC of TARGET
    const rc = reverseComplement(TARGET);
    const re = degenerateToRegex('GGG');
    re.lastIndex = 0;
    const m = re.exec(rc);
    expect(m).not.toBeNull();
  });

  it('matches through alignment gaps', () => {
    const re = degenerateToRegex('ACGT');
    re.lastIndex = 0;
    const m = re.exec('AAA A-C--G---T TTT'.replace(/\s/g, ''));
    expect(m).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Fuzzy search – smithWaterman smoke tests
// ---------------------------------------------------------------------------

describe('smithWaterman – fuzzy search smoke tests', () => {
  it('returns empty array when query or target is empty', () => {
    expect(smithWaterman('', 'ACGT')).toHaveLength(0);
    expect(smithWaterman('ACG', '')).toHaveLength(0);
  });

  it('finds an exact local alignment with default scoring', () => {
    const results = smithWaterman('ACGT', 'NNNACGTNNN', 2, -1, -3, -1, 4);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].sequence).toBe('ACGT');
  });

  it('returns empty array when score is below minScore', () => {
    // Very high minScore ensures nothing qualifies
    const results = smithWaterman('ACGT', 'ACGT', 2, -1, -3, -1, 1000);
    expect(results).toHaveLength(0);
  });

  it('alignment start < end', () => {
    const results = smithWaterman('ACGT', 'NNNACGTNNN', 2, -1, -3, -1, 4);
    results.forEach(r => expect(r.start).toBeLessThan(r.end));
  });

  it('handles a query with one mismatch (fuzzy tolerance)', () => {
    // Query 'ACGT', target 'ACCT' — one mismatch but should still align
    const results = smithWaterman('ACGT', 'ACCT', 2, -1, -3, -1, 3);
    expect(results.length).toBeGreaterThan(0);
  });

  it('returns a valid alignment when using non-default gap penalties', () => {
    const results = smithWaterman('ACGTAC', 'TTACG--TACAA'.replace(/-/g, ''), 2, -1, -4, -2, 4);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].start).toBeLessThan(results[0].end);
    expect(results[0].score).toBeGreaterThanOrEqual(4);
  });

  it('returns a score spread (not only global maxima)', () => {
    const results = smithWaterman('ACGT', 'ACGTNNNACGA', 2, -1, -3, -1, 4);
    expect(results.length).toBeGreaterThan(1);

    const scores = results.map(r => r.score);
    const max = Math.max(...scores);
    const min = Math.min(...scores);
    expect(max).toBeGreaterThan(min);
  });
});

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
  removeGapsWithMap,
  mapUngappedRangeToAligned,
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
    // 'ACGT' sits at target[3..7); 4 matches × 2 = score 8.
    expect(results[0]).toMatchObject({ start: 3, end: 7, score: 8, sequence: 'ACGT' });
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

// ---------------------------------------------------------------------------
// removeGapsWithMap
// ---------------------------------------------------------------------------

describe('removeGapsWithMap', () => {
  it('returns the sequence unchanged with an identity map when gap-free', () => {
    expect(removeGapsWithMap('ACGT')).toEqual({ ungapped: 'ACGT', map: [0, 1, 2, 3] });
  });

  it('strips gaps and maps each kept base to its original index', () => {
    // 'A-C--G' → kept A(0) C(2) G(5)
    expect(removeGapsWithMap('A-C--G')).toEqual({ ungapped: 'ACG', map: [0, 2, 5] });
  });

  it('returns empty ungapped and empty map for an all-gap sequence', () => {
    expect(removeGapsWithMap('----')).toEqual({ ungapped: '', map: [] });
  });

  it('returns empty results for an empty string', () => {
    expect(removeGapsWithMap('')).toEqual({ ungapped: '', map: [] });
  });
});

// ---------------------------------------------------------------------------
// mapUngappedRangeToAligned
// ---------------------------------------------------------------------------

describe('mapUngappedRangeToAligned', () => {
  // ungapped indices 0,1,2,3 → aligned positions 0,2,4,6
  const map = [0, 2, 4, 6];

  it('returns {0,0} for an empty map', () => {
    expect(mapUngappedRangeToAligned([], 0, 4)).toEqual({ start: 0, end: 0 });
  });

  it('maps an in-range half-open ungapped range to aligned coordinates', () => {
    // start=1,end=3 → alignedStart=map[1]=2, alignedEnd=map[2]+1=5
    expect(mapUngappedRangeToAligned(map, 1, 3)).toEqual({ start: 2, end: 5 });
  });

  it('clamps a negative start up to 0', () => {
    // start=-5→0, end=2 → alignedStart=map[0]=0, alignedEnd=map[1]+1=3
    expect(mapUngappedRangeToAligned(map, -5, 2)).toEqual({ start: 0, end: 3 });
  });

  it('clamps an out-of-range start/end to the last index', () => {
    // start=10→3, end=20→4 → alignedStart=map[3]=6, alignedEnd=map[3]+1=7
    expect(mapUngappedRangeToAligned(map, 10, 20)).toEqual({ start: 6, end: 7 });
  });

  it('handles a single-element map', () => {
    expect(mapUngappedRangeToAligned([5], 0, 1)).toEqual({ start: 5, end: 6 });
  });

  it('keeps a non-empty aligned span for a degenerate range (start >= end)', () => {
    // safeEndExclusive is floored to safeStart+1, so an inverted/zero-width
    // request still yields a single-position aligned span.
    expect(mapUngappedRangeToAligned(map, 2, 2)).toEqual({ start: 4, end: 5 });
    expect(mapUngappedRangeToAligned(map, 3, 1)).toEqual({ start: 6, end: 7 });
  });
});

// ---------------------------------------------------------------------------
// smithWaterman – gapped traceback (exercises Iq / It gap states)
// ---------------------------------------------------------------------------

describe('smithWaterman – gapped alignments', () => {
  it('aligns across an insertion in the target (It gap state)', () => {
    // 'ACGTACGT' vs 'ACGTTTACGT': the optimal alignment matches ACGT (8),
    // opens a gap in the query to skip the inserted 'TT' (open -3, extend -1),
    // then matches ACGT (8) → score 12, spanning the ENTIRE target [0,10).
    // A broken gap-traceback would fall back to the best no-gap local score
    // (10, over a 4-base span), so pinning the exact score AND full span makes
    // this test fail if the It gap state is dropped.
    const [best] = smithWaterman('ACGTACGT', 'ACGTTTACGT');
    expect(best.score).toBe(12);
    expect(best.start).toBe(0);
    expect(best.end).toBe(10);
    expect(best.sequence).toBe('ACGTTTACGT');
  });

  it('aligns across an insertion in the query (Iq gap state)', () => {
    // Mirror image: the query carries the extra 'TT'; the 8-base target is
    // fully spanned via an Iq gap, same score 12.
    const [best] = smithWaterman('ACGTTTACGT', 'ACGTACGT');
    expect(best.score).toBe(12);
    expect(best.start).toBe(0);
    expect(best.end).toBe(8);
    expect(best.sequence).toBe('ACGTACGT');
  });
});

// ---------------------------------------------------------------------------
// smithWaterman – ungapped fallback for very large targets (> MAX_SW_CELLS)
// ---------------------------------------------------------------------------

describe('smithWaterman – large-target ungapped fallback', () => {
  it('falls back and finds a strong ungapped match when the DP matrix is too large', () => {
    // (1000+1) * (700+1) = 701,701 cells > 600,000 → ungapped fallback path.
    const query = 'A'.repeat(1000);
    const target = 'A'.repeat(700);
    const results = smithWaterman(query, target);
    expect(results).toHaveLength(1);
    expect(results[0].start).toBe(0);
    expect(results[0].end).toBe(700);
    expect(results[0].score).toBe(1400); // 700 matches × matchScore(2)
  });

  it('returns no hits when the fallback window scores below minScore', () => {
    // All-mismatch window → negative score → filtered out.
    const query = 'A'.repeat(1000);
    const target = 'T'.repeat(700);
    expect(smithWaterman(query, target)).toHaveLength(0);
  });
});

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
import { MIN_FUZZY_IDENTITY, findApproximateMatches, maxEditsForIdentity, runFuzzySearch } from '../fuzzy';

const nucleotide = { moleculeType: 'nucleotide' as const, limit: 100 };

/** Seeded PRNG so the randomized oracle cases are reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomDna(rand: () => number, length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += 'ACGT'[Math.floor(rand() * 4)];
  return out;
}

function levenshtein(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

/** Oracle: the fewest edits aligning the whole query to any substring of the text. */
function bestInfixDistance(query: string, text: string): number {
  let prev = Array.from({ length: text.length + 1 }, () => 0);
  for (let i = 1; i <= query.length; i++) {
    const row = [i];
    for (let j = 1; j <= text.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (query[i - 1] === text[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return Math.min(...prev);
}

describe('maxEditsForIdentity', () => {
  it('allows floor(length × (100 − identity) / 100) edits', () => {
    expect(maxEditsForIdentity(50, 80)).toBe(10);
    expect(maxEditsForIdentity(43, 80)).toBe(8);
    expect(maxEditsForIdentity(10, 100)).toBe(0);
  });

  it('never allows as many edits as the query has residues', () => {
    expect(maxEditsForIdentity(4, 0)).toBe(3);
  });
});

describe('findApproximateMatches', () => {
  it('reports a substitution as one edit over the query-length span', () => {
    expect(findApproximateMatches('ACGTACGTAC', 'TTTTACGTTCGTACTTTT', 1, nucleotide))
      .toEqual([{ start: 4, end: 14, edits: 1 }]);
  });

  it('spans an inserted base in the text', () => {
    expect(findApproximateMatches('ACGTACGTAC', 'TTTTACGTAGCGTACTTTT', 1, nucleotide))
      .toEqual([{ start: 4, end: 15, edits: 1 }]);
  });

  it('spans a base deleted from the text', () => {
    expect(findApproximateMatches('ACGTACGTAC', 'TTTTACGTCGTACTTTT', 1, nucleotide))
      .toEqual([{ start: 4, end: 13, edits: 1 }]);
  });

  it('keeps an edge substitution inside a query-length span', () => {
    // 'CGTACGTAC' (one deletion) is equally close; the query-length span wins.
    expect(findApproximateMatches('ACGTACGTAC', 'GGTCGTACGTACGG', 1, nucleotide))
      .toEqual([{ start: 2, end: 12, edits: 1 }]);
  });

  it('keeps a substitution on the last base inside a query-length span', () => {
    // 'ACGTACGTA' (one deletion) is equally close; the query-length span wins.
    expect(findApproximateMatches('ACGTACGTAC', 'GGACGTACGTAGGG', 1, nucleotide))
      .toEqual([{ start: 2, end: 12, edits: 1 }]);
  });

  it('drops a match that needs more edits than allowed', () => {
    expect(findApproximateMatches('ACGTACGTAC', 'TTTTACGTTCGTTCTTTT', 1, nucleotide)).toEqual([]);
    expect(findApproximateMatches('ACGTACGTAC', 'TTTTACGTTCGTTCTTTT', 2, nucleotide))
      .toEqual([{ start: 4, end: 14, edits: 2 }]);
  });

  it('reports each tandem copy once, without overlapping spans', () => {
    expect(findApproximateMatches('ACGTACGT', 'ACGTACGTACGTACGT', 0, nucleotide)).toEqual([
      { start: 0, end: 8, edits: 0 },
      { start: 8, end: 16, edits: 0 },
    ]);
  });

  it('splits a homopolymer run into consecutive non-overlapping copies', () => {
    expect(findApproximateMatches('AAAA', 'AAAAAAAAAAAA', 0, nucleotide)).toEqual([
      { start: 0, end: 4, edits: 0 },
      { start: 4, end: 8, edits: 0 },
      { start: 8, end: 12, edits: 0 },
    ]);
  });

  it('keeps a weaker copy that does not overlap the best one inside a run', () => {
    expect(findApproximateMatches('AAAT', 'AAAAAAAAAT', 1, nucleotide)).toEqual([
      { start: 6, end: 10, edits: 0 },
      { start: 0, end: 4, edits: 1 },
    ]);
  });

  it('orders matches by edits, then position, and stops at the limit', () => {
    const text = 'GGGGACGTTCGTACGGGGGACGTACGTACGGGG';
    expect(findApproximateMatches('ACGTACGTAC', text, 1, nucleotide)).toEqual([
      { start: 19, end: 29, edits: 0 },
      { start: 4, end: 14, edits: 1 },
    ]);
    expect(findApproximateMatches('ACGTACGTAC', text, 1, { ...nucleotide, limit: 1 }))
      .toEqual([{ start: 19, end: 29, edits: 0 }]);
  });
});

describe('findApproximateMatches — independent oracle', () => {
  // Lengths straddle the 32-bit block boundaries, where carries between blocks
  // decide the distance; a wrong carry still passes the short literal cases.
  it.each([1, 7, 31, 32, 33, 63, 64, 65, 100])(
    'agrees with an independent edit-distance oracle for a %i-residue query',
    (length) => {
      const rand = mulberry32(length);
      for (let round = 0; round < 6; round++) {
        const text = randomDna(rand, 240);
        const source = text.substring(60, 60 + length);
        let query = '';
        for (const base of source) {
          const roll = rand();
          if (roll < 0.06) continue;
          query += roll < 0.12 ? 'ACGT'[Math.floor(rand() * 4)] : base;
          if (roll > 0.95) query += 'ACGT'[Math.floor(rand() * 4)];
        }
        if (!query) query = source;
        const maxEdits = Math.max(0, Math.floor(query.length * 0.3));
        const matches = findApproximateMatches(query, text, maxEdits, nucleotide);
        const best = bestInfixDistance(query, text);

        if (best > maxEdits) {
          expect(matches).toEqual([]);
          continue;
        }
        expect(matches[0].edits).toBe(best);
        for (const match of matches) {
          expect(match.edits).toBeLessThanOrEqual(maxEdits);
          expect(levenshtein(query, text.substring(match.start, match.end))).toBe(match.edits);
        }
        const spans = [...matches].sort((a, b) => a.start - b.start);
        for (let i = 1; i < spans.length; i++) expect(spans[i].start).toBeGreaterThanOrEqual(spans[i - 1].end);
      }
    },
  );
});

describe('findApproximateMatches — residues', () => {
  it('expands IUPAC codes in the query but compares text letters literally', () => {
    expect(findApproximateMatches('ACNTRY', 'GGACGTAC', 0, nucleotide)).toEqual([{ start: 2, end: 8, edits: 0 }]);
    expect(findApproximateMatches('ACGT', 'ACNT', 0, nucleotide)).toEqual([]);
  });

  it('keeps T and U distinct, like the exact search', () => {
    expect(findApproximateMatches('AUG', 'CATGC', 0, nucleotide)).toEqual([]);
    expect(findApproximateMatches('AUG', 'CAUGC', 0, nucleotide)).toEqual([{ start: 1, end: 4, edits: 0 }]);
  });

  it('matches lowercase text', () => {
    expect(findApproximateMatches('ACGT', 'ttacgttt', 0, nucleotide)).toEqual([{ start: 2, end: 6, edits: 0 }]);
  });

  it('uses the protein ambiguity codes for protein queries', () => {
    const protein = { moleculeType: 'protein' as const, limit: 100 };
    expect(findApproximateMatches('MBK', 'AMNKA', 0, protein)).toEqual([{ start: 1, end: 4, edits: 0 }]);
    expect(findApproximateMatches('MXK', 'AMWKA', 0, protein)).toEqual([{ start: 1, end: 4, edits: 0 }]);
  });

  it('returns nothing for an empty query or text', () => {
    expect(findApproximateMatches('', 'ACGT', 1, nucleotide)).toEqual([]);
    expect(findApproximateMatches('ACGT', '', 1, nucleotide)).toEqual([]);
  });
});

describe('runFuzzySearch', () => {
  const query = 'ACGTACGTAC';

  it('reports identity and edits for a forward hit in aligned coordinates', () => {
    const results = runFuzzySearch(query, [{ id: 'r1', sequence: 'TTACG--TTCGTACTT' }], false, 'fwd', 'dna', 80, 100);
    expect(results).toEqual([{
      recordId: 'r1', strand: 1, start: 2, end: 14, sequence: 'ACG--TTCGTAC',
      edits: 1, identity: 90, segments: [{ start: 2, end: 5 }, { start: 7, end: 14 }],
    }]);
  });

  it('maps a reverse-strand hit onto forward coordinates', () => {
    // Reverse complement of ACGTACGTAC is GTACGTACGT.
    const results = runFuzzySearch(query, [{ id: 'r1', sequence: 'CCGTACGTACGTCC' }], false, 'rev', 'dna', 100, 100);
    expect(results).toEqual([{
      recordId: 'r1', strand: -1, start: 2, end: 12, sequence: 'GTACGTACGT',
      edits: 0, identity: 100, segments: [{ start: 2, end: 12 }],
    }]);
  });

  it('applies the identity threshold inside the search', () => {
    const records = [{ id: 'r1', sequence: 'TTTTACGTTCGTTCTTTT' }];
    expect(runFuzzySearch(query, records, false, 'fwd', 'dna', 90, 100)).toEqual([]);
    expect(runFuzzySearch(query, records, false, 'fwd', 'dna', 80, 100)).toMatchObject([{ edits: 2, identity: 80 }]);
  });

  it('raises an identity below the floor to the floor', () => {
    // The best span, ACGTA plus five unmatched N, needs 5 edits: 50% identity.
    const records = [{ id: 'r1', sequence: 'NNNNNACGTANNNNNNNNNN' }];
    expect(MIN_FUZZY_IDENTITY).toBe(60);
    expect(runFuzzySearch(query, records, false, 'fwd', 'dna', 30, 100)).toEqual([]);
  });

  it('ranks hits across records by edits and caps them at maxResults', () => {
    const records = [
      { id: 'near', sequence: 'GGACGTTCGTACGG' },
      { id: 'exact', sequence: 'GGACGTACGTACGG' },
    ];
    const results = runFuzzySearch(query, records, false, 'fwd', 'dna', 80, 1);
    expect(results).toMatchObject([{ recordId: 'exact', edits: 0 }]);
  });

  it('keeps the leftmost reverse-strand hits in forward coordinates when capped', () => {
    // Reverse-complement AAA sits at forward [0,3) and [4,7); the cap keeps the leftmost.
    const results = runFuzzySearch('AAA', [{ id: 'r', sequence: 'TTTCTTT' }], false, 'rev', 'dna', 100, 1);
    expect(results).toMatchObject([{ strand: -1, start: 0, end: 3, edits: 0 }]);
  });

  it('skips the reverse strand for proteins', () => {
    const results = runFuzzySearch('MKV', [{ id: 'p', sequence: 'AAMKVAA' }], true, 'both', 'protein', 100, 100);
    expect(results).toMatchObject([{ recordId: 'p', strand: 1, start: 2, end: 5, edits: 0 }]);
  });
});

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
import { cigarSpans, parseCigar } from '@/src/domain/bio/cigar';
import { EDIT_PATH_CELL_BUDGET, wholeQueryPath } from '../editPath';

const alternatives: Record<string, string> = {
  A: 'A', C: 'C', G: 'G', T: 'T', U: 'U', R: 'AG', Y: 'CTU', S: 'CG', W: 'ATU',
  K: 'GTU', M: 'AC', B: 'CGTU', D: 'AGTU', H: 'ACTU', V: 'ACG', N: 'ACGTU',
};
function oracle(query: string, record: string): number {
  const dp = Array.from({ length: query.length + 1 }, () => Array<number>(record.length + 1).fill(0));
  for (let i = 0; i <= query.length; i++) dp[i][0] = i;
  for (let j = 0; j <= record.length; j++) dp[0][j] = j;
  for (let i = 1; i <= query.length; i++) {
    for (let j = 1; j <= record.length; j++) {
      const accepted = (alternatives[query[i - 1].toUpperCase()] ?? query[i - 1].toUpperCase()).includes(record[j - 1].toUpperCase());
      dp[i][j] = Math.min(dp[i - 1][j - 1] + Number(!accepted), dp[i - 1][j] + 1, dp[i][j - 1] + 1);
    }
  }
  return dp[query.length][record.length];
}
function pathCost(cigar: string, query: string, record: string): number {
  let q = 0;
  let r = 0;
  let cost = 0;
  for (const { op, length } of parseCigar(cigar)) {
    for (let k = 0; k < length; k++) {
      if (op === 'I' || op === 'D') cost++;
      else {
        expect(op).toBe(query[q].toUpperCase() === record[r].toUpperCase() ? '=' : 'X');
        cost += Number(!(alternatives[query[q].toUpperCase()] ?? query[q].toUpperCase()).includes(record[r].toUpperCase()));
      }
      if (op !== 'D') q++;
      if (op !== 'I') r++;
    }
  }
  return cost;
}
function randomPairs(count: number): Array<[string, string]> {
  let seed = 0x1749;
  const random = (n: number) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
  const sequence = (n: number) => Array.from({ length: n }, () => 'ACGTUN'[random(6)]).join('');
  return Array.from({ length: count }, () => [sequence(1 + random(40)), sequence(random(41))]);
}

describe('whole-query anchored Wagner–Fischer path', () => {
  it.each([
    ['ACGT', 'ACGT', '4=', 0], ['ACGT', 'AGT', '1=1I2=', 1], ['AGT', 'ACGT', '1=1D2=', 1],
    ['NN', 'AC', '2X', 0], ['AA', 'A', '1I1=', 1], ['A', 'AA', '1D1=', 1],
    ['aCgT', 'ACGT', '4=', 0], ['AT', 'AU', '1=1X', 1], ['N', 'N', '1=', 1],
    ['', 'AC', '2D', 2], ['AC', '', '2I', 2], ['', '', '', 0],
  ])('aligns %j against %j', (query, span, cigar, edits) => {
    expect(wholeQueryPath(query as string, span as string, 'nucleotide')).toEqual({ cigar, edits });
  });
  it('uses protein ambiguity semantics', () => {
    expect(wholeQueryPath('NBX', 'NDA', 'protein')).toEqual({ cigar: '1=2X', edits: 0 });
    expect(wholeQueryPath('X', 'X', 'protein')).toEqual({ cigar: '1=', edits: 1 });
  });
  it('agrees with an independent textbook DP on 500 seeded pairs', () => {
    for (const [query, span] of randomPairs(500)) {
      const result = wholeQueryPath(query, span, 'nucleotide');
      expect(result.edits).toBe(oracle(query, span));
      expect(cigarSpans(result.cigar)).toEqual({ query: query.length, record: span.length });
      expect(pathCost(result.cigar, query, span)).toBe(result.edits);
    }
  });
  it('recovers exactly the same tie choices through row checkpoints', () => {
    expect(EDIT_PATH_CELL_BUDGET).toBe(16_000_000);
    for (const [query, span] of randomPairs(200)) {
      expect(wholeQueryPath(query, span, 'nucleotide', { cellBudget: 64 })).toEqual(wholeQueryPath(query, span, 'nucleotide'));
    }
    expect(wholeQueryPath('AA', 'A', 'nucleotide', { cellBudget: 1 })).toEqual({ cigar: '1I1=', edits: 1 });
  });
  it('recovers a 6000 by 6000 path above the matrix budget', () => {
    const query = 'ACGT'.repeat(1500);
    const span = 'ACGT'.repeat(749) + 'TCGT' + 'ACGT'.repeat(750);
    const result = wholeQueryPath(query, span, 'nucleotide', { cellBudget: 1_000_000 });
    expect(result.edits).toBe(1);
    expect(cigarSpans(result.cigar)).toEqual({ query: 6000, record: 6000 });
    expect(pathCost(result.cigar, query, span)).toBe(1);
  }, 30_000);
});

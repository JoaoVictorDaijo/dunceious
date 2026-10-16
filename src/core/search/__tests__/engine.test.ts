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
import { degenerateToRegex } from '../query';
import { reverseComplement } from '@/src/domain/bio';

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

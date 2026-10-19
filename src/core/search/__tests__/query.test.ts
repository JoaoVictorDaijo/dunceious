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
import { degenerateToRegex, residueAlternatives, type ResidueAlphabet } from '../query';

function spans(regex: RegExp, target: string, overlapping = true): [number, number, string][] {
  const matches: [number, number, string][] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(target)) !== null) {
    matches.push([match.index, match.index + match[0].length, match[0]]);
    if (overlapping) regex.lastIndex = match.index + 1;
  }
  return matches;
}

function unmergedRegex(query: string, alphabet: ResidueAlphabet): RegExp {
  if (!query) return /$.^/;
  const pattern = query.split('').map(char => {
    const alternatives = residueAlternatives(char, alphabet).replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
    return alternatives.length > 1 ? `[${alternatives}]` : alternatives;
  }).join('-*');
  return new RegExp(pattern, 'gi');
}

function words(alphabet: string, maxLength: number): string[] {
  const all = [''];
  let current = [''];
  for (let length = 1; length <= maxLength; length++) {
    current = current.flatMap(prefix => [...alphabet].map(char => prefix + char));
    all.push(...current);
  }
  return all;
}

describe('degenerateToRegex — literal alignment gaps', () => {
  it.each([
    { query: '-', target: '---', expected: [[0, 1, '-'], [1, 2, '-'], [2, 3, '-']] },
    { query: '--', target: '----', expected: [[0, 4, '----'], [1, 4, '---'], [2, 4, '--']] },
    { query: '---', target: '--', expected: [] },
    { query: '-A', target: '---a', expected: [[0, 4, '---a'], [1, 4, '--a'], [2, 4, '-a']] },
    { query: 'A-', target: 'a---', expected: [[0, 4, 'a---']] },
    { query: '--A--', target: '---A----', expected: [[0, 8, '---A----'], [1, 8, '--A----']] },
    { query: 'A---C', target: 'A--C', expected: [] },
    { query: 'A---C', target: 'A---C', expected: [[0, 5, 'A---C']] },
    { query: 'A---C', target: 'A-----C', expected: [[0, 7, 'A-----C']] },
    { query: 'A--C-G', target: 'TA---C--G', expected: [[1, 9, 'A---C--G']] },
    { query: 'R--Y', target: 'g---u', expected: [[0, 5, 'g---u']] },
    { query: 'T-U', target: 'U-T', expected: [] },
  ])('keeps required gaps and greedy overlapping spans for $query in $target', ({ query, target, expected }) => {
    expect(spans(degenerateToRegex(query), target)).toEqual(expected);
  });

  it('keeps global matching nonoverlapping unless the caller resets lastIndex', () => {
    expect(spans(degenerateToRegex('--'), '----A---', false)).toEqual([
      [0, 4, '----'], [5, 8, '---'],
    ]);
  });

  it.each(['protein', 'nucleotide'] as const)('preserves escaped literals around gap runs in the %s alphabet', alphabet => {
    for (const literal of '.*+?^${}()|[]\\/') {
      expect(spans(degenerateToRegex(`${literal}--${literal}`, alphabet), `x${literal}---${literal}x`))
        .toEqual([[1, 6, `${literal}---${literal}`]]);
    }
  });

  it('expands protein ambiguity codes without borrowing nucleotide alternatives', () => {
    expect(spans(degenerateToRegex('B--Z-J', 'protein'), 'n---q--l')).toEqual([[0, 8, 'n---q--l']]);
    expect(spans(degenerateToRegex('B--Z-J', 'nucleotide'), 'n---q--l')).toEqual([]);
    expect(spans(degenerateToRegex('X--U-O', 'protein'), 'w--u-o')).toEqual([[0, 6, 'w--u-o']]);
  });

  it.each(['nucleotide', 'protein'] as const)('preserves unmerged compiler spans on bounded %s inputs', alphabet => {
    const queries = [...words('AC-', 4), 'R--Y', '-N-', 'B--Z-J', 'X--U-O', '.--[', '--A--C--'];
    const targets = [...words('AC-', 5), 'g---u', 'n---q--l', 'w--u-o', '.---[', '--A--C--'];
    for (const overlapping of [false, true]) {
      for (const query of queries) {
        const actual = targets.map(target => spans(degenerateToRegex(query, alphabet), target, overlapping));
        const expected = targets.map(target => spans(unmergedRegex(query, alphabet), target, overlapping));
        expect(actual, `${alphabet} query=${JSON.stringify(query)} overlapping=${overlapping}`).toEqual(expected);
      }
    }
  });
});

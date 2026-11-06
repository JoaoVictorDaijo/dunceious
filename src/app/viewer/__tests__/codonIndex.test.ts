/*
 * Dunceious
 * Copyright (C) 2026 João Victor Daijo and Murilo Cassiano
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


import { expect, it } from 'vitest';
import { indexCodonPieces, visibleCodonPieces } from '../codonIndex';

it('matches exhaustive half-open lookup across nested intervals, split pieces and deep lanes without a cap', () => {
  const spans = [{ id: 'split-a', start: 2, end: 3 }, { id: 'split-b', start: 4, end: 6 },
    { id: 'nested', start: 1, end: 100 }, { id: 'left', start: 0, end: 1 },
    ...Array.from({ length: 257 }, (_, lane) => ({ id: `lane-${lane}`, start: 7, end: 10 }))]
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const index = indexCodonPieces(spans);
  for (const [start, end] of [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [6, 7], [7, 8], [9, 10], [10, 11], [99, 100], [100, 101], [5, 5]]) {
    const expected = end > start ? spans.filter(s => s.start < end && s.end > start) : [];
    expect(visibleCodonPieces(index, start, end)).toEqual(expected);
  }
  expect(visibleCodonPieces(index, 7, 8)).toHaveLength(258);
});

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
import { getDisplaySeq } from '../viewModel';

describe('getDisplaySeq', () => {
  it('returns the whole sequence when there is no feature', () => {
    expect(getDisplaySeq('ACGTACGT', null)).toBe('ACGTACGT');
  });
  it('slices substring(start, end) for a normal feature (start <= end)', () => {
    expect(getDisplaySeq('ACGTACGT', { start: 2, end: 5 })).toBe('GTA');
  });
  it('wraps around the origin for a circular feature (start > end)', () => {
    // substring(6) = 'GT', substring(0,2) = 'AC' -> 'GTAC'
    expect(getDisplaySeq('ACGTACGT', { start: 6, end: 2 })).toBe('GTAC');
  });
  it('returns an empty string for a zero-width feature (start === end)', () => {
    expect(getDisplaySeq('ACGTACGT', { start: 3, end: 3 })).toBe('');
  });
});

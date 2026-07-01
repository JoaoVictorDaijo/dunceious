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
import { getDisplaySeq, featureLength, scorePercent } from '../viewModel';

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

describe('featureLength', () => {
  it('sums |end - start| across all segments when segments are present', () => {
    expect(featureLength(100, 0, 0, [{ start: 5, end: 10 }, { start: 20, end: 23 }])).toBe(8);
  });
  it('spans (seqLen - start) + end for a circular wrap-around (start > end)', () => {
    expect(featureLength(100, 90, 10)).toBe(20);
  });
  it('returns |end - start| for a normal feature', () => {
    expect(featureLength(100, 5, 15)).toBe(10);
  });
  it('uses the circular formula for a reversed simple feature on a known-length record', () => {
    // start(20) > end(5) with seqLen 100 -> (100-20)+5
    expect(featureLength(100, 20, 5)).toBe(85);
  });
  it('falls back to |end - start| when the feature wraps but seqLen is unknown', () => {
    expect(featureLength(undefined, 20, 5)).toBe(15);
  });
  it('falls through an empty segments array to the length branch', () => {
    expect(featureLength(100, 5, 15, [])).toBe(10);
  });
});

describe('scorePercent', () => {
  it('returns the exact percentage for a clean ratio', () => {
    expect(scorePercent(50, 100)).toBe(50);
  });
  it('guards divide-by-zero, returning 0 when maxScoreFound is 0', () => {
    expect(scorePercent(50, 0)).toBe(0);
  });
  it('rounds down below the half boundary', () => {
    expect(scorePercent(1, 3)).toBe(33); // 33.33...
  });
  it('rounds up above the half boundary', () => {
    expect(scorePercent(2, 3)).toBe(67); // 66.66...
  });
  it('rounds a .5 up (Math.round half-up)', () => {
    expect(scorePercent(1, 8)).toBe(13); // 12.5 -> 13
  });
});

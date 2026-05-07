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
import { clipInterval, clipSegments, splitWrapAround } from '../intervals';

// ---------------------------------------------------------------------------
// clipInterval
// ---------------------------------------------------------------------------

describe('clipInterval', () => {
  it('returns the interval unchanged when it fits exactly inside the bounds', () => {
    expect(clipInterval(2, 8, 0, 10)).toEqual({ start: 2, end: 8 });
  });

  it('clips the start to the minimum bound', () => {
    expect(clipInterval(0, 8, 3, 10)).toEqual({ start: 3, end: 8 });
  });

  it('clips the end to the maximum bound', () => {
    expect(clipInterval(2, 15, 0, 10)).toEqual({ start: 2, end: 10 });
  });

  it('clips both ends simultaneously', () => {
    expect(clipInterval(0, 20, 5, 15)).toEqual({ start: 5, end: 15 });
  });

  it('returns null when the interval is entirely before the min bound', () => {
    expect(clipInterval(0, 3, 5, 10)).toBeNull();
  });

  it('returns null when the interval is entirely after the max bound', () => {
    expect(clipInterval(12, 20, 0, 10)).toBeNull();
  });

  it('returns null when the interval ends exactly at the min bound', () => {
    // end === min → clippedStart(5) >= clippedEnd(5)
    expect(clipInterval(0, 5, 5, 10)).toBeNull();
  });

  it('returns null when the interval starts exactly at the max bound', () => {
    expect(clipInterval(10, 20, 0, 10)).toBeNull();
  });

  it('handles a zero-width interval at a valid position', () => {
    // start === end → clippedStart >= clippedEnd → null
    expect(clipInterval(5, 5, 0, 10)).toBeNull();
  });

  it('handles a single-position interval', () => {
    expect(clipInterval(5, 6, 0, 10)).toEqual({ start: 5, end: 6 });
  });
});

// ---------------------------------------------------------------------------
// clipSegments
// ---------------------------------------------------------------------------

describe('clipSegments', () => {
  it('returns an empty array for an empty segment list', () => {
    expect(clipSegments([], 0, 100)).toEqual([]);
  });

  it('keeps segments entirely inside the viewport', () => {
    expect(clipSegments([{ start: 10, end: 20 }], 0, 100)).toEqual([{ start: 10, end: 20 }]);
  });

  it('removes segments entirely outside the viewport', () => {
    expect(clipSegments([{ start: 200, end: 300 }], 0, 100)).toEqual([]);
  });

  it('clips segments that partially overlap the viewport', () => {
    expect(clipSegments([{ start: 50, end: 150 }], 0, 100)).toEqual([{ start: 50, end: 100 }]);
  });

  it('handles multiple segments with mixed visibility', () => {
    const segments = [
      { start: 0, end: 10 },   // fully inside
      { start: 50, end: 150 }, // partially inside
      { start: 200, end: 300 }, // fully outside
    ];
    expect(clipSegments(segments, 0, 100)).toEqual([
      { start: 0, end: 10 },
      { start: 50, end: 100 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// splitWrapAround
// ---------------------------------------------------------------------------

describe('splitWrapAround', () => {
  it('returns a single segment for a non-wrap interval', () => {
    expect(splitWrapAround(2, 8, 10)).toEqual([{ start: 2, end: 8 }]);
  });

  it('returns a single segment when start equals end (degenerate)', () => {
    expect(splitWrapAround(5, 5, 10)).toEqual([{ start: 5, end: 5 }]);
  });

  it('splits a wrap-around interval into two segments', () => {
    // start=8, end=3 on a length-10 sequence → [8,10) and [0,3)
    expect(splitWrapAround(8, 3, 10)).toEqual([
      { start: 8, end: 10 },
      { start: 0, end: 3 },
    ]);
  });

  it('omits the first segment when start equals seqLength', () => {
    // start=10 is not < seqLength (10), so only [0,3)
    expect(splitWrapAround(10, 3, 10)).toEqual([{ start: 0, end: 3 }]);
  });

  it('omits the second segment when end is 0', () => {
    // end=0 → only [8,10)
    expect(splitWrapAround(8, 0, 10)).toEqual([{ start: 8, end: 10 }]);
  });

  it('handles a full-circle wrap-around', () => {
    // start=0, end=0 on length 10 → start <= end, single segment [0,0)
    expect(splitWrapAround(0, 0, 10)).toEqual([{ start: 0, end: 0 }]);
  });
});

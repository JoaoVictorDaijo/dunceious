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
import { getDisplaySeq, featureLength, scorePercent, deriveAlignmentState, featureCoordPatch } from '../viewModel';

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

describe('deriveAlignmentState', () => {
  it('reports no alignment and zero length for no records', () => {
    expect(deriveAlignmentState([], false)).toEqual({
      isAlignmentLoaded: false, alignmentLength: 0, sessionMoleculeType: null,
    });
  });
  it('requires at least two records to be considered aligned', () => {
    expect(deriveAlignmentState([{ sequence: 'ACGT' }], false)).toEqual({
      isAlignmentLoaded: false, alignmentLength: 4, sessionMoleculeType: 'nucleotide',
    });
  });
  it('is aligned when two records share an equal length', () => {
    expect(deriveAlignmentState([{ sequence: 'ACGT' }, { sequence: 'TGCA' }], false)).toEqual({
      isAlignmentLoaded: true, alignmentLength: 4, sessionMoleculeType: 'nucleotide',
    });
  });
  it('is not aligned when two records differ in length', () => {
    expect(deriveAlignmentState([{ sequence: 'ACGT' }, { sequence: 'TGC' }], false)).toEqual({
      isAlignmentLoaded: false, alignmentLength: 4, sessionMoleculeType: 'nucleotide',
    });
  });
  it('prefers alignedSequence length and honours the protein session flag', () => {
    expect(deriveAlignmentState(
      [{ sequence: 'ACGT', alignedSequence: 'AC-GT' }, { sequence: 'TGCA', alignedSequence: 'TG-CA' }],
      true,
    )).toEqual({ isAlignmentLoaded: true, alignmentLength: 5, sessionMoleculeType: 'protein' });
  });
  it('sets sessionMoleculeType to protein for a single protein record', () => {
    expect(deriveAlignmentState([{ sequence: 'MK' }], true)).toEqual({
      isAlignmentLoaded: false, alignmentLength: 2, sessionMoleculeType: 'protein',
    });
  });
});

describe('featureCoordPatch', () => {
  it('patches start and rewrites the single segment for a segmentless feature', () => {
    expect(featureCoordPatch({ start: 10, end: 50 }, 'start', '20')).toEqual({
      start: 20, segments: [{ start: 20, end: 50 }],
    });
  });
  it('patches end and rewrites the single segment for a segmentless feature', () => {
    expect(featureCoordPatch({ start: 10, end: 50 }, 'end', '60')).toEqual({
      end: 60, segments: [{ start: 10, end: 60 }],
    });
  });
  it('does NOT clobber segments for a multi-segment feature', () => {
    expect(
      featureCoordPatch(
        { start: 10, end: 50, segments: [{ start: 10, end: 20 }, { start: 30, end: 50 }] },
        'start',
        '5',
      ),
    ).toEqual({ start: 5 });
  });
  it('rewrites the segment when the feature has exactly one segment (length <= 1)', () => {
    expect(
      featureCoordPatch({ start: 10, end: 50, segments: [{ start: 10, end: 50 }] }, 'start', '5'),
    ).toEqual({ start: 5, segments: [{ start: 5, end: 50 }] });
  });
  it('preserves the parseInt NaN quirk for an unparseable value (not guarded)', () => {
    const patch = featureCoordPatch({ start: 10, end: 50 }, 'start', 'abc');
    expect(Number.isNaN(patch.start as number)).toBe(true);
    expect(patch.segments).toHaveLength(1);
    expect(Number.isNaN(patch.segments![0].start)).toBe(true);
    expect(patch.segments![0].end).toBe(50);
  });
});

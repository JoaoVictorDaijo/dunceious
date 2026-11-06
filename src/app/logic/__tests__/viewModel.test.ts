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

import { describe, it, expect } from 'vitest';
import { parseLocation } from '@/src/core/genbank/locationParser';
import { getDisplaySeq, featureLength, deriveAlignmentState, featureCoordPatch, featureLengthText, partialEndsLabel } from '../viewModel';

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
  it('counts a wrapping segment across the circular origin', () => {
    expect(featureLength(100, 0, 0, [{ start: 10, end: 5 }])).toBe(95);
    expect(featureLength(undefined, 0, 0, [{ start: 10, end: 5 }])).toBe(5);
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

// LOC-7 (owner decision on #81): an order() feature's length is its interval sum named "not joined";
// LOC-5: a between-base site covers no bases.
describe('featureLengthText', () => {
  const protein = { sequence: 'M'.repeat(200), moleculeType: 'protein' as const };
  const dna = { sequence: 'A'.repeat(200) };
  const sites = [31, 34, 36, 107].map(i => ({ start: i, end: i + 1 }));
  it.each([
    [protein, { operator: 'order' as const, segments: sites, start: 31, end: 108 }, '4 aa in 4 intervals (not joined)'],
    [dna, { operator: 'join' as const, segments: [{ start: 0, end: 10 }, { start: 20, end: 30 }], start: 0, end: 30 }, '20 bp'],
    [dna, { betweenBases: true as const, segments: [{ start: 10, end: 10 }], start: 10, end: 10 }, '0 bp (between-base site)'],
    [dna, { start: 0, end: 1500 }, '1,500 bp'],
  ])('%o, %o → %s', (record, feature, text) => {
    expect(featureLengthText(record, { type: 'misc_feature', name: 'f', strand: 1, ...feature })).toBe(text);
  });
});

// Owner decision 12: an edit keeps the interval's markers and strand; only the number changes.
describe('featureCoordPatch – partial ends', () => {
  it('keeps both markers of a one-interval feature when its end is edited', () => {
    expect(featureCoordPatch({ start: 0, end: 206, segments: [{ start: 0, end: 206, partialStart: true, partialEnd: true }] }, 'end', '180').segments)
      .toEqual([{ start: 0, end: 180, partialStart: true, partialEnd: true }]);
  });
});

// Owner decision 10: the details window names the partial end read 5′→3′, from the per-end flags.
// complement(<1..9) is 3′-partial and complement(1..>9) 5′-partial (table2asn cases of #278).
describe('partialEndsLabel', () => {
  it.each([
    ['<1..9', '5′ partial'],
    ['1..>9', '3′ partial'],
    ['complement(<1..9)', '3′ partial'],
    ['complement(1..>9)', '5′ partial'],
    ['<5..>25', '5′ and 3′ partial'],
    ['join(1..>6,10..12)', 'Partial'],
    ['1..9', null],
  ])('%s → %s', (location, label) => {
    const { strand, segments } = parseLocation(location);
    expect(partialEndsLabel({ strand, segments }, false)).toBe(label);
  });

  it('says Partial on a protein record, which has no 5′ or 3′ end', () => {
    expect(partialEndsLabel({ strand: 1, segments: [{ start: 0, end: 9, partialStart: true }] }, true)).toBe('Partial');
  });
});

// Owner decision 7: a feature with remote parts counts only this record's bases, and names the rest.
describe('featureLengthText – remote parts', () => {
  it('counts local bases and names the remote interval', () => {
    expect(featureLengthText({ sequence: 'A'.repeat(200) }, { type: 'CDS', name: 'r', strand: 1, start: 0, end: 100,
      segments: [{ start: 0, end: 100 }], remoteParts: [{ accession: 'J00194.1', start: 99, end: 202, strand: 1, index: 1 }] }))
      .toBe('100 bp in this record, plus 1 interval in J00194.1');
  });
});

it('computes conservation over visible aligned rows only, and needs two', async () => {
  const { alignedConservation } = await import('../viewModel');
  const rows = [
    { id: 'a', name: 'a', sequence: 'ACGT', alignedSequence: 'AC--GT', features: [] },
    { id: 'b', name: 'b', sequence: 'ACTTGT', alignedSequence: 'ACTTGT', features: [] },
    { id: 'u', name: 'u', sequence: 'TTTTTTTT', features: [] },
  ];
  expect(alignedConservation(rows)).toEqual([1, 1, 0.5, 0.5, 1, 1]);
  expect(alignedConservation([rows[0], rows[2]])).toEqual([]);
  expect(alignedConservation([rows[0], { ...rows[1], visible: false }, rows[2]])).toEqual([]);
  expect(alignedConservation(rows)).toEqual([1, 1, 0.5, 0.5, 1, 1]);
});

it('keeps location operators and remote parts on an aligned biological snapshot', async () => {
  const { displayLocation } = await import('../displayLocation');
  const record = { id: 'r', name: 'r', sequence: 'A'.repeat(20), features: [] };
  const biological = { start: 0, end: 10, strand: 1 as const, segments: [{ start: 0, end: 3 }, { start: 7, end: 10 }] };
  const feature = { ...biological, type: 'gene', name: 'f', operator: 'order' as const, biological,
    start: 0, end: 12, segments: [{ start: 0, end: 3 }, { start: 9, end: 12 }] };
  expect(displayLocation(feature, record)).toBe('order(1..3,8..10)');
  expect(displayLocation({ ...feature, remoteParts: [{ accession: 'AB123.1', start: 20, end: 30, strand: 1, index: 1 }] }, record))
    .toBe('order(1..3,AB123.1:21..30,8..10)');
});

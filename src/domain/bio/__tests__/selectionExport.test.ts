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
import { clipAndRebaseInterval, sliceRecordsBySelection } from '../intervals';
import type { SeqRecord, BioFeature } from '../types';

// ---------------------------------------------------------------------------
// clipAndRebaseInterval – half-open [start, end) boundary semantics
// ---------------------------------------------------------------------------

describe('clipAndRebaseInterval – interval clipping and rebasing (half-open [start, end))', () => {
  const SEL_START = 10;
  const SEL_END = 20; // selection window is [10, 20)

  it('returns rebased coords for a fully contained interval', () => {
    expect(clipAndRebaseInterval(12, 18, SEL_START, SEL_END)).toEqual({ start: 2, end: 8 });
  });

  it('clips a left-overlapping interval to the selection boundary', () => {
    // [5, 12) ∩ [10, 20) → rebased [0, 2)
    expect(clipAndRebaseInterval(5, 12, SEL_START, SEL_END)).toEqual({ start: 0, end: 2 });
  });

  it('clips a right-overlapping interval to the selection boundary', () => {
    // [18, 25) ∩ [10, 20) → rebased [8, 10)
    expect(clipAndRebaseInterval(18, 25, SEL_START, SEL_END)).toEqual({ start: 8, end: 10 });
  });

  it('drops an interval that touches the left boundary but does not overlap', () => {
    // [0, 10) ends exactly at selStart → no overlap
    expect(clipAndRebaseInterval(0, 10, SEL_START, SEL_END)).toBeNull();
  });

  it('drops an interval that touches the right boundary but does not overlap', () => {
    // [20, 30) starts exactly at selEnd → no overlap
    expect(clipAndRebaseInterval(20, 30, SEL_START, SEL_END)).toBeNull();
  });

  it('drops a zero-length interval inside the selection', () => {
    expect(clipAndRebaseInterval(10, 10, SEL_START, SEL_END)).toBeNull();
  });

  it('returns null for an interval wholly outside the selection (left)', () => {
    expect(clipAndRebaseInterval(0, 5, SEL_START, SEL_END)).toBeNull();
  });

  it('returns null for an interval wholly outside the selection (right)', () => {
    expect(clipAndRebaseInterval(25, 30, SEL_START, SEL_END)).toBeNull();
  });

  it('handles an interval that spans the entire selection', () => {
    // [5, 30) covers [10, 20) → rebased [0, 10)
    expect(clipAndRebaseInterval(5, 30, SEL_START, SEL_END)).toEqual({ start: 0, end: 10 });
  });

  it('returns null for a degenerate selection (selEnd <= selStart)', () => {
    expect(clipAndRebaseInterval(10, 15, 20, 10)).toBeNull();
  });

  it('handles an interval exactly matching the selection window', () => {
    expect(clipAndRebaseInterval(10, 20, SEL_START, SEL_END)).toEqual({ start: 0, end: 10 });
  });

  it('handles single-base interval at the start of the selection', () => {
    expect(clipAndRebaseInterval(10, 11, SEL_START, SEL_END)).toEqual({ start: 0, end: 1 });
  });

  it('handles single-base interval at the last position of the selection', () => {
    expect(clipAndRebaseInterval(19, 20, SEL_START, SEL_END)).toEqual({ start: 9, end: 10 });
  });
});

// ---------------------------------------------------------------------------
// sliceRecordsBySelection – sequence slicing
// ---------------------------------------------------------------------------

function makeRecord(overrides: Partial<SeqRecord> = {}): SeqRecord {
  return {
    id: 'r1',
    name: 'Record 1',
    sequence: 'AAAAAAAAAA' + 'CCCCCCCCCC' + 'GGGGGGGGGG', // 30 bases
    features: [],
    ...overrides,
  };
}

describe('sliceRecordsBySelection – sequence slicing', () => {
  it('slices the sequence to the selection window', () => {
    const [result] = sliceRecordsBySelection([makeRecord()], 10, 20);
    expect(result.sequence).toBe('CCCCCCCCCC');
  });

  it('clears alignedSequence in the output', () => {
    const record = makeRecord({ alignedSequence: 'AAAA----CCCCGGGG' });
    const [result] = sliceRecordsBySelection([record], 10, 20);
    expect(result.alignedSequence).toBeUndefined();
  });

  it('uses alignedSequence as source when present', () => {
    // aligned seq has gaps; slicing [4, 8) → '----'
    const record = makeRecord({ alignedSequence: 'AAAA----CCCCGGGG' });
    const [result] = sliceRecordsBySelection([record], 4, 8);
    expect(result.sequence).toBe('----');
  });

  it('clamps slice to sequence boundaries', () => {
    const [result] = sliceRecordsBySelection([makeRecord()], 25, 50);
    expect(result.sequence).toBe('GGGGG');
  });
});

// ---------------------------------------------------------------------------
// sliceRecordsBySelection – feature rebasing
// ---------------------------------------------------------------------------

describe('sliceRecordsBySelection – feature rebasing', () => {
  it('rebases a fully contained feature', () => {
    const feature: BioFeature = { type: 'CDS', name: 'f1', start: 12, end: 18, strand: 1 };
    const [result] = sliceRecordsBySelection([makeRecord({ features: [feature] })], 10, 20);
    expect(result.features).toEqual([{ ...feature, start: 2, end: 8 }]);
  });

  it('clips a feature that extends beyond the selection', () => {
    const feature: BioFeature = { type: 'CDS', name: 'f1', start: 5, end: 15, strand: 1 };
    const [result] = sliceRecordsBySelection([makeRecord({ features: [feature] })], 10, 20);
    expect(result.features[0]).toMatchObject({ start: 0, end: 5 });
  });

  it('removes a feature entirely outside the selection', () => {
    const feature: BioFeature = { type: 'CDS', name: 'f1', start: 0, end: 8, strand: 1 };
    const [result] = sliceRecordsBySelection([makeRecord({ features: [feature] })], 10, 20);
    expect(result.features).toHaveLength(0);
  });

  it('removes a feature that becomes zero-length after clipping', () => {
    // Feature ends exactly at selStart → no overlap
    const feature: BioFeature = { type: 'CDS', name: 'f1', start: 0, end: 10, strand: 1 };
    const [result] = sliceRecordsBySelection([makeRecord({ features: [feature] })], 10, 20);
    expect(result.features).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// sliceRecordsBySelection – segment rebasing (the key bug fix)
// ---------------------------------------------------------------------------

describe('sliceRecordsBySelection – multi-segment feature rebasing', () => {
  it('rebases segment coordinates alongside parent feature coordinates', () => {
    const feature: BioFeature = {
      type: 'gene',
      name: 'join_gene',
      start: 5,
      end: 25,
      strand: 1,
      segments: [
        { start: 5, end: 12 },
        { start: 18, end: 25 },
      ],
    };
    const [result] = sliceRecordsBySelection([makeRecord({ features: [feature] })], 10, 20);
    expect(result.features).toHaveLength(1);
    const f = result.features[0];
    // Parent bounds clipped to [10,20) → rebased [0, 10)
    expect(f.start).toBe(0);
    expect(f.end).toBe(10);
    // segments must be rebased (not absolute)
    expect(f.segments).toEqual([
      { start: 0, end: 2 }, // [5,12) ∩ [10,20) → [10,12) → rebased [0,2)
      { start: 8, end: 10 }, // [18,25) ∩ [10,20) → [18,20) → rebased [8,10)
    ]);
  });

  it('drops segment sub-intervals that fall outside the selection', () => {
    const feature: BioFeature = {
      type: 'gene',
      name: 'partial_join',
      start: 0,
      end: 30,
      strand: 1,
      segments: [
        { start: 0, end: 8 },   // entirely before selection [10,20) → dropped
        { start: 12, end: 18 }, // inside → kept
        { start: 22, end: 30 }, // entirely after → dropped
      ],
    };
    const [result] = sliceRecordsBySelection([makeRecord({ features: [feature] })], 10, 20);
    expect(result.features).toHaveLength(1);
    expect(result.features[0].segments).toEqual([{ start: 2, end: 8 }]);
  });

  it('sets segments to undefined when all sub-intervals are outside', () => {
    const feature: BioFeature = {
      type: 'gene',
      name: 'no_overlap',
      start: 5,
      end: 25,
      strand: 1,
      segments: [
        { start: 5, end: 8 },   // before [10,20)
        { start: 22, end: 25 }, // after  [10,20)
      ],
    };
    const [result] = sliceRecordsBySelection([makeRecord({ features: [feature] })], 10, 20);
    // Parent still overlaps → feature kept, but segments cleared
    expect(result.features).toHaveLength(1);
    expect(result.features[0].segments).toBeUndefined();
  });

  it('preserves undefined segments on a simple feature', () => {
    const feature: BioFeature = { type: 'CDS', name: 'simple', start: 12, end: 18, strand: 1 };
    const [result] = sliceRecordsBySelection([makeRecord({ features: [feature] })], 10, 20);
    expect(result.features[0].segments).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// sliceRecordsBySelection – track interval filtering
// ---------------------------------------------------------------------------

describe('sliceRecordsBySelection – track data clipping', () => {
  it('rebases track intervals that overlap the selection', () => {
    const record = makeRecord({
      tracks: [{
        id: 't1', name: 'Track 1',
        data: [{ start: 12, end: 18, value: 5 }],
      }],
    });
    const [result] = sliceRecordsBySelection([record], 10, 20);
    expect(result.tracks![0].data).toEqual([{ start: 2, end: 8, value: 5 }]);
  });

  it('filters out track intervals with no overlap', () => {
    const record = makeRecord({
      tracks: [{
        id: 't1', name: 'Track 1',
        data: [
          { start: 0, end: 8, value: 1 },   // before selection
          { start: 12, end: 18, value: 2 },  // inside
          { start: 25, end: 30, value: 3 },  // after selection
        ],
      }],
    });
    const [result] = sliceRecordsBySelection([record], 10, 20);
    expect(result.tracks![0].data).toHaveLength(1);
    expect(result.tracks![0].data[0].value).toBe(2);
  });

  it('filters out zero-length track intervals produced by clipping', () => {
    // Interval ending exactly at selStart becomes zero-length after clipping
    const record = makeRecord({
      tracks: [{
        id: 't1', name: 'Track 1',
        data: [{ start: 5, end: 10, value: 9 }], // ends at selStart → zero-length
      }],
    });
    const [result] = sliceRecordsBySelection([record], 10, 20);
    expect(result.tracks![0].data).toHaveLength(0);
  });

  it('preserves extra properties on track data items', () => {
    const record = makeRecord({
      tracks: [{
        id: 't1', name: 'Track 1',
        data: [{ start: 11, end: 14, value: 42 }],
      }],
    });
    const [result] = sliceRecordsBySelection([record], 10, 20);
    expect(result.tracks![0].data[0].value).toBe(42);
  });
});

// ---------------------------------------------------------------------------
// sliceRecordsBySelection – output structure
// ---------------------------------------------------------------------------

describe('sliceRecordsBySelection – output structure', () => {
  it('preserves non-positional record fields', () => {
    const record = makeRecord({ definition: 'Test record', accession: 'ACC001' });
    const [result] = sliceRecordsBySelection([record], 5, 15);
    expect(result.id).toBe('r1');
    expect(result.name).toBe('Record 1');
    expect(result.definition).toBe('Test record');
    expect(result.accession).toBe('ACC001');
  });

  it('returns the same number of records as input', () => {
    const records = [makeRecord({ id: 'r1' }), makeRecord({ id: 'r2' })];
    const results = sliceRecordsBySelection(records, 10, 20);
    expect(results).toHaveLength(2);
  });

  it('handles records with no tracks gracefully', () => {
    const [result] = sliceRecordsBySelection([makeRecord()], 10, 20);
    expect(result.tracks).toBeUndefined();
  });
});

import { describe, it, expect } from 'vitest';
import { clipInterval, sliceRecordsBySelection } from '../bioUtils';
import type { SeqRecord } from '../../types';

// ---------------------------------------------------------------------------
// clipInterval tests
// ---------------------------------------------------------------------------
describe('clipInterval', () => {
  it('returns rebased coords for a fully contained interval', () => {
    expect(clipInterval(12, 18, 10, 20)).toEqual({ start: 2, end: 8 });
  });

  it('clips a left-overlapping interval to selection start', () => {
    expect(clipInterval(5, 15, 10, 20)).toEqual({ start: 0, end: 5 });
  });

  it('clips a right-overlapping interval to selection end', () => {
    expect(clipInterval(15, 25, 10, 20)).toEqual({ start: 5, end: 10 });
  });

  it('returns null for an interval that ends exactly at selection start (no overlap)', () => {
    expect(clipInterval(0, 10, 10, 20)).toBeNull();
  });

  it('returns null for an interval that starts exactly at selection end (no overlap)', () => {
    expect(clipInterval(20, 30, 10, 20)).toBeNull();
  });

  it('returns null for an interval completely before the selection', () => {
    expect(clipInterval(0, 5, 10, 20)).toBeNull();
  });

  it('returns null for an interval completely after the selection', () => {
    expect(clipInterval(25, 30, 10, 20)).toBeNull();
  });

  it('handles an interval that exactly spans the selection', () => {
    expect(clipInterval(10, 20, 10, 20)).toEqual({ start: 0, end: 10 });
  });

  it('handles an interval larger than the selection', () => {
    expect(clipInterval(0, 100, 10, 20)).toEqual({ start: 0, end: 10 });
  });

  it('handles a single-base interval inside the selection', () => {
    expect(clipInterval(15, 16, 10, 20)).toEqual({ start: 5, end: 6 });
  });

  it('handles a single-base interval at the selection start', () => {
    expect(clipInterval(10, 11, 10, 20)).toEqual({ start: 0, end: 1 });
  });

  it('handles a single-base interval at the last position of the selection', () => {
    expect(clipInterval(19, 20, 10, 20)).toEqual({ start: 9, end: 10 });
  });
});

// ---------------------------------------------------------------------------
// sliceRecordsBySelection tests
// ---------------------------------------------------------------------------

const makeRecord = (overrides: Partial<SeqRecord> = {}): SeqRecord => ({
  id: 'rec1',
  name: 'Record 1',
  sequence: 'ACGTACGTACGTACGTACGT', // 20 bases, indices 0-19
  features: [],
  ...overrides,
});

describe('sliceRecordsBySelection – sequence', () => {
  it('slices the sequence to the selection window', () => {
    const [result] = sliceRecordsBySelection([makeRecord()], 5, 10);
    expect(result.sequence).toBe('CGTAC');
  });

  it('uses alignedSequence when present and clears it in the output', () => {
    const record = makeRecord({ alignedSequence: 'AAAACCCCGGGGTTTTAAAA' });
    const [result] = sliceRecordsBySelection([record], 4, 8);
    expect(result.sequence).toBe('CCCC');
    expect(result.alignedSequence).toBeUndefined();
  });

  it('clamps to sequence boundaries when selection exceeds sequence length', () => {
    const [result] = sliceRecordsBySelection([makeRecord()], 15, 30);
    expect(result.sequence).toBe('TACGT'); // seq[15..20] = 'TACGT'
    expect(result.sequence.length).toBe(5);
  });
});

describe('sliceRecordsBySelection – features', () => {
  it('includes features that overlap the selection and rebases their coordinates', () => {
    const record = makeRecord({
      features: [{ type: 'gene', name: 'geneA', start: 12, end: 17, strand: 1 }],
    });
    const [result] = sliceRecordsBySelection([record], 10, 20);
    expect(result.features).toHaveLength(1);
    expect(result.features[0]).toMatchObject({ start: 2, end: 7 });
  });

  it('excludes features that end exactly at the selection start', () => {
    const record = makeRecord({
      features: [{ type: 'gene', name: 'geneA', start: 0, end: 10, strand: 1 }],
    });
    const [result] = sliceRecordsBySelection([record], 10, 20);
    expect(result.features).toHaveLength(0);
  });

  it('excludes features that start exactly at the selection end', () => {
    const record = makeRecord({
      features: [{ type: 'gene', name: 'geneA', start: 20, end: 30, strand: 1 }],
    });
    const [result] = sliceRecordsBySelection([record], 10, 20);
    expect(result.features).toHaveLength(0);
  });

  it('clips a left-overlapping feature to the selection start', () => {
    const record = makeRecord({
      features: [{ type: 'gene', name: 'geneA', start: 5, end: 15, strand: 1 }],
    });
    const [result] = sliceRecordsBySelection([record], 10, 20);
    expect(result.features[0]).toMatchObject({ start: 0, end: 5 });
  });

  it('clips a right-overlapping feature to the selection end', () => {
    const record = makeRecord({
      features: [{ type: 'gene', name: 'geneA', start: 15, end: 25, strand: 1 }],
    });
    const [result] = sliceRecordsBySelection([record], 10, 20);
    expect(result.features[0]).toMatchObject({ start: 5, end: 10 });
  });

  it('rebases feature segments when present', () => {
    const record = makeRecord({
      features: [
        {
          type: 'mRNA',
          name: 'mrnaA',
          start: 10,
          end: 20,
          strand: 1,
          segments: [
            { start: 10, end: 13 },
            { start: 16, end: 20 },
          ],
        },
      ],
    });
    const [result] = sliceRecordsBySelection([record], 10, 20);
    expect(result.features).toHaveLength(1);
    expect(result.features[0].segments).toEqual([
      { start: 0, end: 3 },
      { start: 6, end: 10 },
    ]);
  });

  it('excludes segments that fall outside the selection window', () => {
    const record = makeRecord({
      features: [
        {
          type: 'mRNA',
          name: 'mrnaA',
          start: 5,
          end: 25,
          strand: 1,
          segments: [
            { start: 5, end: 8 },  // before selection
            { start: 12, end: 18 }, // inside
            { start: 22, end: 25 }, // after selection
          ],
        },
      ],
    });
    const [result] = sliceRecordsBySelection([record], 10, 20);
    expect(result.features[0].segments).toHaveLength(1);
    expect(result.features[0].segments![0]).toEqual({ start: 2, end: 8 });
  });

  it('removes a feature whose segments all fall outside the selection (but outer interval overlaps)', () => {
    // Outer feature overlaps [10,20), but all its sub-segments are outside
    // In this case the feature outer coords will still be clipped/kept;
    // only segments list is emptied (set to undefined). The feature is kept
    // because its outer interval overlaps.
    const record = makeRecord({
      features: [
        {
          type: 'mRNA',
          name: 'mrnaA',
          start: 8,
          end: 12,
          strand: 1,
          segments: [
            { start: 8, end: 10 }, // ends at selection start — excluded
          ],
        },
      ],
    });
    const [result] = sliceRecordsBySelection([record], 10, 20);
    // Outer interval [8,12) overlaps [10,20), so feature is kept
    expect(result.features).toHaveLength(1);
    // The single segment ends at 10 (selection start), so it's excluded → segments undefined
    expect(result.features[0].segments).toBeUndefined();
  });
});

describe('sliceRecordsBySelection – tracks', () => {
  it('clips and rebases track intervals that overlap the selection', () => {
    const record = makeRecord({
      tracks: [
        {
          id: 't1',
          name: 'Track 1',
          data: [
            { start: 5, end: 15, value: 1.0 },
            { start: 12, end: 18, value: 2.0 },
          ],
        },
      ],
    });
    const [result] = sliceRecordsBySelection([record], 10, 20);
    const data = result.tracks![0].data;
    expect(data).toHaveLength(2);
    expect(data[0]).toMatchObject({ start: 0, end: 5, value: 1.0 });
    expect(data[1]).toMatchObject({ start: 2, end: 8, value: 2.0 });
  });

  it('excludes track intervals that do not overlap the selection', () => {
    const record = makeRecord({
      tracks: [
        {
          id: 't1',
          name: 'Track 1',
          data: [
            { start: 0, end: 10, value: 1.0 }, // ends exactly at selection start
            { start: 20, end: 30, value: 2.0 }, // starts exactly at selection end
          ],
        },
      ],
    });
    const [result] = sliceRecordsBySelection([record], 10, 20);
    expect(result.tracks![0].data).toHaveLength(0);
  });

  it('preserves other track metadata when slicing', () => {
    const record = makeRecord({
      tracks: [
        {
          id: 't2',
          name: 'CpG Islands',
          kind: 'interval',
          color: '#ff0000',
          data: [{ start: 10, end: 15, value: 5.0 }],
        },
      ],
    });
    const [result] = sliceRecordsBySelection([record], 10, 20);
    const track = result.tracks![0];
    expect(track.id).toBe('t2');
    expect(track.name).toBe('CpG Islands');
    expect(track.kind).toBe('interval');
    expect(track.color).toBe('#ff0000');
  });
});

describe('sliceRecordsBySelection – output structure', () => {
  it('includes all expected fields in the result', () => {
    const record = makeRecord({ definition: 'Test sequence', isCircular: false });
    const [result] = sliceRecordsBySelection([record], 5, 10);
    expect(result.id).toBe('rec1');
    expect(result.name).toBe('Record 1');
    expect(result.definition).toBe('Test sequence');
    expect(result.isCircular).toBe(false);
    expect(result.alignedSequence).toBeUndefined();
  });

  it('processes multiple records independently', () => {
    const records = [
      makeRecord({ id: 'r1', sequence: 'AAAAAAAAAA' }),
      makeRecord({ id: 'r2', sequence: 'CCCCCCCCCC' }),
    ];
    const result = sliceRecordsBySelection(records, 2, 7);
    expect(result).toHaveLength(2);
    expect(result[0].sequence).toBe('AAAAA');
    expect(result[1].sequence).toBe('CCCCC');
  });
});

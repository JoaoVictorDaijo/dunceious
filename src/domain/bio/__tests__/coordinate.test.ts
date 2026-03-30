import { describe, it, expect } from 'vitest';
import { transposeCoordinates, buildAlignedSegments, processTransposition } from '../coordinate';
import type { SeqRecord } from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRecord(id: string, sequence: string, alignedSequence?: string): SeqRecord {
  return { id, name: id, sequence, features: [], alignedSequence };
}

// ---------------------------------------------------------------------------
// transposeCoordinates
// ---------------------------------------------------------------------------

describe('transposeCoordinates', () => {
  it('returns 0 for position 0 in a gapless sequence', () => {
    expect(transposeCoordinates(0, 'ACGT')).toBe(0);
  });

  it('maps correctly in a gapless sequence', () => {
    expect(transposeCoordinates(3, 'ACGT')).toBe(3);
  });

  it('accounts for leading gaps', () => {
    // '--ACGT': ungappedCount first equals 1 at aligned index 3 ('C')
    expect(transposeCoordinates(1, '--ACGT')).toBe(3);
  });

  it('accounts for internal gaps past the gap region', () => {
    // 'AC--GT': 4 non-gap chars; ungappedCount reaches 4 at aligned index 6
    expect(transposeCoordinates(4, 'AC--GT')).toBe(6);
  });

  it('returns alignedSeq.length when position equals sequence length', () => {
    expect(transposeCoordinates(4, 'ACGT')).toBe(4);
  });

  it('returns alignedSeq.length for a position beyond the sequence', () => {
    expect(transposeCoordinates(10, 'ACGT')).toBe(4);
  });

  it('returns 0 for an empty aligned sequence', () => {
    expect(transposeCoordinates(0, '')).toBe(0);
  });

  it('returns 0 for position 0 even in an all-gap aligned sequence', () => {
    // ungappedCount starts at 0 === originalPos(0), so index 0 is returned immediately
    expect(transposeCoordinates(0, '----')).toBe(0);
  });

  it('returns alignedSeq.length for position 1 in an all-gap aligned sequence', () => {
    // ungappedCount never reaches 1 → falls through to return length(4)
    expect(transposeCoordinates(1, '----')).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// buildAlignedSegments
// ---------------------------------------------------------------------------

describe('buildAlignedSegments', () => {
  it('returns a single segment when there are no internal gaps', () => {
    expect(buildAlignedSegments('ACGTACGT', 0, 4)).toEqual([{ start: 0, end: 4 }]);
  });

  it('returns two segments when there is an internal gap', () => {
    // 'AC--GT': positions 0-5; window [0,6)
    expect(buildAlignedSegments('AC--GT', 0, 6)).toEqual([
      { start: 0, end: 2 },
      { start: 4, end: 6 },
    ]);
  });

  it('returns an empty array for an all-gap window', () => {
    expect(buildAlignedSegments('----', 0, 4)).toEqual([]);
  });

  it('respects the window boundaries', () => {
    // 'ACGTACGT': only look at window [2,6)
    expect(buildAlignedSegments('ACGTACGT', 2, 6)).toEqual([{ start: 2, end: 6 }]);
  });

  it('handles trailing non-gap character properly', () => {
    // 'A-B': window [0,3): produces [0,1] and [2,3]
    expect(buildAlignedSegments('A-B', 0, 3)).toEqual([
      { start: 0, end: 1 },
      { start: 2, end: 3 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// processTransposition
// ---------------------------------------------------------------------------

describe('processTransposition', () => {
  it('returns record unchanged when alignedSequence is absent', () => {
    const record = makeRecord('r1', 'ACGTACGT');
    record.features = [{ type: 'gene', name: 'g1', start: 0, end: 4, strand: 1 }];
    const [result] = processTransposition([record]);
    expect(result.features[0].start).toBe(0);
    expect(result.features[0].end).toBe(4);
  });

  it('leaves coordinates unchanged for a gapless alignment', () => {
    const record = makeRecord('r1', 'ACGTACGT', 'ACGTACGT');
    record.features = [{ type: 'gene', name: 'g1', start: 0, end: 4, strand: 1 }];
    const [result] = processTransposition([record]);
    expect(result.features[0].start).toBe(0);
    expect(result.features[0].end).toBe(4);
  });

  it('shifts feature boundaries when leading gaps precede them', () => {
    // '--ACGTACGT': raw pos 0→aligned 0, raw pos 2→aligned 4
    const record = makeRecord('r1', 'ACGTACGT', '--ACGTACGT');
    record.features = [{ type: 'gene', name: 'g1', start: 0, end: 2, strand: 1 }];
    const [result] = processTransposition([record]);
    expect(result.features[0].start).toBe(0);
    expect(result.features[0].end).toBe(4);
  });

  it('splits a feature into sub-segments around internal gaps', () => {
    // 'AC--GTACGT': feature [0,4) → aligned [0,6); gap at [2,4) → segments [0,2) and [4,6)
    const record = makeRecord('r1', 'ACGTACGT', 'AC--GTACGT');
    record.features = [{ type: 'gene', name: 'g1', start: 0, end: 4, strand: 1 }];
    const [result] = processTransposition([record]);
    expect(result.features[0].segments).toEqual([
      { start: 0, end: 2 },
      { start: 4, end: 6 },
    ]);
  });

  it('produces a single segment when no internal gaps exist in the feature range', () => {
    const record = makeRecord('r1', 'ACGT', 'ACGT----');
    record.features = [{ type: 'gene', name: 'g1', start: 0, end: 4, strand: 1 }];
    const [result] = processTransposition([record]);
    expect(result.features[0].segments).toEqual([{ start: 0, end: 4 }]);
  });

  it('handles wrap-around features (start > end) on circular sequences', () => {
    // Sequence of length 6, wrap-around feature: [4, 2)
    // Gapless alignment: start stays 4, end stays 2
    const record = makeRecord('r1', 'ACGTAC', 'ACGTAC');
    record.features = [{ type: 'gene', name: 'wrap', start: 4, end: 2, strand: 1 }];
    const [result] = processTransposition([record]);
    // Overall start/end in aligned coords
    expect(result.features[0].start).toBe(4);
    expect(result.features[0].end).toBe(2);
    // segments cover [4,6) and [0,2)
    expect(result.features[0].segments).toEqual([
      { start: 4, end: 6 },
      { start: 0, end: 2 },
    ]);
  });

  it('returns empty features array unchanged', () => {
    const record = makeRecord('r1', 'ACGT', 'ACGT');
    const [result] = processTransposition([record]);
    expect(result.features).toEqual([]);
  });

  it('processes multiple records independently', () => {
    const r1 = makeRecord('r1', 'ACGT', '--ACGT');
    r1.features = [{ type: 'gene', name: 'g1', start: 0, end: 2, strand: 1 }];
    const r2 = makeRecord('r2', 'ACGT', 'ACGT');
    r2.features = [{ type: 'gene', name: 'g2', start: 0, end: 2, strand: 1 }];
    const [out1, out2] = processTransposition([r1, r2]);
    expect(out1.features[0].start).toBe(0);
    expect(out1.features[0].end).toBe(4);
    expect(out2.features[0].start).toBe(0);
    expect(out2.features[0].end).toBe(2);
  });
});

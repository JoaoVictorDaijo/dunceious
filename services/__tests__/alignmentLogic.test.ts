import { describe, it, expect } from 'vitest';
import {
  transposeCoordinates,
  processTransposition,
  calculateConsensus,
  mockAlign,
} from '../alignmentLogic';
import type { SeqRecord } from '../../types';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeRecord(id: string, sequence: string, alignedSequence?: string): SeqRecord {
  return { id, name: id, sequence, features: [], alignedSequence };
}

// ---------------------------------------------------------------------------
// transposeCoordinates – maps raw positions into aligned (gapped) positions
// ---------------------------------------------------------------------------

describe('transposeCoordinates', () => {
  it('returns 0 for position 0 in a gapless sequence', () => {
    expect(transposeCoordinates(0, 'ACGT')).toBe(0);
  });

  it('maps correctly when there are no gaps', () => {
    expect(transposeCoordinates(3, 'ACGT')).toBe(3);
  });

  it('accounts for leading gaps when mapping non-zero positions', () => {
    // '--ACGT': ungappedCount first equals 1 at aligned index 3 (the 'C')
    expect(transposeCoordinates(1, '--ACGT')).toBe(3);
  });

  it('accounts for internal gaps when mapping positions past the gap', () => {
    // 'AC--GT': 4 ungapped chars; ungappedCount first equals 4 at aligned index 6
    expect(transposeCoordinates(4, 'AC--GT')).toBe(6);
  });

  it('returns alignedSeq.length when position equals sequence length', () => {
    // 'ACGT' has 4 non-gap chars; pos 4 should return 4
    expect(transposeCoordinates(4, 'ACGT')).toBe(4);
  });

  it('returns alignedSeq.length for a position beyond the sequence', () => {
    expect(transposeCoordinates(10, 'ACGT')).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// calculateConsensus – majority-vote consensus over aligned records
// ---------------------------------------------------------------------------

describe('calculateConsensus', () => {
  it('returns empty string for no records', () => {
    expect(calculateConsensus([])).toBe('');
  });

  it('returns empty string when no record has an alignedSequence', () => {
    expect(calculateConsensus([makeRecord('r1', 'ACGT')])).toBe('');
  });

  it('returns the sequence itself for a single aligned record', () => {
    const record = makeRecord('r1', 'ACGT', 'ACGT');
    expect(calculateConsensus([record])).toBe('ACGT');
  });

  it('picks the majority base at each position', () => {
    const r1 = makeRecord('r1', 'AAA', 'AAA');
    const r2 = makeRecord('r2', 'AAC', 'AAC');
    const r3 = makeRecord('r3', 'AAC', 'AAC');
    // position 2: A(1) vs C(2) → C wins
    expect(calculateConsensus([r1, r2, r3])).toBe('AAC');
  });

  it('handles gap characters in the alignment', () => {
    const r1 = makeRecord('r1', 'A', 'A-C');
    const r2 = makeRecord('r2', 'A', 'A-C');
    // Both records contribute '-' at position 1
    const consensus = calculateConsensus([r1, r2]);
    expect(consensus[1]).toBe('-');
  });
});

// ---------------------------------------------------------------------------
// mockAlign – produces aligned sequences with correct length and composition
// ---------------------------------------------------------------------------

describe('mockAlign – smoke test', () => {
  it('returns empty array for empty input', () => {
    expect(mockAlign([])).toHaveLength(0);
  });

  it('returns the same number of records', () => {
    const records = [
      makeRecord('r1', 'ACGTACGT'),
      makeRecord('r2', 'ACGTACGT'),
    ];
    expect(mockAlign(records)).toHaveLength(2);
  });

  it('sets alignedSequence on every output record', () => {
    const records = [makeRecord('r1', 'ACGTACGT')];
    const [aligned] = mockAlign(records);
    expect(aligned.alignedSequence).toBeDefined();
    expect(aligned.alignedSequence!.length).toBeGreaterThan(0);
  });

  it('aligned sequence is at least as long as the original', () => {
    const seq = 'ACGTACGTACGT';
    const [aligned] = mockAlign([makeRecord('r1', seq)]);
    expect(aligned.alignedSequence!.length).toBeGreaterThanOrEqual(seq.length);
  });

  it('non-gap characters in aligned sequence equal the original sequence', () => {
    const seq = 'ACGTACGT';
    const [aligned] = mockAlign([makeRecord('r1', seq)]);
    const nonGap = aligned.alignedSequence!.replace(/-/g, '');
    expect(nonGap).toBe(seq);
  });

  it('does not mutate input records', () => {
    const original = makeRecord('r1', 'ACGTACGT');
    const copy = { ...original };
    mockAlign([original]);
    expect(original.alignedSequence).toBeUndefined();
    expect(original.sequence).toBe(copy.sequence);
  });
});

// ---------------------------------------------------------------------------
// processTransposition – re-maps features into aligned coordinate space
// ---------------------------------------------------------------------------

describe('processTransposition', () => {
  it('returns record unchanged when alignedSequence is absent', () => {
    const record = makeRecord('r1', 'ACGTACGT');
    record.features = [{ type: 'gene', name: 'g1', start: 0, end: 4, strand: 1 }];
    const [result] = processTransposition([record]);
    expect(result.features[0].start).toBe(0);
    expect(result.features[0].end).toBe(4);
  });

  it('transposes feature coordinates when alignedSequence is present', () => {
    // gapless alignment: positions stay the same
    const record = makeRecord('r1', 'ACGTACGT', 'ACGTACGT');
    record.features = [{ type: 'gene', name: 'g1', start: 0, end: 4, strand: 1 }];
    const [result] = processTransposition([record]);
    expect(result.features[0].start).toBe(0);
    expect(result.features[0].end).toBe(4);
  });

  it('shifts feature boundaries when gaps precede them in the aligned sequence', () => {
    // '--ACGTACGT': raw pos 0→aligned 0, raw pos 2→aligned 4
    const record = makeRecord('r1', 'ACGTACGT', '--ACGTACGT');
    record.features = [{ type: 'gene', name: 'g1', start: 0, end: 2, strand: 1 }];
    const [result] = processTransposition([record]);
    // transposeCoordinates(0, '--ACGTACGT') = 0
    expect(result.features[0].start).toBe(0);
    // transposeCoordinates(2, '--ACGTACGT') = 4
    expect(result.features[0].end).toBe(4);
  });

  it('splits a feature into sub-segments around internal gaps in the aligned sequence', () => {
    // Aligned: 'AC--GTACGT' (8 real bases, gap at positions 2-3)
    // Feature covers raw [0, 4) which aligns to [0, 6)
    // Sub-segments must skip the '--': [0,2) and [4,6)
    const record = makeRecord('r1', 'ACGTACGT', 'AC--GTACGT');
    record.features = [{ type: 'gene', name: 'g1', start: 0, end: 4, strand: 1 }];
    const [result] = processTransposition([record]);
    expect(result.features[0].segments).toEqual([
      { start: 0, end: 2 },
      { start: 4, end: 6 },
    ]);
  });

  it('produces a single segment when the aligned region has no internal gaps', () => {
    // Gaps only after the feature: 'ACGT----' (4 real bases)
    // Feature [0,4) → aligned [0,4), no gaps inside → one segment
    const record = makeRecord('r1', 'ACGT', 'ACGT----');
    record.features = [{ type: 'gene', name: 'g1', start: 0, end: 4, strand: 1 }];
    const [result] = processTransposition([record]);
    expect(result.features[0].segments).toEqual([{ start: 0, end: 4 }]);
  });
});

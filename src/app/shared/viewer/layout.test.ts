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
import { ANNOT_BAR_HEIGHT, ANNOT_BASES_HEIGHT, ANNOT_LANE_GAP } from './constants';

const LANE = ANNOT_BAR_HEIGHT + ANNOT_LANE_GAP;
import { computeRecordLayouts } from './layout';
import type { SeqRecord } from '@/src/domain/bio/types';

const ALL = { showAnnotations: true, translationVisible: true, showTracks: true };
function rec(o: Partial<SeqRecord> & Pick<SeqRecord, 'id' | 'sequence'>): SeqRecord {
  return { name: o.id, features: [], ...o } as SeqRecord;
}

describe('computeRecordLayouts', () => {
  it('returns [] for no records', () => {
    expect(computeRecordLayouts([], ALL)).toEqual([]);
  });

  it('packs features > buffer apart into one lane', () => {
    const r = rec({ id: 'r', sequence: 'A'.repeat(100), features: [
      { type: 'gene', name: 'a', start: 0, end: 10, strand: 1 },
      { type: 'gene', name: 'b', start: 25, end: 35, strand: 1 },
    ] });
    const [l] = computeRecordLayouts([r], ALL);
    expect(l.placements.map(p => p.row)).toEqual([0, 0]);
    expect(l.annotHeight).toBe(LANE); // one lane
  });

  it('pushes features within the 10-bp buffer to a new lane', () => {
    const r = rec({ id: 'r', sequence: 'A'.repeat(100), features: [
      { type: 'gene', name: 'a', start: 0, end: 10, strand: 1 },
      { type: 'gene', name: 'b', start: 15, end: 25, strand: 1 },
    ] });
    const [l] = computeRecordLayouts([r], ALL);
    expect(l.placements.map(p => p.row)).toEqual([0, 1]);
    expect(l.annotHeight).toBe(2 * LANE);
    expect(l.laneTops).toEqual([0, LANE]);
  });

  it('grows only the lane holding a feature whose bases are switched on, and only while legible', () => {
    const r = rec({ id: 'r', sequence: 'A'.repeat(100), features: [
      { type: 'gene', name: 'a', start: 0, end: 10, strand: 1, metadata: { _showBases: '1' } },
      { type: 'gene', name: 'b', start: 5, end: 25, strand: 1 },
    ] });
    expect(computeRecordLayouts([r], ALL)[0].laneHeights).toEqual([ANNOT_BAR_HEIGHT, ANNOT_BAR_HEIGHT]);
    const [l] = computeRecordLayouts([r], { ...ALL, basesVisible: true });
    expect(l.laneHeights).toEqual([ANNOT_BAR_HEIGHT + ANNOT_BASES_HEIGHT, ANNOT_BAR_HEIGHT]);
    expect(l.laneTops).toEqual([0, ANNOT_BAR_HEIGHT + ANNOT_BASES_HEIGHT + ANNOT_LANE_GAP]);
    expect(l.annotHeight).toBe(2 * LANE + ANNOT_BASES_HEIGHT);
  });

  it('keeps placements but zeroes annotHeight when showAnnotations is false', () => {
    const r = rec({ id: 'r', sequence: 'A'.repeat(50), features: [
      { type: 'gene', name: 'a', start: 0, end: 10, strand: 1 },
    ] });
    const [l] = computeRecordLayouts([r], { ...ALL, showAnnotations: false });
    expect(l.placements).toHaveLength(1);
    expect(l.annotHeight).toBe(0);
    expect(l.topPadding).toBe(0);
  });

  it('packs a wrap-around feature (start > end) as two intervals in one lane', () => {
    const r = rec({ id: 'r', sequence: 'A'.repeat(100), features: [
      { type: 'gene', name: 'wrap', start: 90, end: 10, strand: 1 },
    ] });
    const [l] = computeRecordLayouts([r], ALL);
    expect(l.placements).toEqual([{ feature: r.features[0], row: 0 }]);
    expect(l.annotHeight).toBe(LANE);
  });

  it('gives line tracks height 80 and accumulates quantHeight with 12-px spacing', () => {
    const r = rec({ id: 'r', sequence: 'A'.repeat(100),
      tracks: [{ id: 't', name: 't', kind: 'line', data: [{ start: 0, end: 5, value: 1 }] }] });
    const [l] = computeRecordLayouts([r], ALL);
    expect(l.trackLayouts[0]).toMatchObject({ height: 80, top: 0, packedRows: [] });
    expect(l.quantHeight).toBe(80 + 12);
  });

  it('packs overlapping interval-track data into lanes and sizes height', () => {
    const r = rec({ id: 'r', sequence: 'A'.repeat(100), tracks: [{
      id: 't', name: 't', kind: 'interval',
      data: [{ start: 0, end: 40, value: 1 }, { start: 10, end: 50, value: 2 }],
    }] });
    const [l] = computeRecordLayouts([r], ALL);
    expect(l.trackLayouts[0].packedRows).toHaveLength(2);
    expect(l.trackLayouts[0].height).toBe(Math.max(80, 2 * 16 + 10));
  });

  it('zeroes quantHeight when showTracks is false', () => {
    const r = rec({ id: 'r', sequence: 'A'.repeat(100),
      tracks: [{ id: 't', name: 't', kind: 'line', data: [] }] });
    const [l] = computeRecordLayouts([r], { ...ALL, showTracks: false });
    expect(l.quantHeight).toBe(0);
  });

  it('applies the translation band only for non-protein records', () => {
    const features = [{ type: 'CDS', name: 'c', start: 0, end: 3, strand: 1 as const }];
    const dna = computeRecordLayouts([rec({ id: 'd', sequence: 'ACGT', moleculeType: 'dna', features })], { ...ALL, showAnnotations: false })[0];
    const pro = computeRecordLayouts([rec({ id: 'p', sequence: 'MKV', moleculeType: 'protein', features })], { ...ALL, showAnnotations: false })[0];
    // One forward lane above the bases, no reverse lane below.
    expect(dna.seqBaseY).toBe(18);
    expect(dna.height).toBe(18 + 22 + 20);
    expect(pro.seqBaseY).toBe(0);
    expect(pro.height).toBe(22 + 20);
  });
});


it('packs a circular aligned feature using the aligned coordinate length', () => {
  const record = rec({ id: 'synthetic', sequence: 'AACGTACGTA', alignedSequence: '-----AACGT-----ACGTA-', features: [
    { name: 'wrap', type: 'primer', start: 15, end: 2, strand: 1 },
    { name: 'overlap', type: 'misc_feature', start: 17, end: 19, strand: -1 },
  ] });
  const [layout] = computeRecordLayouts([record], ALL);
  expect(layout.placements.map(p => p.row)).toEqual([0, 1]);
});


describe('translation row visibility', () => {
  const coding = [
    { type: 'CDS', name: 'f0', start: 0, end: 30, strand: 1 as const },
    { type: 'CDS', name: 'f1', start: 10, end: 40, strand: 1 as const },
    { type: 'CDS', name: 'r', start: 0, end: 30, strand: -1 as const },
  ];
  const opts = { showAnnotations: false, translationVisible: true, showTracks: false };

  it.each([false, true])('reserves rows only for effective visibility %s', (translationVisible) => {
    const [layout] = computeRecordLayouts([rec({ id: 'dna', sequence: 'A'.repeat(60), features: coding })], { ...opts, translationVisible });
    expect(layout.seqBaseY).toBe(translationVisible ? 2 * 18 : 0);
    expect(layout.height).toBe(translationVisible ? 3 * 18 + 42 : 42);
    expect(layout.translationVisible).toBe(translationVisible);
  });

  it('reserves no rows for a record without coding features', () => {
    const [layout] = computeRecordLayouts([rec({ id: 'dna', sequence: 'ATG' })], opts);
    expect(layout).toMatchObject({ translationVisible: true, seqBaseY: 0, height: 42 });
  });

  it('keeps the lanes after hiding so the closing fade keeps its rows', () => {
    const record = rec({ id: 'dna', sequence: 'A'.repeat(60), features: coding });
    computeRecordLayouts([record], opts);
    const [hidden] = computeRecordLayouts([record], { ...opts, translationVisible: false });
    expect(hidden).toMatchObject({ seqBaseY: 0, height: 42, translationLanes: { forward: 2, reverse: 1 } });
  });

  it('rejects translation visibility for a protein record', () => {
    const [layout] = computeRecordLayouts([rec({ id: 'protein', sequence: 'MPE', moleculeType: 'protein' })], ALL);
    expect(layout).toMatchObject({ translationVisible: false, seqBaseY: 0, height: 42 });
  });
});

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
import { computeRecordLayouts } from './layout';
import type { SeqRecord } from '@/src/domain/bio/types';

const ALL = { showAnnotations: true, showTranslation: true, showTracks: true };
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
    expect(l.annotHeight).toBe(1 * (14 + 6)); // one lane
  });

  it('pushes features within the 10-bp buffer to a new lane', () => {
    const r = rec({ id: 'r', sequence: 'A'.repeat(100), features: [
      { type: 'gene', name: 'a', start: 0, end: 10, strand: 1 },
      { type: 'gene', name: 'b', start: 15, end: 25, strand: 1 },
    ] });
    const [l] = computeRecordLayouts([r], ALL);
    expect(l.placements.map(p => p.row)).toEqual([0, 1]);
    expect(l.annotHeight).toBe(2 * 20);
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
    expect(l.annotHeight).toBe(20);
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
    const dna = computeRecordLayouts([rec({ id: 'd', sequence: 'ACGT', moleculeType: 'dna' })], ALL)[0];
    const pro = computeRecordLayouts([rec({ id: 'p', sequence: 'MKV', moleculeType: 'protein' })], ALL)[0];
    // seqBaseY = 0 + 0 + 0 + (effectiveTranslation ? 18*3 : 0)
    expect(dna.seqBaseY).toBe(18 * 3);
    expect(dna.height).toBe(18 * 3 + 18 * 3 + 22 + 20);
    expect(pro.seqBaseY).toBe(0);
    expect(pro.height).toBe(22 + 20);
  });
});

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
import {
  saveEditedFeature,
  removeFeature,
  toggleRecordVisibility,
  newFeatureFromSelection,
  annotationCoords,
} from '../featureManager';
import type { SeqRecord, BioFeature } from '@/src/domain/bio/types';

const feat = (o: Partial<BioFeature> & { name: string }): BioFeature => ({
  type: 'misc_feature', start: 0, end: 5, strand: 1, ...o,
});
const rec = (o: Partial<SeqRecord> & { id: string }): SeqRecord => ({
  name: o.id, sequence: '', features: [], ...o,
});

describe('saveEditedFeature', () => {
  it('appends when featureIndex is -1', () => {
    const recs = [rec({ id: 'r1', features: [feat({ name: 'a' })] })];
    expect(saveEditedFeature(recs, 'r1', -1, feat({ name: 'b' }))[0].features.map(f => f.name)).toEqual(['a', 'b']);
  });
  it('replaces at the given index', () => {
    const recs = [rec({ id: 'r1', features: [feat({ name: 'a' })] })];
    expect(saveEditedFeature(recs, 'r1', 0, feat({ name: 'z' }))[0].features.map(f => f.name)).toEqual(['z']);
  });
  it('leaves non-matching records untouched (same reference)', () => {
    const recs = [rec({ id: 'r1', features: [] }), rec({ id: 'r2', features: [] })];
    expect(saveEditedFeature(recs, 'r1', -1, feat({ name: 'x' }))[1]).toBe(recs[1]);
  });
});

describe('removeFeature', () => {
  it('splices the feature and reports its name', () => {
    const recs = [rec({ id: 'r1', features: [feat({ name: 'a' }), feat({ name: 'b' })] })];
    const { next, removedName } = removeFeature(recs, 'r1', 0);
    expect(next[0].features.map(f => f.name)).toEqual(['b']);
    expect(removedName).toBe('a');
  });
  it('reports undefined for an out-of-range index (no throw)', () => {
    const recs = [rec({ id: 'r1', features: [feat({ name: 'a' })] })];
    const { next, removedName } = removeFeature(recs, 'r1', 9);
    expect(next[0].features.map(f => f.name)).toEqual(['a']);
    expect(removedName).toBeUndefined();
  });
});

describe('toggleRecordVisibility', () => {
  it('flips an explicit true to false', () => {
    expect(toggleRecordVisibility([rec({ id: 'r1', visible: true })], 'r1')[0].visible).toBe(false);
  });
  it('hides a record whose visibility is implicitly true', () => {
    expect(toggleRecordVisibility([rec({ id: 'r1' })], 'r1')[0].visible).toBe(false);
  });
});

describe('newFeatureFromSelection', () => {
  it('returns null for no records', () => {
    expect(newFeatureFromSelection([], { recordIds: ['r1'], start: 0, end: 2 })).toBeNull();
  });
  it('defaults to 0..100 on the first record when there is no selection', () => {
    expect(newFeatureFromSelection([rec({ id: 'r1', sequence: 'ACGT' })], null)).toEqual({ targetRecordId: 'r1', start: 0, end: 100 });
  });
  it('maps a reversed selection to original coordinates via min/max', () => {
    // aligned 'A-CG-TAC': getOriginalPos(2)=1, getOriginalPos(5)=3
    const recs = [rec({ id: 'r1', sequence: 'ACGTAC', alignedSequence: 'A-CG-TAC' })];
    expect(newFeatureFromSelection(recs, { recordIds: ['r1'], start: 5, end: 2 })).toEqual({ targetRecordId: 'r1', start: 1, end: 3 });
  });
  it('falls back to default start=0/end=100 (still returning the named recordId) when it names a record not in records', () => {
    const recs = [rec({ id: 'r1', sequence: 'ACGT' })];
    expect(newFeatureFromSelection(recs, { recordIds: ['ghost'], start: 0, end: 2 })).toEqual({
      targetRecordId: 'ghost', start: 0, end: 100,
    });
  });
  it('falls back to records[0].id when recordIds[0] is empty/falsy', () => {
    const recs = [rec({ id: 'r1', sequence: 'ACGT' })];
    expect(newFeatureFromSelection(recs, { recordIds: [''], start: 0, end: 2 })).toEqual({
      targetRecordId: 'r1', start: 0, end: 2,
    });
  });
});

describe('annotationCoords', () => {
  it('passes coordinates through unchanged when the record is missing', () => {
    expect(annotationCoords(undefined, 3, 6)).toEqual({ start: 3, end: 6, segments: undefined });
  });
  it('converts aligned to original coordinates and sorts converted segments', () => {
    // aligned 'A-CG-T': getOriginalPos(2)=1, getOriginalPos(5)=3, getOriginalPos(4)=3, getOriginalPos(6)=4
    const record = rec({ id: 'r1', sequence: 'ACGT', alignedSequence: 'A-CG-T' });
    expect(annotationCoords(record, 2, 5, [{ start: 4, end: 6 }])).toEqual({
      start: 1, end: 3, segments: [{ start: 3, end: 4 }],
    });
  });
  it('sorts an out-of-order 2+ segment array ascending by converted start', () => {
    // aligned 'A-CG-TAC' (len 8): getOriginalPos(0)=0, (2)=1, (4)=3, (6)=4, (8)=6
    // segments [{4,6},{0,2}] convert to [{3,4},{0,1}] (input order) then sort -> [{0,1},{3,4}]
    const record = rec({ id: 'r1', sequence: 'ACGTAC', alignedSequence: 'A-CG-TAC' });
    expect(annotationCoords(record, 0, 8, [{ start: 4, end: 6 }, { start: 0, end: 2 }])).toEqual({
      start: 0, end: 6, segments: [{ start: 0, end: 1 }, { start: 3, end: 4 }],
    });
  });
});

it('marks inserted and edited annotations as edited', () => {
  const input = [rec({ id: 'r1', features: [feat({ name: 'a' })] })];
  expect(saveEditedFeature(input, 'r1', -1, feat({ name: 'b' }))[0].annotationsEdited).toBe(true);
  expect(saveEditedFeature(input, 'r1', 0, feat({ name: 'edited' }))[0].annotationsEdited).toBe(true);
});

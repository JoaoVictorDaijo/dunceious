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
  groupFeaturesBySearch,
  buildFlattenedFeatures,
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
  it('treats undefined visibility as flipping to true', () => {
    expect(toggleRecordVisibility([rec({ id: 'r1' })], 'r1')[0].visible).toBe(true);
  });
});

describe('groupFeaturesBySearch', () => {
  it('attaches the original index and filters case-insensitively by name', () => {
    const recs = [rec({ id: 'r1', features: [feat({ name: 'GeneAlpha' }), feat({ name: 'other' })] })];
    const out = groupFeaturesBySearch(recs, 'alpha');
    expect(out.r1.map(f => ({ name: f.name, index: f.index }))).toEqual([{ name: 'GeneAlpha', index: 0 }]);
  });
  it('matches on type, definition, and metadata values', () => {
    const recs = [rec({ id: 'r1', definition: 'plasmid', features: [feat({ name: 'x', metadata: { note: 'HELLO' } })] })];
    expect(groupFeaturesBySearch(recs, 'plasmid').r1).toHaveLength(1); // via definition
    expect(groupFeaturesBySearch(recs, 'hello').r1).toHaveLength(1);   // via metadata (case-insensitive)
  });
});

describe('buildFlattenedFeatures', () => {
  it('orders header, then tracks, then features; header count = features + tracks', () => {
    const recs = [rec({ id: 'r1', features: [feat({ name: 'g1' }), feat({ name: 'g2' })], tracks: [{ id: 't1', name: 'trk', data: [] }] })];
    const out = buildFlattenedFeatures(recs, '');
    expect(out.map(i => i.type)).toEqual(['header', 'track', 'feature', 'feature']);
    expect(out[0]).toMatchObject({ type: 'header', count: 3 });
  });
  it('drops a record whose features+tracks are empty when a search filter is active', () => {
    const recs = [rec({ id: 'r1', features: [feat({ name: 'x' })], tracks: [] })];
    expect(buildFlattenedFeatures(recs, 'zzz')).toEqual([]);
    expect(buildFlattenedFeatures(recs, '').map(i => i.type)).toEqual(['header', 'feature']);
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
});

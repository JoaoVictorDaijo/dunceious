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

import { describe, it, expect, vi } from 'vitest';
import {
  saveEditedFeature,
  removeFeature,
  toggleRecordVisibility,
  newFeatureFromSelection,
  annotationCoords,
} from '../featureManager';
import { computeRecordLayouts } from '@/src/app/viewer/layout';
import type { SeqRecord, BioFeature } from '@/src/domain/bio/types';

import { parseGFF3, exportToGff3 } from '@/src/core/formats/gff3';
import { exportToGenBank } from '@/src/core/genbank/serialize';
import { parseGenBank } from '@/src/core/genbank';
import { extractCodingSequence } from '@/src/domain/bio/sequence';
import { metadataFromRows, qualifierRows } from '../qualifiers';

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


it('marks new annotations added and keeps that provenance through later edits', () => {
  const original = feat({ name: 'file' });
  const input = [rec({ id: 'r1', features: [original] })];
  const added = saveEditedFeature(input, 'r1', -1, feat({ name: 'new' }));
  expect(added[0].features[1].hubEdit).toBe('added');
  const edited = saveEditedFeature(added, 'r1', 1, feat({ name: 'changed' }));
  expect(edited[0].features[1].hubEdit).toBe('added');
  expect(saveEditedFeature(input, 'r1', 0, feat({ name: 'edit file' }))[0].features[0].hubEdit).toBe('edited');
  expect(original.hubEdit).toBeUndefined();
});


it('synchronizes the envelope after extending an edited segment', () => {
  const original = feat({ name: 'joined', start: 100, end: 200,
    segments: [{ start: 100, end: 130 }, { start: 180, end: 200 }] });
  const edited = { ...original, segments: [{ start: 100, end: 130 }, { start: 180, end: 900 }] };
  const records = [rec({ id: 'r1', sequence: 'A'.repeat(1000), features: [original] })];
  const saved = saveEditedFeature(records, 'r1', 0, edited)[0].features[0];
  expect(saved).toMatchObject({ start: 100, end: 900, segments: edited.segments, hubEdit: 'edited' });
  expect(original.end).toBe(200);
});

it('synchronizes an edited circular join without flattening its wrap', () => {
  const feature = feat({ name: 'origin', start: 80, end: 20,
    segments: [{ start: 70, end: 100 }, { start: 0, end: 30 }] });
  const records = [rec({ id: 'r1', sequence: 'A'.repeat(100), isCircular: true, features: [feature] })];
  expect(saveEditedFeature(records, 'r1', 0, feature)[0].features[0]).toMatchObject({ start: 70, end: 30 });
});
it('does not revive an imported phase after deleting codon_start in the editor', () => {
  const [feature] = parseGFF3('r1\ts\tCDS\t1\t10\t.\t+\t1\tID=c').features.r1;
  const input = [rec({ id: 'r1', sequence: 'AATGAAACCC', features: [feature] })];
  const metadata = metadataFromRows(feature.metadata, qualifierRows(feature.metadata).filter(row => row.key !== 'codon_start'));
  const saved = saveEditedFeature(input, 'r1', 0, { ...feature, metadata });
  const cds = saved[0].features[0];
  expect(extractCodingSequence(cds, saved[0].sequence).codingSeq).toBe('AATGAAACCC');
  const gb = parseGenBank(exportToGenBank(saved).text).records[0];
  const gbCds = gb.features.find(f => f.type === 'CDS')!;
  expect(extractCodingSequence(gbCds, gb.sequence).codingSeq).toBe('AATGAAACCC');
  expect(exportToGff3(saved).text.split('\n').find(line => line.split('\t')[2] === 'CDS')?.split('\t')[7]).toBe('0');
  expect(cds.metadata).not.toHaveProperty('_gffPhases');
  expect(cds.metadata).not.toHaveProperty('phase');
  expect(feature.metadata?.phase).toBe('1');
});

it.each(['start', 'end', 'strand', 'segments'] as const)('invalidates imported phase caches after editing %s', key => {
  const [feature] = parseGFF3('r1\ts\tCDS\t1\t10\t.\t+\t1\tID=c').features.r1;
  const patch: Partial<BioFeature> = key === 'segments' ? { segments: [{ start: 1, end: 10 }] }
    : key === 'strand' ? { strand: -1 } : { [key]: key === 'start' ? 1 : 9 };
  const saved = saveEditedFeature([rec({ id: 'r1', features: [feature] })], 'r1', 0, { ...feature, ...patch })[0].features[0];
  expect(saved.metadata).not.toHaveProperty('phase');
  expect(saved.metadata).not.toHaveProperty('_gffPhases');
  expect(saved.metadata).not.toHaveProperty('_gffPhaseState');
  expect(saved.metadata?.codon_start).toBe('2');
});

it('retains an untouched legacy project phase when saving an unrelated feature name', () => {
  const feature = feat({ type: 'CDS', name: 'legacy', end: 10, metadata: { phase: '1', _gffPhases: '["1"]' } });
  const saved = saveEditedFeature([rec({ id: 'r1', sequence: 'AATGAAACCC', features: [feature] })], 'r1', 0, { ...feature, name: 'renamed' });
  expect(exportToGenBank(saved).text).toContain('/codon_start=2');
  expect(exportToGff3(saved).text.split('\n').find(line => line.split('\t')[2] === 'CDS')?.split('\t')[7]).toBe('1');
});

describe('stored CDS product at save (spec oracle)', () => {
  const coding = (metadata: Record<string, string> = {}): BioFeature => ({ type: 'CDS', name: 'c', start: 0, end: 9, strand: 1, segments: [{ start: 0, end: 9 }], metadata });
  it('stores MK at first save and exports it from the one field', () => {
    const [r] = saveEditedFeature([rec({ id: 'r', sequence: 'ATGAAATAA' })], 'r', -1, coding());
    expect(r.features[0].metadata).toMatchObject({ translation: 'MK', _translationSource: 'computed' });
    expect(r.features[0]).not.toHaveProperty('translation');
    expect(exportToGenBank([r]).text).toContain('/translation="MK"');
    expect(exportToGff3([r]).text).toContain('translation=MK');
  });
  it('removes an internal-stop product after moving, warning at codon 2', () => {
    const f = coding({ translation: 'MK', _translationSource: 'imported' }); const logs: string[] = [];
    const [r] = saveEditedFeature([rec({ id: 'r', sequence: 'ATGAAATAAATGTGATAA', features: [f] })], 'r', 0,
      { ...f, start: 9, end: 18, segments: [{ start: 9, end: 18 }] }, m => logs.push(m));
    expect(r.features[0].metadata?.translation).toBeUndefined();
    expect(r.features[0].metadata?._translationSource).toBe('removed');
    expect(logs).toHaveLength(1); expect(logs[0]).toContain('codon 2');
    expect(exportToGenBank([r]).text).not.toContain('/translation=');
    expect(exportToGenBank([r]).report.translationWarnings).toHaveLength(1);
    expect(exportToGff3([r]).report.translationWarnings[0]).toContain('codon 2');
  });
  it.each(['.', '?'])('known biological orientation invalidates %s even with numeric +1 unchanged', _gffStrand => {
    const f = coding({ translation: 'MV', _translationSource: 'imported', _gffStrand });
    const r = rec({ id: 'r', sequence: 'ATGAAATAA', features: [f] });
    expect(saveEditedFeature([r], 'r', 0, { ...f, name: 'rename' })[0].features[0].metadata?.translation).toBe('MV');
    const metadata = { ...f.metadata }; delete metadata._gffStrand;
    expect(saveEditedFeature([r], 'r', 0, { ...f, metadata })[0].features[0].metadata).toMatchObject({ translation: 'MK', _translationSource: 'computed' });
  });
  it('keeps imported protein data until invalidation and never computes nucleotide residues on protein', () => {
    const f = coding({ translation: 'QQQ', _translationSource: 'imported' });
    const r = rec({ id: 'p', moleculeType: 'protein', sequence: 'GCTAAAGCT', features: [f] });
    expect(saveEditedFeature([r], 'p', 0, { ...f, name: 'rename' })[0].features[0].metadata?.translation).toBe('QQQ');
    const [changed] = saveEditedFeature([r], 'p', 0, { ...f, end: 6, segments: [{ start: 0, end: 6 }] });
    expect(changed.features[0].metadata).toMatchObject({ _translationSource: 'removed' });
    expect(changed.features[0].metadata?.translation).toBeUndefined();
    expect(exportToGff3([changed]).text).not.toContain('translation=');
  });
});

it('recomputes an effective frame and regenerates multipart GFF3 phases', () => {
  const parsed = parseGFF3('r\tx\tCDS\t1\t5\t.\t+\t1\tID=c;translation=MP\nr\tx\tCDS\t9\t13\t.\t+\t2\tID=c;translation=MP');
  const f = parsed.features.r[0];
  const r = rec({ id: 'r', sequence: 'AATGCNNNCCTAA', features: [f] });
  const [changed] = saveEditedFeature([r], 'r', 0, { ...f, metadata: { ...f.metadata, codon_start: '3' } });
  expect(changed.features[0].metadata).toMatchObject({ translation: 'CP', _translationSource: 'computed' });
  const text = exportToGff3([changed]).text;
  expect(text.split('\n').filter(l => l.split('\t')[2] === 'CDS').map(l => l.split('\t')[7])).toEqual(['2', '0']);
});

it.each([
  ['ATGTAAGGGTAA', {}, 'codon 2'],
  ['ATGAAATAA', { transl_table: '99' }, 'not an NCBI genetic code'],
  ['ATGAAATAA', { transl_except: '(pos:4..6,aa:Sec)' }, "can't be applied yet"],
] as const)('denies invalid new CDS products for %s with %j', (sequence, metadata, reason) => {
  const logs: string[] = [];
  const [r] = saveEditedFeature([rec({ id: 'r', sequence })], 'r', -1,
    { type: 'CDS', name: 'c', start: 0, end: sequence.length, strand: 1, metadata }, m => logs.push(m));
  expect(r.features[0].metadata?.translation).toBeUndefined();
  expect(r.features[0].metadata?._translationSource).toBe('removed');
  expect(logs).toHaveLength(1); expect(logs[0]).toContain(reason);
});

it.each(['CDS', 'misc_feature'])('refuses an empty-part %s edit without changing the record or translation lane', type => {
  const original = feat({ type, name: 'protected', end: 9, segments: [{ start: 0, end: 9 }],
    metadata: type === 'CDS' ? { translation: 'MK', _translationSource: 'imported' } : { note: 'keep' } });
  const record = rec({ id: 'r', sequence: 'ATGAAATAA', features: [original] });
  const options = { showAnnotations: false, translationVisible: true, showTracks: false };
  const before = computeRecordLayouts([record], options)[0];
  expect(before.translationLanes.forward).toBe(type === 'CDS' ? 1 : 0);
  const log = vi.fn();
  const [saved] = saveEditedFeature([record], 'r', 0, { ...original, segments: [], remoteParts: [] }, log);
  expect(saved).toBe(record);
  expect(saved.features[0]).toBe(original);
  expect(saved.features[0].metadata).toEqual(type === 'CDS' ? { translation: 'MK', _translationSource: 'imported' } : { note: 'keep' });
  expect(computeRecordLayouts([saved], options)[0].translationLanes).toBe(before.translationLanes);
  expect(log).toHaveBeenCalledExactlyOnceWith('WARNING: protected: a location must contain at least one segment; Save refused');
});

it.each([0, -1])('keeps a remote-only location saveable at feature index %i', featureIndex => {
  const original = feat({ name: 'remote', segments: [{ start: 0, end: 5 }],
    remoteParts: [{ accession: 'AB123.1', start: 10, end: 16, strand: 1, index: 1 }] });
  const record = rec({ id: 'r', sequence: 'ATGAAATAA', features: featureIndex === -1 ? [] : [original] });
  const log = vi.fn();
  const [saved] = saveEditedFeature([record], 'r', featureIndex, { ...original, segments: [],
    remoteParts: [{ ...original.remoteParts![0], index: 0 }] }, log);
  expect(saved.features[0]).toMatchObject({ segments: [], remoteParts: [{ accession: 'AB123.1', start: 10, end: 16, strand: 1, index: 0 }] });
  expect(log).not.toHaveBeenCalled();
});

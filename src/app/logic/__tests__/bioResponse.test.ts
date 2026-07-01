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
  resolveAccession,
  applyParseSuccess,
  applyAnnotations,
  applyFastaResponse,
} from '../bioResponse';
import type { SeqRecord, BioFeature, QuantitativeTrack } from '@/src/domain/bio/types';

const rec = (o: Partial<SeqRecord> & { id: string }): SeqRecord => ({
  name: o.id, sequence: '', features: [], ...o,
});

describe('resolveAccession', () => {
  it('prefers a trimmed non-empty incoming accession', () => {
    expect(resolveAccession('  ACC1 ', 'id1', 'u1')).toBe('ACC1');
  });
  it('falls back to the incoming id when accession is blank', () => {
    expect(resolveAccession('   ', 'id1', 'u1')).toBe('id1');
  });
  it('skips the id when it is "Unknown", using the uniqueId', () => {
    expect(resolveAccession(undefined, 'Unknown', 'u1')).toBe('u1');
  });
  it('uses the uniqueId when both accession and id are empty', () => {
    expect(resolveAccession('', '', 'u1')).toBe('u1');
  });
});

describe('applyParseSuccess', () => {
  it('appends with id dedup, name=id, resolved accession, and visible:true', () => {
    const prev = [rec({ id: 'g1', accession: 'g1' })];
    const { next, count } = applyParseSuccess(prev, [
      rec({ id: 'g1', accession: 'ACC9' }),
      rec({ id: 'g2' }),
    ]);
    expect(count).toBe(2);
    expect(next.slice(1).map(r => ({ id: r.id, name: r.name, accession: r.accession, visible: r.visible }))).toEqual([
      { id: 'g1 (1)', name: 'g1 (1)', accession: 'ACC9', visible: true },
      { id: 'g2', name: 'g2', accession: 'g2', visible: true },
    ]);
    // prev record is preserved unchanged
    expect(next[0]).toBe(prev[0]);
  });

  it('carries through moleculeType and features via the spread', () => {
    const f1: BioFeature = { type: 'gene', name: 'f1', start: 0, end: 5, strand: 1 };
    const incoming = [rec({
      id: 'g1',
      moleculeType: 'dna',
      features: [f1],
    })];
    const { next } = applyParseSuccess([], incoming);
    expect(next[0].moleculeType).toBe('dna');
    expect(next[0].features).toEqual([f1]);
  });
});

describe('applyAnnotations', () => {
  const feat = (name: string): BioFeature => ({ type: 'gene', name, start: 0, end: 5, strand: 1 });
  const track = (id: string): QuantitativeTrack => ({ id, name: id, data: [{ start: 0, end: 5, value: 1 }] });

  it('splits features vs tracks by the `data` discriminant, counts totalAdded, appends to existing', () => {
    const prev = [rec({ id: 'r1', features: [feat('f0')], tracks: [] })];
    const { next, totalAdded, unmatched } = applyAnnotations(prev, {
      r1: [feat('featA'), track('t1')],
      ghostId: [feat('x')],
    });
    expect(totalAdded).toBe(2);
    expect(unmatched).toEqual(['ghostId']);
    expect(next[0].features.map(f => f.name)).toEqual(['f0', 'featA']);
    expect(next[0].tracks?.map(t => t.id)).toEqual(['t1']);
  });

  it('leaves unmatched-id truncation to the caller (returns the full list)', () => {
    const annotations: Record<string, BioFeature[]> = {};
    for (let i = 0; i < 8; i++) annotations['id' + i] = [feat('f')];
    const { unmatched } = applyAnnotations([], annotations);
    expect(unmatched).toHaveLength(8);
    expect(unmatched.slice(0, 5)).toEqual(['id0', 'id1', 'id2', 'id3', 'id4']);
  });

  it('matches by name and accession, not just id', () => {
    const prev = [rec({ id: 'r1', name: 'displayName', accession: 'ACC1' })];
    const byAcc = applyAnnotations(prev, { ACC1: [feat('viaAcc')] });
    expect(byAcc.next[0].features.map(f => f.name)).toEqual(['viaAcc']);
    expect(byAcc.unmatched).toEqual([]);
  });

  it('returns a record with no matching annotation items unchanged (same reference)', () => {
    const prev = [rec({ id: 'r1', features: [feat('f0')] }), rec({ id: 'r2', features: [] })];
    const { next } = applyAnnotations(prev, { r1: [feat('featA')] });
    expect(next[1]).toBe(prev[1]);
    expect(next[1].features).toEqual([]);
  });

  it('creates a tracks array (from undefined) when a matching TRACK annotation arrives', () => {
    const prev = [rec({ id: 'r1' })]; // tracks left undefined
    expect(prev[0].tracks).toBeUndefined();
    const { next } = applyAnnotations(prev, { r1: [track('t1')] });
    expect(next[0].tracks).toEqual([track('t1')]);
  });
});

describe('applyFastaResponse', () => {
  const fa = (id: string, sequence: string) => ({ id, name: id, sequence, features: [] as BioFeature[], moleculeType: 'dna' as const });

  it('batch-appends with dedup when asAlignment is false', () => {
    const prev = [rec({ id: 'a' })];
    const res = applyFastaResponse(prev, [fa('a', 'ACGT'), fa('b', 'ACGT')], false);
    expect(res.kind).toBe('batch');
    if (res.kind === 'batch') {
      expect(res.count).toBe(2);
      expect(res.next.slice(1).map(r => r.id)).toEqual(['a (1)', 'b']);
      expect(res.next.slice(1).every(r => r.visible === true)).toBe(true);
    }
  });

  it('overlays alignedSequence onto matching records when ids match exactly and lengths agree', () => {
    const prev = [rec({ id: 'a', sequence: 'ACGT' }), rec({ id: 'b', sequence: 'ACGT' })];
    const res = applyFastaResponse(prev, [fa('a', 'AC-GT'), fa('b', 'ACGGT')], true);
    expect(res.kind).toBe('overlay');
    if (res.kind === 'overlay') {
      expect(res.length).toBe(5);
      expect(res.next.map(r => r.alignedSequence)).toEqual(['AC-GT', 'ACGGT']);
    }
  });

  it('rejects with kind reject-mismatch when a current record is missing from the upload', () => {
    const prev = [rec({ id: 'a', sequence: 'ACGT' }), rec({ id: 'b', sequence: 'ACGT' })];
    const res = applyFastaResponse(prev, [fa('a', 'ACGT')], true);
    expect(res.kind).toBe('reject-mismatch');
    if (res.kind === 'reject-mismatch') {
      expect(res.missing).toEqual(['b']);
      expect(res.extra).toEqual([]);
      expect(res.next).toBe(prev);
    }
  });

  it('rejects with kind reject-mismatch on an extra upload id', () => {
    const prev = [rec({ id: 'a', sequence: 'ACGT' }), rec({ id: 'b', sequence: 'ACGT' })];
    const res = applyFastaResponse(prev, [fa('a', 'ACGT'), fa('b', 'ACGT'), fa('c', 'ACGT')], true);
    expect(res.kind).toBe('reject-mismatch');
    if (res.kind === 'reject-mismatch') expect(res.extra).toEqual(['c']);
  });

  it('rejects with kind reject-length on non-uniform aligned lengths', () => {
    const prev = [rec({ id: 'a', sequence: 'ACGT' }), rec({ id: 'b', sequence: 'ACGT' })];
    const res = applyFastaResponse(prev, [fa('a', 'ACGT'), fa('b', 'ACGTA')], true);
    expect(res.kind).toBe('reject-length');
    if (res.kind === 'reject-length') expect(res.lengths).toEqual([4, 5]);
  });
});

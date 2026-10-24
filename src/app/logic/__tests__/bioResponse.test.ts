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
  applyFastaAndLog,
} from '../bioResponse';
import type { SeqRecord, BioFeature, QuantitativeTrack } from '@/src/domain/bio/types';
import { isDetailEdited, readDetails, writeDetails } from '@/src/domain/bio/details';
import { exportToGenBank } from '@/src/core/genbank/serialize';
import { exportToGff3, parseGFF3 } from '@/src/core/formats/gff3';
import { exportToFasta } from '@/src/core/formats/fasta';
import { handleBioMessage } from '@/src/workers/handlers/bio';
import { processTransposition } from '@/src/domain/bio/coordinate';

const rec = (o: Partial<SeqRecord> & { id: string }): SeqRecord => ({
  name: o.id, sequence: '', features: [], ...o,
});

describe('resolveAccession', () => {
  it('prefers a trimmed non-empty incoming accession', () => {
    expect(resolveAccession('  ACC1 ')).toBe('ACC1');
  });
  it('keeps blank accessions absent', () => {
    expect(resolveAccession('   ')).toBeUndefined();
  });
  it('keeps missing accessions absent', () => {
    expect(resolveAccession(undefined)).toBeUndefined();
  });
  it('keeps empty accessions absent', () => {
    expect(resolveAccession('')).toBeUndefined();
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
      { id: 'g1_1', name: 'g1_1', accession: 'ACC9', visible: true },
      { id: 'g2', name: 'g2', accession: undefined, visible: true },
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

  it('dedups two colliding INCOMING records against each other, pushing the freshly-minted id back into existingIds', () => {
    const { next, count } = applyParseSuccess([], [rec({ id: 'b' }), rec({ id: 'b' })]);
    expect(count).toBe(2);
    expect(next.map(r => r.id)).toEqual(['b', 'b_1']);
    expect(next.map(r => r.name)).toEqual(['b', 'b_1']);
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

  it('matches via the middle `?? annotations[r.name]` tier when keyed purely by name (id differs, no accession match)', () => {
    const prev = [rec({ id: 'r1', name: 'displayName' })];
    const byName = applyAnnotations(prev, { displayName: [feat('viaName')] });
    expect(byName.next[0].features.map(f => f.name)).toEqual(['viaName']);
    expect(byName.unmatched).toEqual([]);
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
      expect(res.next.slice(1).map(r => r.id)).toEqual(['a_1', 'b']);
      expect(res.next.slice(1).every(r => r.visible === true)).toBe(true);
    }
  });

  it('overlays alignedSequence onto matching records when ids match exactly and lengths agree', () => {
    const prev = [rec({ id: 'a', sequence: 'ACGT' }), rec({ id: 'b', sequence: 'ACGGT' })];
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

  describe('record IDs that contain spaces', () => {
    // Batch dedup names a second "seq1" as "seq1 (1)", so a session can hold IDs with spaces.
    const parsedAlignment = (content: string) => {
      const res = handleBioMessage({ type: 'PARSE_FASTA', filename: 'fixture.fa', content, asAlignment: true });
      if (res.type !== 'FASTA_SUCCESS') throw new Error(`unexpected ${res.type}`);
      return res.alignedData;
    };
    const session = [rec({ id: 'seq1', sequence: 'ACGT' }), rec({ id: 'seq1 (1)', sequence: 'ACGA' })];

    it('overlays a FASTA exported from the same session', () => {
      const exported = exportToFasta(session.map((r, i) => ({ ...r, sequence: i ? 'AC-GA' : 'ACGT-' }))).text;
      const res = applyFastaResponse(session, parsedAlignment(exported), true);
      expect(res.kind).toBe('overlay');
      expect(res.next.map(r => r.alignedSequence)).toEqual(['ACGT-', 'AC-GA']);
    });

    it('keeps the parser-only header out of batch-ingested records', () => {
      const res = applyFastaResponse([], parsedAlignment('>seq1 reference strain\nACGT\n'), false);
      expect(res.next[0]).not.toHaveProperty('header');
    });

    it('matches the longest header prefix that names a record, ignoring a trailing description', () => {
      const res = applyFastaResponse(session, parsedAlignment('>seq1 (1) from MAFFT\nAC-GA\n>seq1 reference strain\nACGT-\n'), true);
      expect(res.kind).toBe('overlay');
      expect(res.next.map(r => r.alignedSequence)).toEqual(['ACGT-', 'AC-GA']);
    });
  });

  it('rejects with kind reject-empty when every aligned sequence is empty (uniform length 0)', () => {
    const prev = [rec({ id: 'a', sequence: 'ACGT' }), rec({ id: 'b', sequence: 'ACGT' })];
    const res = applyFastaResponse(prev, [fa('a', ''), fa('b', '')], true);
    expect(res.kind).toBe('reject-empty');
    expect(res.next).toBe(prev);
  });
});


it('deduplicates incoming IDs against all workspace IDs without changing accessions', () => {
  const prev = [rec({ id: 'seq1' }), rec({ id: 'seq1_1' })];
  const incoming = [rec({ id: 'seq1', accession: 'seq1' }), rec({ id: 'seq1', accession: 'seq1' })];
  const { next } = applyParseSuccess(prev, incoming);
  expect(next.slice(2).map(r => r.id)).toEqual(['seq1_2', 'seq1_3']);
  expect(next.slice(2).map(r => r.accession)).toEqual(['seq1', 'seq1']);
  expect(next[0]).toBe(prev[0]);
  expect(incoming.map(r => r.id)).toEqual(['seq1', 'seq1']);
});


it('matches alignment IDs while ignoring FASTA modifiers and keeping source details unchanged', () => {
  const prev = [rec({ id: 'seq1_1', sequence: 'ACGT', definition: 'original' })];
  const response = handleBioMessage({ type: 'PARSE_FASTA', filename: 'fixture.fa', content: '>seq1_1 [host=camel] external description\nA--CGT', asAlignment: true });
  if (response.type !== 'FASTA_SUCCESS') throw new Error('Expected FASTA_SUCCESS');
  expect(response.alignedData[0]).toMatchObject({ header: 'external description', details: { host: 'camel' } });
  const result = applyFastaResponse(prev, response.alignedData, true);
  expect(result.kind).toBe('overlay');
  expect(result.next[0]).toMatchObject({ id: 'seq1_1', sequence: 'ACGT', alignedSequence: 'A--CGT', definition: 'original', features: [] });
});


describe('import provenance and annotation ownership', () => {
  const feature: BioFeature = { type: 'gene', name: 'late gene', start: 799, end: 900, strand: 1 };
  const region = (end: number) => ({ start: 0, end, details: { host: 'camel', organism: 'virus' },
    feature: { type: 'region', name: 'region', start: 0, end, strand: 1 as const } });

  it('captures the GenBank file values and filename without inventing an accession', () => {
    const source: BioFeature = { type: 'source', name: 'source', start: 0, end: 4, strand: 1, metadata: { host: 'camel', country: 'Oman' } };
    const result = applyParseSuccess([], [rec({ id: 'local', sequence: 'ACGT', features: [source] })], 'camel.gb');
    expect(result.next[0]).toMatchObject({ importedFrom: 'camel.gb', fileDetails: { host: 'camel', location: 'Oman' } });
    expect(result.next[0].accession).toBeUndefined();
    expect(result.idMap).toEqual({ local: 'local' });
  });

  it('writes FASTA modifiers into source details and snapshots them', () => {
    const response = handleBioMessage({ type: 'PARSE_FASTA', filename: 'camel.fa', content: '>local [host=camel] [strain=K1] sample\nACGT' });
    expect(response).toMatchObject({ filename: 'camel.fa' });
    if (response.type !== 'FASTA_SUCCESS') throw new Error('Expected FASTA');
    const result = applyFastaResponse([], response.alignedData, false, response.filename);
    expect(result.next[0]).toMatchObject({ importedFrom: 'camel.fa', fileDetails: { host: 'camel' }, fastaModifiers: { strain: 'K1' }, definition: 'sample', features: [{ type: 'source', start: 0, end: 4, metadata: { host: 'camel' } }] });
    expect(result.next[0].accession).toBeUndefined();
    if (result.kind === 'batch') expect(result.idMap).toEqual({ local: 'local' });
  });

  it('attaches batch annotations to the new record despite an older exact ID', () => {
    const imported = applyParseSuccess([rec({ id: 'contig1', sequence: 'A'.repeat(100) })], [rec({ id: 'contig1', sequence: 'A'.repeat(1000) })], 'contig.fa');
    const result = applyAnnotations(imported.next, { contig1: [feature] }, {}, imported.idMap);
    expect(result.next[0].features).toEqual([]);
    expect(result.next[1].features).toEqual([feature]);
    expect(result.unmatched).toEqual([]);
  });

  it('refuses ambiguous accessions but gives exact workspace IDs precedence', () => {
    const records = [rec({ id: 'a', accession: 'X' }), rec({ id: 'b', accession: 'X' })];
    const refused = applyAnnotations(records, { X: [feature] }, {});
    expect(refused.totalAdded).toBe(0);
    expect(refused.unmatched).toEqual(['X']);
    const exact = applyAnnotations([rec({ id: 'X' }), ...records], { X: [feature] }, {});
    expect(exact.next.map(r => r.features.length)).toEqual([1, 0, 0]);
  });

  it('refuses duplicate incoming IDs instead of using an old exact match', () => {
    const imported = applyParseSuccess([rec({ id: 'a' })], [rec({ id: 'a' }), rec({ id: 'a' })], 'two.gb');
    expect(imported.idMap).toEqual({ a: null });
    const result = applyAnnotations(imported.next, { a: [feature] }, {}, imported.idMap);
    expect(result.totalAdded).toBe(0);
    expect(result.unmatched).toEqual(['a']);
  });

  it('keeps the imported region source through GFF3 import and export', () => {
    const parsed = parseGFF3('a\tRefSeq\tregion\t1\t4\t.\t+\t.\tID=a.0;gbkey=Src\na\ttoolX\tgene\t1\t4\t.\t+\t.\tID=g');
    const result = applyAnnotations([rec({ id: 'a', sequence: 'AAAA' })], parsed.features, parsed.details);
    const columns = exportToGff3(result.next).text.split('\n').filter(line => line && !line.startsWith('#')).map(line => line.split('\t')[1]);
    expect(columns).toEqual(['RefSeq', 'toolX']);
  });

  it('fills only empty unedited details and preserves existing imported values', () => {
    const record = rec({ id: 'a', sequence: 'A'.repeat(1000), fileDetails: { host: 'original', location: 'Oman' }, features: [{ type: 'source', name: 'source', start: 0, end: 1000, strand: 1, metadata: { host: 'edited' } }] });
    const result = applyAnnotations([record], {}, { a: { ...region(1000), details: { host: 'camel', organism: 'virus', location: 'Egypt' } } });
    expect(result.next[0].features[0].metadata).toEqual({ host: 'edited', organism: 'virus' });
    expect(result.next[0].fileDetails).toEqual({ host: 'original', location: 'Oman', organism: 'virus' });
    expect(record.features[0].metadata).toEqual({ host: 'edited' });
    expect(result.unmatched).toEqual([]);
  });

  it('keeps a short source candidate as an ordinary annotation and reports unmatched details', () => {
    const result = applyAnnotations([rec({ id: 'a', sequence: 'A'.repeat(1000) })], {}, { a: region(100), missing: region(1000) });
    expect(result.next[0].features).toEqual([region(100).feature]);
    expect(result.totalAdded).toBe(1);
    expect(result.unmatched).toEqual(['missing']);
  });
});

describe('applyFastaResponse residue integrity (#249)', () => {
  const fa = (id: string, sequence: string) => ({ id, name: id, sequence, features: [] as BioFeature[], moleculeType: 'dna' as const });
  const gene: BioFeature = { type: 'gene', name: 'g', start: 0, end: 2, strand: 1 };
  const prev = [rec({ id: 'a', sequence: 'ACGT', features: [gene] }), rec({ id: 'b', sequence: 'AGT' })];

  it.each([
    ['a substitution', 'TTTT'],
    ['a dropped residue', 'AC-G'],
    ['an inserted residue', 'ACGTA'],
    ['reordered residues', 'CAGT'],
    ['U written for a loaded T', 'ACGU'],
  ])('refuses %s with the offending ID and leaves the workspace untouched', (_case, aligned) => {
    const res = applyFastaResponse(prev, [fa('a', aligned), fa('b', 'AGT'.padEnd(aligned.length, '-'))], true);
    expect(res).toEqual({ next: prev, kind: 'reject-residues', ids: ['a'] });
    expect(res.next).toBe(prev);
  });

  it('folds only ASCII case, so "ß" cannot stand in for a loaded "SS"', () => {
    const loaded = [rec({ id: 'a', sequence: 'SS', moleculeType: 'protein' }), rec({ id: 'b', sequence: 'AG', moleculeType: 'protein' })];
    expect(applyFastaResponse(loaded, [fa('a', 'ß-'), fa('b', 'AG')], true))
      .toEqual({ next: loaded, kind: 'reject-residues', ids: ['a'] });
  });

  it('refuses "." gaps explicitly instead of reading them as residues', () => {
    const res = applyFastaResponse(prev, [fa('a', 'AC.GT'), fa('b', 'A.G-T')], true);
    expect(res).toEqual({ next: prev, kind: 'reject-dot-gap', ids: ['a', 'b'] });
  });

  it('accepts a case-only difference and keeps the loaded residues as the source', () => {
    const res = applyFastaResponse(prev, [fa('a', 'ac-gt'), fa('b', 'A-G-T')], true);
    expect(res.kind).toBe('overlay');
    expect(res.next.map(r => [r.sequence, r.alignedSequence, r.features])).toEqual([
      ['ACGT', 'ac-gt', [gene]], ['AGT', 'A-G-T', []],
    ]);
  });

  it('compares a loaded sequence that kept "-" from a batch FASTA without its gaps', () => {
    const gapped = [rec({ id: 'a', sequence: 'AC-GT' }), rec({ id: 'b', sequence: 'ACGT' })];
    expect(applyFastaResponse(gapped, [fa('a', 'AC-GT'), fa('b', 'ACG-T')], true).kind).toBe('overlay');
    expect(applyFastaResponse(gapped, [fa('a', 'AC-GA'), fa('b', 'ACG-T')], true))
      .toEqual({ next: gapped, kind: 'reject-residues', ids: ['a'] });
  });

  it('requires a loaded terminal stop to stay in the protein row', () => {
    const proteins = [rec({ id: 'p', sequence: 'MK*', moleculeType: 'protein' }), rec({ id: 'q', sequence: 'MAK', moleculeType: 'protein' })];
    expect(applyFastaResponse(proteins, [fa('p', 'M-K'), fa('q', 'MAK')], true))
      .toEqual({ next: proteins, kind: 'reject-residues', ids: ['p'] });
    expect(applyFastaResponse(proteins, [fa('p', 'M-K*'), fa('q', 'MAK-')], true).kind).toBe('overlay');
  });

  it('keeps the ID and length refusals ahead of the residue check', () => {
    expect(applyFastaResponse(prev, [fa('a', 'TTTT')], true).kind).toBe('reject-mismatch');
    expect(applyFastaResponse(prev, [fa('a', 'TTTT'), fa('b', 'AGT')], true).kind).toBe('reject-length');
  });
});


it('echoes the GenBank filename from the real worker handler', () => {
  const result = handleBioMessage({ type: 'PARSE_GENBANK', filename: 'camel.gb', content: 'LOCUS       LOCAL 4 bp DNA linear\nORIGIN\n        1 acgt\n//' });
  expect(result).toMatchObject({ type: 'PARSE_SUCCESS', filename: 'camel.gb' });
});

it('keeps imported provenance and file values intact during an alignment overlay', () => {
  const record = rec({ id: 'a', sequence: 'ACGT', importedFrom: 'original.fa', fileDetails: { host: 'camel' } });
  const result = applyFastaResponse([record], [{ id: 'a', name: 'a', sequence: 'A--CGT', features: [], details: { host: 'human' } }], true, 'overlay.fa');
  expect(result.next[0]).toMatchObject({ importedFrom: 'original.fa', fileDetails: { host: 'camel' }, features: [], alignedSequence: 'A--CGT' });
});


it('preserves circular topology from a whole-length GFF source through interchange exports', () => {
  const imported = applyFastaResponse([], [{ id: 'circle', name: 'circle', sequence: 'A'.repeat(1000), features: [] }], false, 'circle.fa');
  const gff = parseGFF3('circle\ts\tregion\t1\t1000\t.\t+\t.\tgbkey=Src;Is_circular=true\ncircle\ts\tgene\t901\t1000\t.\t+\t.\tID=wrap\ncircle\ts\tgene\t1\t100\t.\t+\t.\tID=wrap');
  const result = applyAnnotations(imported.next, gff.features, gff.details);
  expect(result.next[0].isCircular).toBe(true);
  expect(result.next[0].features.find(f => f.type === 'gene')?.segments).toEqual([{ start: 900, end: 1000 }, { start: 0, end: 100 }]);
  expect(exportToGenBank(result.next).text).toMatch(/^LOCUS.*circular/m);
  expect(exportToGff3(result.next).text).toContain('Is_circular=true');
  const absent = parseGFF3('circle\ts\tregion\t1\t1000\t.\t+\t.\tgbkey=Src');
  expect(applyAnnotations(result.next, absent.features, absent.details).next[0].isCircular).toBe(true);
  const explicitFalse = parseGFF3('circle\ts\tregion\t1\t1000\t.\t+\t.\tgbkey=Src;Is_circular=false');
  expect(applyAnnotations(result.next, explicitFalse.features, explicitFalse.details).next[0].isCircular).toBe(true);
});

it('keeps a short circular Src candidate as an annotation without changing topology', () => {
  const gff = parseGFF3('a\ts\tregion\t1\t100\t.\t+\t.\tgbkey=Src;Is_circular=true');
  const result = applyAnnotations([rec({ id: 'a', sequence: 'A'.repeat(1000) })], gff.features, gff.details);
  expect(result.next[0].isCircular).toBeUndefined();
  expect(result.next[0].features[0].type).toBe('region');
});

it('treats GFF-filled historical details as file data and keeps them in every interchange export', () => {
  const imported = applyFastaResponse([], [{ id: 'local', name: 'local', sequence: 'ACGT', features: [] }], false, 'local.fa');
  const gff = parseGFF3('local\ts\tregion\t1\t4\t.\t+\t.\tgbkey=Src;geo_loc_name=USSR;collection_date=March%201914');
  const record = applyAnnotations(imported.next, gff.features, gff.details).next[0];
  expect(record.fileDetails).toEqual({ location: 'USSR', collectionDate: 'March 1914' });
  expect(readDetails(record)).toEqual(record.fileDetails);
  expect(isDetailEdited(record, 'location')).toBe(false);
  expect(isDetailEdited(record, 'collectionDate')).toBe(false);
  expect(imported.next[0].fileDetails).toEqual({});
  expect(exportToGenBank([record]).text).toContain('/geo_loc_name="USSR"');
  expect(exportToGff3([record]).text).toContain('geo_loc_name=USSR');
  expect(exportToFasta([record], { residues: 'original', header: 'details' }).text).toContain('[geo-loc-name=USSR]');
  const edited = writeDetails(record, { location: 'Atlantis' });
  expect(isDetailEdited(edited, 'location')).toBe(true);
  expect(exportToGenBank([edited]).text).not.toContain('Atlantis');
  expect(readDetails(writeDetails(edited, { location: edited.fileDetails?.location })).location).toBe('USSR');
});


it('attaches standalone annotations using a final sanitized-ID match', () => {
  const feature: BioFeature = { name: 'g', type: 'gene', start: 1, end: 3, strand: 1 };
  const result = applyAnnotations([rec({ id: 'seq_1', name: 'display name', sequence: 'AAAA' })], { 'seq(1)': [feature] });
  expect(result.unmatched).toEqual([]);
  expect(result.next[0].features).toEqual([feature]);
});

it('imports non-detail source qualifiers and empty flags from a full-length GFF region', () => {
  const original = rec({ id: 'local', sequence: 'ACGT' });
  const gff = parseGFF3('local\ts\tregion\t1\t4\t.\t+\t.\tgbkey=Src;isolate=K1;strain=S1;environmental_sample=;geo_loc_name=USSR;collection_date=March%201914');
  const result = applyAnnotations([original], gff.features, gff.details);
  expect(result.next[0].features).toHaveLength(1);
  expect(result.next[0].features[0]).toMatchObject({ type: 'source', start: 0, end: 4,
    metadata: { isolate: 'K1', strain: 'S1', environmental_sample: '', geo_loc_name: 'USSR', collection_date: 'March 1914' } });
  expect(result.next[0].fileDetails).toEqual({ location: 'USSR', collectionDate: 'March 1914' });
  expect(isDetailEdited(result.next[0], 'location')).toBe(false);
  expect(result.totalAdded).toBe(0);
  expect(original.features).toEqual([]);
});

it('preserves existing source qualifiers and edited details while adding missing GFF source qualifiers', () => {
  const original = rec({ id: 'local', sequence: 'ACGT', fileDetails: { host: 'camel', location: 'Oman', collectionDate: '2014' },
    features: [{ type: 'source', name: 'original source', start: 0, end: 4, strand: 1,
      metadata: { isolate: 'original', environmental_sample: '', country: 'Atlantis' } }] });
  const gff = parseGFF3('local\ts\tregion\t1\t4\t.\t+\t.\tgbkey=Src;isolate=K1;strain=S1;environmental_sample=true;nat-host=human;geo_loc_name=Egypt;collection-date=2015');
  const result = applyAnnotations([original], gff.features, gff.details).next[0];
  expect(result.features).toHaveLength(1);
  expect(result.features[0]).toMatchObject({ type: 'source', name: 'original source',
    metadata: { isolate: 'original', strain: 'S1', environmental_sample: '', country: 'Atlantis' } });
  expect(readDetails(result)).toEqual({ location: 'Atlantis' });
  expect(result.features[0].metadata).not.toHaveProperty('nat-host');
  expect(result.features[0].metadata).not.toHaveProperty('geo_loc_name');
  expect(result.features[0].metadata).not.toHaveProperty('collection-date');
  expect(result.fileDetails).toEqual({ host: 'camel', location: 'Oman', collectionDate: '2014' });
  expect(original.features[0].metadata).toEqual({ isolate: 'original', environmental_sample: '', country: 'Atlantis' });
});

it('creates a source for GFF qualifiers when there are no editable details', () => {
  const gene: BioFeature = { type: 'gene', name: 'g', start: 0, end: 3, strand: 1 };
  const original = rec({ id: 'local', sequence: 'ACGT', features: [gene] });
  const gff = parseGFF3('local\ts\tregion\t1\t4\t.\t+\t.\tgbkey=Src;isolate=K1;environmental_sample=');
  const result = applyAnnotations([original], gff.features, gff.details).next[0];
  expect(result.features[0]).toEqual(gene);
  expect(result.features[1]).toMatchObject({ type: 'source', start: 0, end: 4,
    metadata: { isolate: 'K1', environmental_sample: '' } });
  expect(result.fileDetails).toBeUndefined();
  expect(original.features).toEqual([gene]);
});

it('merges list provenance for added source qualifiers while preserving existing source lists', () => {
  const original = rec({ id: 'local', sequence: 'ACGT', features: [{ type: 'source', name: 'source', start: 0, end: 4, strand: 1,
    metadata: { note: 'first,second', _gffLists: '{"note":["first","second"]}' } }] });
  const gff = parseGFF3('local\ts\tregion\t1\t4\t.\t+\t.\tgbkey=Src;note=overwrite,other;Dbxref=DB:1,DB:2');
  const result = applyAnnotations([original], gff.features, gff.details).next[0];
  expect(result.features[0].metadata).toMatchObject({ note: 'first,second', Dbxref: 'DB:1,DB:2' });
  expect(JSON.parse(result.features[0].metadata!._gffLists)).toEqual({ note: ['first', 'second'], Dbxref: ['DB:1', 'DB:2'] });
  const exported = exportToGff3([result]).text;
  expect(exported).toContain('note=first,second');
  expect(exported).toContain('Dbxref=DB%3A1,DB%3A2');
  expect(original.features[0].metadata!._gffLists).toBe('{"note":["first","second"]}');
});

it('does not use sanitized IDs to override ambiguous name matches or refused batch IDs', () => {
  const feature: BioFeature = { name: 'g', type: 'gene', start: 1, end: 3, strand: 1 };
  const records = [rec({ id: 'seq_1', name: 'seq(1)' }), rec({ id: 'other', name: 'seq(1)' })];
  expect(applyAnnotations(records, { 'seq(1)': [feature] }).unmatched).toEqual(['seq(1)']);
  expect(applyAnnotations(records.slice(0, 1), { 'seq(1)': [feature] }, {}, { 'seq(1)': null }).unmatched).toEqual(['seq(1)']);
});


describe('FASTA loaded as sequences drops "-" gap characters (#267)', () => {
  const parsed = (content: string) => {
    const response = handleBioMessage({ type: 'PARSE_FASTA', filename: 'gapped.fa', content });
    if (response.type !== 'FASTA_SUCCESS') throw new Error(`unexpected ${response.type}`);
    return response.alignedData;
  };

  it('keeps residues, case, U and protein letters and reports each changed record', () => {
    const result = applyFastaResponse([], parsed('>d\nac-gt\n>r\nAU--GC\n>p\nMU-OP\n>clean\nACGT\n'), false, 'gapped.fa');
    expect(result.kind).toBe('batch');
    expect(result.next.map(r => [r.id, r.sequence])).toEqual([['d', 'acgt'], ['r', 'AUGC'], ['p', 'MUOP'], ['clean', 'ACGT']]);
    if (result.kind === 'batch') expect(result.gapsRemoved).toEqual([{ id: 'd', removed: 1 }, { id: 'r', removed: 2 }, { id: 'p', removed: 1 }]);
  });

  it('sizes the source details from residues and reports the deduplicated workspace ID', () => {
    const result = applyFastaResponse([rec({ id: 'a', sequence: 'TTTT' })], parsed('>a [host=camel]\nAC--GT\n'), false, 'gapped.fa');
    expect(result.next[1]).toMatchObject({ id: 'a_1', sequence: 'ACGT', features: [{ type: 'source', start: 0, end: 4 }] });
    if (result.kind === 'batch') expect(result.gapsRemoved).toEqual([{ id: 'a_1', removed: 2 }]);
  });

  it('places features and exports on residue positions, and the same file still overlays as an alignment', () => {
    const loaded = applyFastaResponse([], parsed('>a\nAC-GT\n>b\nACGGT\n'), false).next;
    const withGene = [{ ...loaded[0], features: [{ type: 'gene', name: 'GT', start: 2, end: 4, strand: 1 as const }] }, loaded[1]];
    const genbank = exportToGenBank([withGene[0]]).text;
    expect(genbank).toMatch(/^LOCUS\s+a\s+4 bp/m);
    expect(genbank).toMatch(/^\s+1 acgt$/m);
    expect(genbank).toMatch(/gene\s+3\.\.4/);
    const overlay = applyFastaResponse(withGene, parsed('>a\nAC-GT\n>b\nACGGT\n'), true);
    expect(overlay.kind).toBe('overlay');
    const shown = processTransposition(overlay.next)[0];
    expect([shown.features[0].start, shown.features[0].end]).toEqual([3, 5]);
    expect(shown.alignedSequence!.slice(3, 5)).toBe('GT');
  });

  it.each([
    ['a gap-only record after one with residues', '>a\nACGT\n>b\n---\n', ['b']],
    ['a file of gap-only records', '>a\n--\n>b\n-\n', ['a', 'b']],
    ['a header-only record beside a gapped one', '>good\nAC-GT\n>empty\n', ['empty']],
  ])('refuses the whole file for %s and leaves the workspace untouched', (_case, content, ids) => {
    const prev = [rec({ id: 'kept', sequence: 'GGGG' })];
    expect(applyFastaResponse(prev, parsed(content), false, 'gapped.fa')).toEqual({ next: prev, kind: 'reject-no-residues', ids });
  });

  it('logs the removal and the refusal', () => {
    const logs: string[] = [];
    applyFastaAndLog([], parsed('>a\nAC-GT\n>b\nA--C\n'), false, message => logs.push(message), 'gapped.fa');
    applyFastaAndLog([], parsed('>a\nACGT\n>b\n---\n'), false, message => logs.push(message), 'only.fa');
    expect(logs).toEqual([
      'Batch ingestion complete: 2 records added.',
      'Removed alignment gaps ("-") from 2 records in gapped.fa: a (1), b (2).',
      'ERROR: only.fa was not loaded: records with no residues: [b].',
    ]);
  });
});

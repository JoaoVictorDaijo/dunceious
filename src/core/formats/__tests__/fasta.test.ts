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
import type { SeqRecord } from '@/src/domain/bio/types';
import { parseFasta, exportToFasta } from '../fasta';

describe('parseFasta', () => {
  it('parses a single record, takes the id from the first whitespace token and keeps cleaned description text', () => {
    expect(parseFasta('>seq1 a description\nACGT')).toEqual([
      { id: 'seq1', name: 'seq1', sequence: 'ACGT', features: [], moleculeType: 'dna', header: 'a description', definition: 'a description', details: {}, fastaModifiers: {} },
    ]);
  });

  it('concatenates wrapped sequence lines', () => {
    const [rec] = parseFasta('>s\nAC\nGT\nAA');
    expect(rec.sequence).toBe('ACGTAA');
  });

  it('parses multiple records and infers molecule type per record', () => {
    const recs = parseFasta('>a\nACGT\n>b\nMKLEP');
    expect(recs.map(r => r.id)).toEqual(['a', 'b']);
    expect(recs[1].moleculeType).toBe('protein');
  });

  it('flushes the trailing record after the last header', () => {
    expect(parseFasta('>only\nACGT')).toHaveLength(1);
  });

  it('returns an empty array for empty or header-less content', () => {
    expect(parseFasta('')).toEqual([]);
    expect(parseFasta('ACGT\nACGT')).toEqual([]);
  });

  it('skips blank and whitespace-only sequence lines', () => {
    expect(parseFasta('>s\nAC\n\n  \nGT')[0].sequence).toBe('ACGT');
  });
});

function record(overrides: Partial<SeqRecord> = {}): SeqRecord {
  return { id: 'REC1', name: 'Record 1', sequence: 'ATGCAAATAG', features: [], ...overrides };
}

describe('exportToFasta', () => {
  it('wraps a single record at 60 characters per line', () => {
    expect(exportToFasta([record({ sequence: 'A'.repeat(70) })]).text)
      .toBe('>REC1\n' + 'A'.repeat(60) + '\n' + 'A'.repeat(10));
  });

  it('emits a plain header and unwrapped sequence for a short record', () => {
    expect(exportToFasta([record()]).text).toBe('>REC1\nATGCAAATAG');
  });

  it('slices to [start, end) and stamps the slice header when both are given', () => {
    // 'ATGCAAATAG'.substring(2, 5) → 'GCA'
    expect(exportToFasta([record()], { residues: 'aligned', header: 'id', slice: { start: 2, end: 5 } }).text).toBe('>REC1 [Slice: 2-5]\nGCA');
  });

  it('uses original residues by default even when alignedSequence is present', () => {
    expect(exportToFasta([record({ alignedSequence: 'XXXX' })]).text).toBe('>REC1\nATGCAAATAG');
  });

  it('joins multiple records with a blank line', () => {
    const out = exportToFasta([
      record({ id: 'A', sequence: 'AAA' }),
      record({ id: 'B', sequence: 'CCC' }),
    ]).text;
    expect(out).toBe('>A\nAAA\n\n>B\nCCC');
  });
});


it('parses NCBI modifiers separately from FASTA description text', () => {
  const [r] = parseFasta('>X1 [organism=MERS-CoV] [collection-date=2014] [strain=K1] camel sample\nACGT');
  expect(r).toMatchObject({ id: 'X1', details: { organism: 'MERS-CoV', collectionDate: '2014' }, fastaModifiers: { strain: 'K1' }, header: 'camel sample', definition: 'camel sample' });
});

it('writes canonical and pass-through modifiers, omits deprecated ones, and cleans values', () => {
  const r = record({ features: [{ type: 'source', name: 'source', start: 0, end: 10, strand: 1, metadata: { collection_date: '2014', host: 'camel' } }], fastaModifiers: { strain: 'K1', acronym: 'OLD', custom: 'a[b]\nc' } });
  const { text, report } = exportToFasta([r], { residues: 'original', header: 'details' });
  expect(text).toContain('[collection-date=2014]');
  expect(text).toContain('[strain=K1]');
  expect(text).toContain('[custom=a b c]');
  expect(text).not.toContain('acronym');
  expect(report.deprecatedModifiersOmitted).toBe(1);
  expect(report.writtenDetails).toMatchObject({ collectionDate: 1, host: 1 });
});

it('exports original residues and slices aligned columns only in aligned mode', () => {
  const r = record({ sequence: 'ACGT', alignedSequence: 'A--CGT' });
  expect(exportToFasta([r], { residues: 'original', header: 'id' }).text).toBe('>REC1\nACGT');
  expect(exportToFasta([r], { residues: 'aligned', header: 'id', slice: { start: 3, end: 5 } }).text).toBe('>REC1 [Slice: 3-5]\nCG');
  expect(exportToFasta([r], { residues: 'original', header: 'id', slice: { start: 1, end: 3 } }).text).toBe('>REC1 [Slice: 1-3]\nCG');
});

it('omits invalid edited details but keeps unchanged submitter values', () => {
  const r = record({ fileDetails: { location: 'USSR', collectionDate: '2014' }, features: [{ type: 'source', name: 'source', start: 0, end: 10, strand: 1, metadata: { country: 'USSR', collection_date: 'March 2014' } }] });
  const { text, report } = exportToFasta([r], { residues: 'original', header: 'details' });
  expect(text).toContain('[geo-loc-name=USSR]');
  expect(text).not.toContain('March');
  expect(report.invalidDetailsOmitted.collectionDate).toBe(1);
  expect(report.writtenDetails.location).toBe(1);
});


it('writes ordered detail modifiers and keeps display labels private', () => {
  const r = record({ id: 'X1', sequence: 'ACGT', label: 'private display name', features: [{ type: 'source', name: 'source', start: 0, end: 4, strand: 1, metadata: { organism: 'MERS-CoV', host: 'Camelus dromedarius', geo_loc_name: 'Oman', collection_date: '2014', isolate: 'camel/OMN/D184' } }], fastaModifiers: { strain: 'K1' } });
  const { text } = exportToFasta([r], { residues: 'original', header: 'details' });
  expect(text).toBe('>X1 [organism=MERS-CoV] [host=Camelus dromedarius] [geo-loc-name=Oman] [collection-date=2014] [isolate=camel/OMN/D184] [strain=K1]\nACGT');
  expect(parseFasta(text)[0]).toMatchObject({ details: { organism: 'MERS-CoV', host: 'Camelus dromedarius', location: 'Oman', collectionDate: '2014' }, fastaModifiers: { isolate: 'camel/OMN/D184', strain: 'K1' } });
  expect(exportToFasta([r]).text).toBe('>X1\nACGT');
});

it('uses source isolate and strain once when retained modifiers collide', () => {
  const r = record({ features: [{ type: 'source', name: 'source', start: 0, end: 10, strand: 1, metadata: { isolate: 'I1', strain: 'S1' } }], fastaModifiers: { isolate: 'old', strain: 'old', custom: 'extra' } });
  expect(exportToFasta([r], { residues: 'original', header: 'details' }).text).toBe('>REC1 [isolate=I1] [strain=S1] [custom=extra]\nATGCAAATAG');
});

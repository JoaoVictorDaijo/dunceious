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

import { it, expect } from 'vitest';
import type { BioFeature, SeqRecord } from '@/src/domain/bio/types';
import { exportToGff3, parseGFF3 } from '../gff3';
import { soTypeFor } from '../soTypes';
import { extractCodingSequence } from '@/src/domain/bio/sequence';

const feature = (extra: Partial<BioFeature> = {}): BioFeature => ({ type: 'CDS', name: 'gene1', start: 0, end: 150, strand: 1, ...extra });
const record = (extra: Partial<SeqRecord> = {}): SeqRecord => ({ id: 'seq_1', name: 'seq_1', sequence: 'A'.repeat(1000), features: [], ...extra });
const lines = (text: string) => text.split('\n').filter(line => line && !line.startsWith('#')).map(line => line.split('\t'));

it('decodes attribute names and values exactly once', () => {
  const name = 'a; b=c%20d & e,f\tline\nend';
  const { text } = exportToGff3([record({ features: [feature({ name, metadata: { note: 'literal %3B;=,&' } })] })]);
  expect(text).toContain('Name=a%3B%20b%3Dc%2520d');
  expect(text).toContain('note=literal%20%253B%3B%3D%2C%26');
  expect(parseGFF3(text).features.seq_1[0]).toMatchObject({ name, metadata: { note: 'literal %3B;=,&' } });
});

it('gives same-named features distinct IDs and keeps the workspace ID in column 1', () => {
  const data = lines(exportToGff3([record({ features: [feature(), feature()] })]).text);
  expect(data.every(row => row[0] === 'seq_1')).toBe(true);
  expect(data.slice(1).map(row => row[8].match(/^ID=([^;]+)/)![1])).toEqual(['seq_1.1', 'seq_1.2']);
});

it('encodes seqids according to the GFF3 column-one character set', () => {
  const { text } = exportToGff3([record({ id: 'x/y>z', features: [feature()] })]);
  expect(lines(text)[0][0]).toBe('x%2Fy%3Ez');
  expect(parseGFF3(text).features['x/y>z']).toHaveLength(1);
});

it('writes and reconstructs discontinuous CDS parts with one ID', () => {
  const segments = [{ start: 0, end: 100 }, { start: 200, end: 250 }];
  const { text } = exportToGff3([record({ features: [feature({ start: 0, end: 250, segments, metadata: { codon_start: '2' } })] })]);
  const cds = lines(text).filter(row => row[2] === 'CDS');
  expect(cds.map(row => row.slice(3, 5))).toEqual([['1', '100'], ['201', '250']]);
  expect(cds.map(row => row[7])).toEqual(['1', '0']);
  expect(cds.map(row => row[8].match(/^ID=([^;]+)/)![1])).toEqual(['seq_1.1', 'seq_1.1']);
  expect(parseGFF3(text).features.seq_1).toHaveLength(1);
  expect(parseGFF3(text).features.seq_1[0].segments).toEqual(segments);
});

it('computes reverse CDS phases in transcription order', () => {
  const { text } = exportToGff3([record({ features: [feature({ strand: -1, start: 0, end: 250, segments: [{ start: 0, end: 100 }, { start: 200, end: 250 }], metadata: { codon_start: '2' } })] })]);
  expect(lines(text).filter(row => row[2] === 'CDS').map(row => row[7])).toEqual(['2', '1']);
});

it('retains different imported phases per part through re-export', () => {
  const parsed = parseGFF3('seq_1\ts\tCDS\t1\t100\t5\t+\t2\tID=x;Name=x\nseq_1\ts\tCDS\t201\t250\t5\t+\t1\tID=x;Name=x');
  const { text } = exportToGff3([record({ features: parsed.features.seq_1 })]);
  expect(lines(text).filter(row => row[2] === 'CDS').map(row => row[7])).toEqual(['2', '1']);
  expect(lines(text).filter(row => row[2] === 'CDS').map(row => row[5])).toEqual(['5', '5']);
});

it('round-trips circular origin crossings without start exceeding end on a GFF line', () => {
  const { text } = exportToGff3([record({ isCircular: true, features: [feature({ type: 'gene', start: 900, end: 100 })] })]);
  expect(lines(text)[0][8]).toContain('Is_circular=true');
  expect(lines(text).slice(1).map(row => row.slice(3, 5))).toEqual([['901', '1000'], ['1', '100']]);
  const [f] = parseGFF3(text).features.seq_1;
  expect(f).toMatchObject({ start: 900, end: 100 });
  expect(f.segments!.reduce((sum, part) => sum + part.end - part.start, 0)).toBe(200);
  expect(f.segments).toEqual([{ start: 900, end: 1000 }, { start: 0, end: 100 }]);
});

it('maps INSDC types and restores their originals on import', () => {
  const { text } = exportToGff3([record({ features: [feature({ type: 'misc_feature' })] })]);
  expect(lines(text)[1][2]).toBe('sequence_feature');
  expect(lines(text)[1][8]).toContain('insdc_type=misc_feature');
  expect(parseGFF3(text).features.seq_1[0].type).toBe('misc_feature');
  expect(soTypeFor("5'UTR").type).toBe('five_prime_UTR');
  expect(soTypeFor('mat_peptide').type).toBe('mature_protein_region');
  expect(soTypeFor('source').type).toBe('region');
  expect(soTypeFor('exon')).toEqual({ type: 'exon' });
  expect(soTypeFor('some_custom_type')).toEqual({ type: 'sequence_feature', original: 'some_custom_type' });
});

it('retains ordinary regions and returns source-region candidates with their bounds', () => {
  const parsed = parseGFF3('##sequence-region seq_1 1 1000\nseq_1\ts\tregion\t100\t200\t.\t+\t.\tID=ordinary\nseq_1\ts\tregion\t1\t1000\t.\t+\t.\tgbkey=Src;host=Homo%20sapiens');
  expect(parsed.features.seq_1).toHaveLength(1);
  expect(parsed.features.seq_1[0]).toMatchObject({ type: 'region', start: 99, end: 200 });
  expect(parsed.details.seq_1).toMatchObject({ start: 0, end: 1000, details: { host: 'Homo sapiens' } });
  expect(parsed.details.seq_1.feature.type).toBe('region');
});

it('does not promote a source-marked partial region when declared length disagrees', () => {
  const parsed = parseGFF3('##sequence-region seq_1 1 1000\nseq_1\ts\tregion\t1\t200\t.\t+\t.\tgbkey=Src;host=camel');
  expect(parsed.details).toEqual({});
  expect(parsed.features.seq_1[0]).toMatchObject({ start: 0, end: 200 });
});

it('exports source details once and counts invalid edited omissions', () => {
  const source = feature({ type: 'source', start: 0, end: 1000, metadata: { organism: 'MERS-CoV', host: 'camel', collection_date: 'March 2014' } });
  const { text, report } = exportToGff3([record({ features: [source], fileDetails: { organism: 'MERS-CoV', host: 'camel', collectionDate: '2014' } })]);
  expect(lines(text)).toHaveLength(1);
  expect(lines(text)[0][8]).toContain('gbkey=Src');
  expect(lines(text)[0][8]).toContain('organism=MERS-CoV');
  expect(text).not.toContain('March');
  expect(report.writtenDetails).toMatchObject({ organism: 1, host: 1 });
  expect(report.invalidDetailsOmitted.collectionDate).toBe(1);
});


it('passes existing SO feature names and accessions through unchanged', () => {
  expect(soTypeFor('ncRNA')).toEqual({ type: 'ncRNA' });
  expect(soTypeFor('repeat_region')).toEqual({ type: 'repeat_region' });
  expect(soTypeFor('SO:0000147')).toEqual({ type: 'SO:0000147' });
  expect(soTypeFor('biological_region')).toEqual({ type: 'biological_region' });
});


it('writes a real phase for a CDS identified by its SO accession', () => {
  const parsed = parseGFF3('seq_1\ts\tSO:0000316\t1\t100\t.\t+\t1\tID=x');
  const { text } = exportToGff3([record({ features: parsed.features.seq_1 })]);
  expect(lines(text)[1][7]).toBe('1');
});

it('preserves per-part directions and coding sequence for mixed-strand joins', () => {
  const original = feature({ start: 0, end: 8, segments: [{ start: 0, end: 3, strand: -1 }, { start: 5, end: 8, strand: 1 }], strand: 1 });
  const r = record({ sequence: 'ACGAACTA', features: [original] });
  const parsed = parseGFF3(exportToGff3([r]).text).features.seq_1[0];
  expect(parsed.segments).toEqual(original.segments);
  expect(extractCodingSequence(parsed, r.sequence).codingSeq).toBe('CGTCTA');
  expect(extractCodingSequence(original, r.sequence).codingSeq).toBe('CGTCTA');
  expect(lines(exportToGff3([{ ...r, features: [parsed] }]).text).slice(1).map(row => row[6])).toEqual(['-', '+']);
});

it('calculates inner-complement join phases in authoritative part order', () => {
  const f = feature({ strand: -1, start: 0, end: 250, segments: [{ start: 0, end: 100, strand: -1 }, { start: 200, end: 250, strand: -1 }], metadata: { codon_start: '2' } });
  expect(lines(exportToGff3([record({ features: [f] })]).text).slice(1).map(row => row[7])).toEqual(['1', '0']);
});

it('preserves the entire high-coordinate run of a three-part circular feature', () => {
  const segments = [{ start: 900, end: 950 }, { start: 975, end: 1000 }, { start: 0, end: 100 }];
  const r = record({ isCircular: true, features: [feature({ start: 900, end: 100, segments })] });
  const parsed = parseGFF3(exportToGff3([r]).text).features.seq_1[0];
  expect(parsed).toMatchObject({ start: 900, end: 100, segments });
  expect(parsed.segments!.reduce((sum, part) => sum + part.end - part.start, 0)).toBe(175);
});

it('orders sorted circular rows at the largest gap without losing exon order', () => {
  const parsed = parseGFF3('seq_1\ts\tregion\t1\t1000\t.\t+\t.\tgbkey=Src;Is_circular=true\nseq_1\ts\tCDS\t1\t100\t.\t+\t0\tID=x\nseq_1\ts\tCDS\t901\t950\t.\t+\t1\tID=x\nseq_1\ts\tCDS\t976\t1000\t.\t+\t2\tID=x').features.seq_1[0];
  expect(parsed).toMatchObject({ start: 900, end: 100, segments: [{ start: 900, end: 950 }, { start: 975, end: 1000 }, { start: 0, end: 100 }] });
  expect(lines(exportToGff3([record({ isCircular: true, features: [parsed] })]).text).slice(1).map(row => row[7])).toEqual(['1', '2', '0']);
});

it.each(['+', '-'])('normalizes canonical unwrapped circular coordinates on strand %s', strand => {
  const parsed = parseGFF3(`seq_1\ts\tregion\t1\t1000\t.\t+\t.\tgbkey=Src;Is_circular=true\nseq_1\ts\tCDS\t901\t1100\t.\t${strand}\t1\tID=x`).features.seq_1[0];
  expect(parsed).toMatchObject({ start: 900, end: 100, segments: [{ start: 900, end: 1000 }, { start: 0, end: 100 }] });
  expect(parsed.segments!.reduce((sum, part) => sum + part.end - part.start, 0)).toBe(200);
  expect(lines(exportToGff3([record({ isCircular: true, features: [parsed] })]).text).slice(1).map(row => row[7])).toEqual(strand === '+' ? ['1', '0'] : ['0', '1']);
});


it('round-trips workspace IDs that match object prototype names', () => {
  const { text } = exportToGff3([record({ id: 'toString', features: [feature()] })]);
  const id: string = 'toString';
  expect(parseGFF3(text).features[id]).toHaveLength(1);
  expect(parseGFF3(text).details[id].details).toEqual({});
});


it('recognizes source regions represented by the SO region accession', () => {
  const parsed = parseGFF3('seq_1\ts\tSO:0000001\t1\t1000\t.\t+\t.\tgbkey=Src;host=camel');
  expect(parsed.details.seq_1).toMatchObject({ start: 0, end: 1000, details: { host: 'camel' } });
});

it('uses a circular landmark without the source marker while retaining it as an annotation', () => {
  const parsed = parseGFF3('##sequence-region seq_1 1 1000\nseq_1\ts\tregion\t1\t1000\t.\t+\t.\tIs_circular=true\nseq_1\ts\tCDS\t901\t1100\t.\t+\t1\tID=x');
  expect(parsed.details).toEqual({});
  expect(parsed.features.seq_1[0].type).toBe('region');
  expect(parsed.features.seq_1[1]).toMatchObject({ start: 900, end: 100, segments: [{ start: 900, end: 1000 }, { start: 0, end: 100 }] });
});

it('writes the source region first independently of source array position', () => {
  const input = record({ features: [feature(), feature({ type: 'source', name: 'source', start: 0, end: 1000, metadata: { host: 'camel' } })] });
  const data = lines(exportToGff3([input]).text);
  expect(data.map(row => row[2])).toEqual(['region', 'CDS']);
  expect(data[0][8]).toContain('host=camel');
});


it('reads NCBI source-region collection-date and nat-host attributes', () => {
  const parsed = parseGFF3('seq_1\ts\tregion\t1\t1000\t.\t+\t.\tgbkey=Src;collection-date=2014;nat-host=camel');
  expect(parsed.details.seq_1.details).toEqual({ collectionDate: '2014', host: 'camel' });
});

it('keeps the first source candidate and retains later candidates as annotations', () => {
  const parsed = parseGFF3('seq_1\ts\tregion\t1\t1000\t.\t+\t.\tID=first;gbkey=Src;host=camel\nseq_1\ts\tregion\t1\t1000\t.\t+\t.\tID=second;gbkey=Src;host=human');
  expect(parsed.details.seq_1.details.host).toBe('camel');
  expect(parsed.features.seq_1[0].metadata?.ID).toBe('second');
});

it('preserves reserved attribute case and distinct custom case variants', () => {
  const metadata = { Dbxref: 'GeneID:1', Note: 'reserved', note: 'custom', Alias: 'a', Ontology_term: 'GO:1' };
  const parsed = parseGFF3(exportToGff3([record({ features: [feature({ metadata })] })]).text);
  expect(parsed.features.seq_1[0].metadata).toMatchObject(metadata);
});


it('merges custom case collisions as encoded GFF3 multi-values without losing data', () => {
  const { text } = exportToGff3([record({ features: [feature({ metadata: { Foo: 'a,b', foo: 'c', FOO: 'a,b' } })] })]);
  expect(lines(text)[1][8]).toContain('foo=a%2Cb,c');
});

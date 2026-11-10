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

import { it, expect } from 'vitest';
import type { BioFeature, SeqRecord } from '@/src/domain/bio/types';
import { exportToGff3, parseGFF3 } from '../gff3';
import { exportToGenBank } from '../../genbank/serialize';
import { parseGenBank } from '../../genbank';
import { soTypeFor } from '../soTypes';
import { extractCodingSequence, extractFeatureSequence } from '@/src/domain/bio/sequence';
import { featureEnvelope } from '@/src/domain/bio/featureEnvelope';
import { parseLocation } from '@/src/core/genbank/locationParser';

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

// GFF3 1.26 has no join/order operator, and a zero-length feature is written "start equals end"
// with the site to the right of that base, which a one-base feature also reads as. The insdc_*
// attributes carry what the columns cannot, so INSDC order() (§3.4.2.2) and n^n+1 (§3.4.2.1)
// survive a round trip.
const siteFeature = feature({ type: 'misc_feature', name: 'cut', betweenBases: true, start: 10, end: 10, segments: [{ start: 10, end: 10 }] });
const orderFeature = feature({ type: 'misc_feature', name: 'pocket', operator: 'order', start: 0, end: 13, segments: [{ start: 0, end: 3 }, { start: 10, end: 13 }] });

it('writes a between-base site as one row with start equal to end, after the base before the site', () => {
  const [, row] = lines(exportToGff3([record({ features: [siteFeature] })]).text);
  expect(row.slice(3, 5)).toEqual(['10', '10']);
  expect(row[8]).toContain('insdc_site=true');
});

it.each([
  { location: 'join(1..3,10^11,16..20)', segments: [{ start: 0, end: 3 }, { start: 10, end: 10 }, { start: 15, end: 20 }], coordinates: [['1', '3'], ['10', '10'], ['16', '20']], siteIndex: 1 },
  { location: 'join(10^11,16..20)', segments: [{ start: 10, end: 10 }, { start: 15, end: 20 }], coordinates: [['10', '10'], ['16', '20']], siteIndex: 0 },
])('preserves compound sites through GenBank import and GFF3 export/import: $location', ({ location, segments, coordinates, siteIndex }) => {
  const imported = parseGenBank(`LOCUS       compound         120 bp    DNA     linear   UNK 01-JAN-2026
FEATURES             Location/Qualifiers
     source          1..120
                     /organism="Test organism"
                     /mol_type="genomic DNA"
     misc_feature    ${location}
ORIGIN
        1 ${'a'.repeat(120)}
//
`);
  expect(imported.findings).toEqual([]);
  const { text } = exportToGff3(imported.records);
  const rows = lines(text).slice(1);
  expect(rows.map(row => row.slice(3, 5))).toEqual(coordinates);
  expect(rows.map(row => row[8].includes('insdc_site=true'))).toEqual(rows.map((_, index) => index === siteIndex));
  const features = Object.values(parseGFF3(text).features).flat();
  expect(features).toHaveLength(1);
  expect(features[0].segments).toEqual(segments);
  expect(features[0].operator).toBe('join');
  expect(features[0].betweenBases).toBeUndefined();
});

it('writes the operator of an order() feature on each of its rows', () => {
  const rows = lines(exportToGff3([record({ features: [orderFeature] })]).text).slice(1);
  expect(rows.map(row => row.slice(3, 5))).toEqual([['1', '3'], ['11', '13']]);
  expect(rows.every(row => row[8].includes('insdc_operator=order'))).toBe(true);
});

it.each([
  ['a site', siteFeature, { betweenBases: true, start: 10, end: 10 }],
  ['an order() feature', orderFeature, { operator: 'order', segments: [{ start: 0, end: 3 }, { start: 10, end: 13 }] }],
])('reads %s back from its own export', (_label, original, expected) => {
  const [imported] = parseGFF3(exportToGff3([record({ features: [original] })]).text).features.seq_1;
  expect(imported).toMatchObject(expected);
  expect(imported.metadata).not.toHaveProperty('insdc_site');
  expect(imported.metadata).not.toHaveProperty('insdc_operator');
});

it('reads a one-base row without insdc_site as one base, not a site', () => {
  const [imported] = parseGFF3('##gff-version 3\nseq_1\t.\tmisc_feature\t10\t10\t.\t+\t.\tID=a\n').features.seq_1;
  expect(imported).toMatchObject({ start: 9, end: 10 });
  expect(imported.betweenBases).toBeUndefined();
});

it('reads rows sharing an ID without insdc_operator as a join', () => {
  const text = '##gff-version 3\nseq_1\t.\tmisc_feature\t1\t3\t.\t+\t.\tID=a\nseq_1\t.\tmisc_feature\t11\t13\t.\t+\t.\tID=a\n';
  expect(parseGFF3(text).features.seq_1[0].operator).toBe('join');
});

// LOC-4 through GFF3: each row carries its own interval's markers, read from the flags, so an edited
// feature keeps them and a remote accession's digits can never be mistaken for a base number.
it('writes and reads back per-row partial markers from the interval flags', () => {
  const partial = feature({ type: 'misc_feature', name: 'p', operator: 'join', start: 0, end: 30,
    segments: [{ start: 0, end: 10, partialStart: true }, { start: 20, end: 30, partialEnd: true }] });
  const rows = lines(exportToGff3([record({ features: [partial] })]).text).slice(1);
  expect(rows.map(row => [row[8].includes('insdc_partial_start=%3C'), row[8].includes('insdc_partial_end=%3E')])).toEqual([[true, false], [false, true]]);
  const [imported] = parseGFF3(exportToGff3([record({ features: [partial] })]).text).features.seq_1;
  expect(imported.segments).toEqual([{ start: 0, end: 10, partialStart: true }, { start: 20, end: 30, partialEnd: true }]);
  expect(imported.metadata).not.toHaveProperty('_gffPartialEnds');
});

// #241 through GFF3: rows have no nesting, so insdc_written_order carries the written order and the
// nested feature keeps its linear envelope and its sequence after a round trip.
it('keeps the written order of a nested feature through GFF3', () => {
  const parsed = parseLocation('complement(join(complement(1..3),10..12))');
  const nested = feature({ type: 'misc_feature', name: 'n', strand: parsed.strand, start: parsed.start, end: parsed.end,
    segments: parsed.segments, operator: parsed.operator, writtenOrder: parsed.writtenOrder });
  const circular = record({ sequence: 'ACGTTGCAAGCTTCAGGATC', isCircular: true, features: [nested] });
  const [imported] = parseGFF3(exportToGff3([circular]).text).features.seq_1;
  expect(imported.writtenOrder).toEqual([1, 0]);
  expect(featureEnvelope(imported)).toEqual({ start: 0, end: 12 });
  expect(extractFeatureSequence(imported, circular.sequence).featureSeq).toBe(extractFeatureSequence(nested, circular.sequence).featureSeq);
  expect(imported.metadata).not.toHaveProperty('insdc_written_order');
});

// #245 through GFF3, which has no remote reference: insdc_remote carries the remote parts, each
// with its stored position, and the export report counts the features that need it.
it('carries remote parts through GFF3 and counts them in the report', () => {
  const parsed = parseLocation('join(1..100,J00194.1:100..202)');
  const withRemote = feature({ type: 'CDS', name: 'r', strand: parsed.strand, start: parsed.start, end: parsed.end,
    segments: parsed.segments, operator: parsed.operator, remoteParts: parsed.remoteParts });
  const remoteOnly = feature({ type: 'misc_feature', name: 'away', start: 0, end: 0, segments: [],
    remoteParts: [{ accession: 'J00194.1', start: 1, end: 3, strand: 1, index: 0 }] });
  const { text, report } = exportToGff3([record({ features: [withRemote, remoteOnly] })]);
  expect(report.remotePartsCarried).toBe(1);
  expect(report.remoteOnlyOmitted).toBe(1);
  const [imported] = parseGFF3(text).features.seq_1;
  expect(imported.remoteParts).toEqual(parsed.remoteParts);
  expect(imported.metadata).not.toHaveProperty('insdc_remote');
});

it('writes a reverse remote part back on its own strand after a GFF3 round trip', () => {
  const parsed = parseLocation('join(complement(J00194.1:100..202),1..100)');
  const original = feature({ type: 'misc_feature', name: 'r', strand: parsed.strand, start: parsed.start, end: parsed.end,
    segments: parsed.segments, operator: parsed.operator, remoteParts: parsed.remoteParts });
  const [imported] = parseGFF3(exportToGff3([record({ features: [original] })]).text).features.seq_1;
  expect(exportToGenBank([record({ features: [{ ...imported, type: 'misc_feature' }] })]).text)
    .toContain('join(complement(J00194.1:100..202),1..100)');
});

// Codex review of #306: GFF3 round trips must keep what GenBank keeps.
it.each([
  // order() with one local interval: the operator counts the remote part too (LOC-2).
  ['order(1..3,J00194.1:10..12)', false],
  // On a circular record, rows that carry a remote part are not rotated (LOC-1).
  ['join(1..3,J00194.1:10..12,28..30)', true],
])('keeps %s through GFF3', (location, isCircular) => {
  const parsed = parseLocation(location);
  const original = feature({ type: 'misc_feature', name: 'g', strand: parsed.strand, start: parsed.start, end: parsed.end,
    segments: parsed.segments, operator: parsed.operator, remoteParts: parsed.remoteParts });
  const source = record({ sequence: 'A'.repeat(30), isCircular, features: [original] });
  const [imported] = parseGFF3(exportToGff3([source]).text).features.seq_1;
  expect(exportToGenBank([{ ...source, features: [imported] }]).text).toContain(location);
});

// LOC-3: per-interval complements on one strand are not a whole-feature complement, so their
// evaluation order survives GFF3 (join(complement(1..3),complement(7..9)) reads TTT then CCC).
it('keeps the evaluation order of same-strand inner complements through GFF3', () => {
  const parsed = parseLocation('join(complement(1..3),complement(7..9))');
  const original = feature({ type: 'misc_feature', name: 'c', strand: parsed.strand, start: parsed.start, end: parsed.end,
    segments: parsed.segments, operator: parsed.operator });
  const sequence = 'AAACCCGGGTTT';
  const [imported] = parseGFF3(exportToGff3([record({ sequence, features: [original] })]).text).features.seq_1;
  expect(extractFeatureSequence(original, sequence).featureSeq).toBe('TTTCCC');
  expect(extractFeatureSequence(imported, sequence).featureSeq).toBe('TTTCCC');
  expect(imported.metadata).not.toHaveProperty('insdc_interval_strands');
});

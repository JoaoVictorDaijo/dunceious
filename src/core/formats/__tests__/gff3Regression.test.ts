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
import type { SeqRecord } from '@/src/domain/bio/types';
import { extractCodingSequence, translateSequence } from '@/src/domain/bio/sequence';
import { exportToGenBank } from '@/src/core/genbank/serialize';
import { parseGenBank } from '@/src/core/genbank';
import { parseGFF3, exportToGff3 } from '../gff3';

const record = (features: SeqRecord['features'], sequence = 'AATGAAACCC'): SeqRecord => ({
  id: 's', name: 's', sequence, features,
});
const rows = (text: string) => text.split('\n').filter(line => line && !line.startsWith('#')).map(line => line.split('\t'));

it.each([
  ['+', 'AATGAAACCC', '1', '0'],
  ['-', 'GGGTTTCATT', '0', '1'],
])('uses the first transcription phase for CDS translation on %s', (strand, sequence, lowPhase, highPhase) => {
  const input = `s\tx\tCDS\t1\t4\t.\t${strand}\t${lowPhase}\tID=c\ns\tx\tCDS\t5\t10\t.\t${strand}\t${highPhase}\tID=c`;
  const [feature] = parseGFF3(input).features.s;
  const protein = translateSequence(extractCodingSequence(feature, sequence).codingSeq);
  expect(protein).toBe('MKP');
  expect(feature.metadata?.codon_start).toBe('2');
  const gb = parseGenBank(exportToGenBank([record([feature], sequence)]).text)[0];
  const cds = gb.features.find(f => f.type === 'CDS')!;
  expect(translateSequence(extractCodingSequence(cds, gb.sequence).codingSeq)).toBe(protein);
});

it('honors a single-part imported phase before any export', () => {
  const [feature] = parseGFF3('s\tx\tCDS\t1\t10\t.\t+\t1\tID=c').features.s;
  expect(extractCodingSequence(feature, 'AATGAAACCC').codingSeq).toBe('ATGAAACCC');
  expect(rows(exportToGff3([record([feature])]).text)[1][7]).toBe('1');
});

it('exports the current reading frame after editing an imported CDS', () => {
  const [feature] = parseGFF3('s\tx\tCDS\t1\t10\t.\t+\t1\tID=c').features.s;
  feature.metadata!.codon_start = '3';
  const output = rows(exportToGff3([record([feature])]).text)[1];
  expect(output[7]).toBe('2');
  expect(output[8]).toContain('codon_start=3');
});

it('recalculates imported multipart phases after geometry edits', () => {
  const [feature] = parseGFF3('s\tx\tCDS\t1\t4\t.\t+\t1\tID=c\ns\tx\tCDS\t7\t10\t.\t+\t0\tID=c').features.s;
  feature.segments![0].end = 3;
  expect(rows(exportToGff3([record([feature])]).text).slice(1).map(row => row[7])).toEqual(['1', '1']);
});

it('recalculates imported phases after a strand edit', () => {
  const [feature] = parseGFF3('s\tx\tCDS\t1\t4\t.\t+\t1\tID=c\ns\tx\tCDS\t7\t10\t.\t+\t0\tID=c').features.s;
  feature.strand = -1;
  expect(rows(exportToGff3([record([feature])]).text).slice(1).map(row => row[7])).toEqual(['0', '1']);
});

it('preserves GFF3 attribute lists and literal encoded commas independently', () => {
  const [feature] = parseGFF3('s\tx\tCDS\t1\t10\t.\t+\t0\tID=c;Parent=t1,t2;Dbxref=GeneID:1,DB:literal%2Ccomma;Alias=a,b').features.s;
  const targets = ['t1', 't2'].map(ID => ({ ...feature, type: 'mRNA', metadata: { ID } }));
  const text = exportToGff3([record([feature, ...targets])]).text;
  expect(rows(text)[1][8]).toContain('Parent=s.2,s.3');
  expect(rows(text)[1][8]).toContain('Dbxref=GeneID%3A1,DB%3Aliteral%2Ccomma');
  expect(rows(text)[1][8]).toContain('Alias=a,b');
  const reparsed = parseGFF3(text).features.s[0];
  expect(reparsed.metadata?.Dbxref).toBe('GeneID:1,DB:literal,comma');
});

it('does not reuse imported list values after an attribute edit', () => {
  const [feature] = parseGFF3('s\tx\tCDS\t1\t10\t.\t+\t0\tID=c;Dbxref=DB:1,DB:2').features.s;
  feature.metadata!.Dbxref = 'DB:new, literal';
  expect(rows(exportToGff3([record([feature])]).text)[1][8]).toContain('Dbxref=DB%3Anew%2C%20literal');
});

it('preserves canonical INSDC qualifier spelling through GFF3 and GenBank', () => {
  const input = record([{ type: 'CDS', name: 'c', start: 0, end: 10, strand: 1,
    metadata: { EC_number: '1.2.3.4', circular_RNA: '', Custom_Key: 'custom' } }]);
  const gff = exportToGff3([input]).text;
  const parsed = parseGFF3(gff).features.s;
  const gb = exportToGenBank([record(parsed)]).text;
  expect(gb).toContain('/EC_number="1.2.3.4"');
  expect(gb).toContain('/circular_RNA\n');
  expect(parsed[0].metadata?.custom_key).toBe('custom');
});

it('remaps GFF3 relationships after allocating all feature IDs', () => {
  const parsed = parseGFF3('s\tx\tmRNA\t1\t10\t.\t+\t.\tID=t;Parent=g\ns\tx\tgene\t1\t10\t.\t+\t.\tID=g\ns\tx\tCDS\t1\t10\t.\t+\t0\tID=c;Parent=t;Derives_from=g');
  const data = rows(exportToGff3([record(parsed.features.s)]).text);
  expect(data[1][8]).toContain('Parent=s.2');
  expect(data[3][8]).toContain('Parent=s.1');
  expect(data[3][8]).toContain('Derives_from=s.2');
});

it('omits only absent relationship targets and reports each affected attribute', () => {
  const parsed = parseGFF3('s\tx\tmRNA\t1\t10\t.\t+\t.\tID=t\ns\tx\tCDS\t1\t10\t.\t+\t0\tID=c;Parent=t,missing;Derives_from=absent');
  const { text, report } = exportToGff3([record(parsed.features.s)]);
  const attrs = rows(text)[2][8];
  expect(attrs).toContain('Parent=s.1');
  expect(attrs).not.toContain('missing');
  expect(attrs).not.toContain('Derives_from');
  expect(report.droppedAttributes).toBe(2);
});

it('exports source qualifiers beyond editable details without bypassing detail validation', () => {
  const input = record([{ type: 'source', name: 'source', start: 0, end: 10, strand: 1,
    metadata: { isolate: 'K1', strain: 'S1', environmental_sample: '', collection_date: 'bad edit', organism: 'virus' } }]);
  input.fileDetails = { organism: 'virus', collectionDate: '2014' };
  const { text, report } = exportToGff3([input]);
  const metadata = parseGFF3(text).details.s.feature.metadata;
  expect(metadata).toMatchObject({ isolate: 'K1', strain: 'S1', environmental_sample: '', organism: 'virus' });
  expect(metadata).not.toHaveProperty('collection_date');
  expect(report.invalidDetailsOmitted.collectionDate).toBe(1);
  expect(rows(text)).toHaveLength(1);
});

it.each(['<1..>10', 'complement(<1..>10)', 'join(<1..3,7..>10)', 'complement(join(<1..3,7..>10))', 'join(complement(<1..3),7..>10)'])('preserves partial endpoints through GenBank and GFF3 for %s', locationString => {
  const gb = `LOCUS       s 10 bp DNA linear\nFEATURES             Location/Qualifiers\n     CDS             ${locationString}\nORIGIN\n        1 aatgaaaccc\n//`;
  const input = parseGenBank(gb)[0];
  const gff = exportToGff3([input]).text;
  const features = parseGFF3(gff).features.s;
  const result = parseGenBank(exportToGenBank([record(features)]).text)[0];
  expect(result.features.find(f => f.type === 'CDS')?.locationString).toBe(locationString);
  expect(gff).toContain('insdc_partial_start=%3C');
  expect(gff).toContain('insdc_partial_end=%3E');
});

it('remaps repeated imported IDs within each record independently', () => {
  const inputs = ['a', 'b'].map(id => ({ ...record(parseGFF3(`${id}\tx\tgene\t1\t10\t.\t+\t.\tID=g\n${id}\tx\tCDS\t1\t10\t.\t+\t0\tID=c;Parent=g`).features[id]), id }));
  const { text, report } = exportToGff3(inputs);
  const cds = rows(text).filter(row => row[2] === 'CDS');
  expect(cds.map(row => row[8])).toEqual([
    expect.stringContaining('Parent=a.1'), expect.stringContaining('Parent=b.1'),
  ]);
  expect(report.droppedAttributes).toBe(0);
});

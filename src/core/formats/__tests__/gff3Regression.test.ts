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
  const text = exportToGff3([record([feature])]).text;
  expect(rows(text)[1][8]).toContain('Parent=t1,t2');
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

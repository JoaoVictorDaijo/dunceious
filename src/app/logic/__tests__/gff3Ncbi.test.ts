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

import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { exportToGff3, parseGFF3 } from '@/src/core/formats/gff3';
import { parseGenBank } from '@/src/core/genbank';
import { extractCodingSequence, translateSequence } from '@/src/domain/bio/sequence';
import { conceptualTranslation } from '@/src/domain/bio/translation';
import type { SeqRecord } from '@/src/domain/bio/types';
import { handleBioMessage } from '@/src/workers/handlers/bio';
import { applyAnnotations } from '../bioResponse';

const fixtureDirectory = 'src/core/formats/__tests__/fixtures/ncbi-gff3/';
const read = (path: string) => readFileSync(path, 'utf8');

function attach(record: SeqRecord, content: string) {
  const response = handleBioMessage({ type: 'PARSE_ANNOTATIONS', filename: 'reference.gff3', content });
  if (response.type !== 'ANNOTATIONS_SUCCESS') throw new Error(JSON.stringify(response));
  const result = applyAnnotations([{ ...record, features: [] }], response.annotations, response.details, response.idMap, response.gffNotices);
  expect(result.refusal).toBeUndefined();
  return result;
}

function reordered(content: string, order: 'reverse features' | 'sort by start'): string {
  const lines = content.trimEnd().split('\n');
  const headers = lines.filter(line => line.startsWith('#'));
  const rows = lines.filter(line => line && !line.startsWith('#'));
  if (order === 'sort by start') {
    return [...headers, ...rows.sort((a, b) => Number(a.split('\t')[3]) - Number(b.split('\t')[3]))].join('\n');
  }
  const id = (row: string) => /(?:^|;)ID=([^;]+)/.exec(row.split('\t')[8])?.[1];
  const byId = new Map<string, string[]>();
  for (const row of rows) {
    const key = id(row);
    if (key !== undefined) {
      const group = byId.get(key) ?? [];
      group.push(row);
      byId.set(key, group);
    }
  }
  return [...headers, ...rows.map(row => byId.get(id(row) ?? '')?.pop() ?? row)].join('\n');
}

const references = {
  t4: {
    gff: 'NC_000866.4.gff3',
    genBank: 'examples/nucleotide/t4-phages/phage-t4-NC_000866.gb',
    proteins: ['NP_049618.1', 'NP_049690.1', 'NP_049841.1', 'NP_049848.1',
      'NP_049616.1', 'NP_049617.1', 'NP_049619.1', 'NP_049620.1'],
  },
  phage13a: {
    gff: 'NC_011045.1.gff3',
    genBank: 'examples/nucleotide/t7-phages/phage-13a-NC_011045.gb',
    proteins: ['YP_002003958.1'],
  },
  chloroplast: {
    gff: 'NC_000932.1.gff3',
    genBank: 'examples/nucleotide/arabidopsis-chloroplast-NC_000932.gb',
    proteins: ['NP_051037.1', 'NP_051038.1'],
  },
  phiX174: {
    gff: 'NC_001422.1.gff3',
    genBank: fixtureDirectory + 'NC_001422.1.gb',
    proteins: ['NP_040703.1', 'NP_040704.1'],
  },
};

it.each([
  { reference: 't4', order: 'original' },
  { reference: 't4', order: 'reverse features' },
  { reference: 't4', order: 'sort by start' },
  { reference: 'phage13a', order: 'original' },
  { reference: 'phage13a', order: 'reverse features' },
  { reference: 'phiX174', order: 'original' },
  { reference: 'chloroplast', order: 'original' },
  { reference: 'chloroplast', order: 'reverse features' },
  { reference: 'chloroplast', order: 'sort by start' },
] as const)('matches GenBank translations for $reference in $order order', ({ reference, order }) => {
  const { gff, genBank, proteins } = references[reference];
  const genBankText = read(genBank);
  const { records: [oracle] } = parseGenBank(genBankText);
  const accession = gff.replace('.gff3', '');
  expect(/^VERSION +(.+)$/m.exec(genBankText)?.[1]).toBe(accession);
  const landmark = { ...oracle, id: accession };
  const original = read(fixtureDirectory + gff);
  const content = order === 'original' ? original : reordered(original, order);
  const { next: [record], warnings } = attach(landmark, content);
  const baseline = order === 'original' ? undefined : attach(landmark, original).next[0];

  for (const id of proteins) {
    const expected = oracle.features.find(feature => feature.metadata?.protein_id === id)?.metadata?.translation;
    expect(expected, id).toBeTruthy();
    const actual = record.features.find(feature => feature.metadata?.ID === 'cds-' + id)!;
    expect(actual, id).toBeDefined();
    if (reference === 'chloroplast') {
      expect.soft(warnings.filter(warning => warning.includes(id)), id).toEqual([]);
    }
    const translation = conceptualTranslation(actual, record);
    expect.soft(translation.status === 'ok' ? translation.residues : translation.reason, id).toBe(expected);
    if (baseline) {
      const same = baseline.features.find(feature => feature.metadata?.ID === actual.metadata?.ID)!;
      expect.soft(actual, id).toEqual(same);
      expect.soft(extractCodingSequence(actual, record.sequence).codingSeq, id)
        .toBe(extractCodingSequence(same, baseline.sequence).codingSeq);
    }
  }
});

function mixedStrandRps12Rows() {
  return read(fixtureDirectory + references.chloroplast.gff).split('\n')
    .filter(row => row.includes('\tID=cds-NP_051038.1;'));
}

it('warns when reversed rps12 rows without ranks are read in mixed-strand file order', () => {
  const content = mixedStrandRps12Rows().reverse().map(row => row.replace(/;part=\d+/, '')).join('\n');
  const { records: [landmark] } = parseGenBank(read(references.chloroplast.genBank));
  const { next: [record], warnings } = attach({ ...landmark, id: 'NC_000932.1' }, content);
  expect.soft(record.features[0].segments).toEqual([
    { start: 140624, end: 140650, strand: 1 },
    { start: 139855, end: 140087, strand: 1 },
    { start: 69610, end: 69724, strand: -1 },
  ]);
  expect(warnings).toEqual([expect.stringMatching(/NP_051038\.1.*mixed.strand.*taken from the file/i)]);
});

it('consumes rps12 ranks on import and omits them from every exported row', () => {
  const { records: [landmark] } = parseGenBank(read(references.chloroplast.genBank));
  const { next: [record] } = attach({ ...landmark, id: 'NC_000932.1' }, mixedStrandRps12Rows().join('\n'));
  expect.soft(record.features[0].metadata).not.toHaveProperty('part');
  const rows = exportToGff3([record]).text.split('\n').filter(row => row.split('\t')[2] === 'CDS');
  expect(rows).toHaveLength(3);
  expect(rows.map(row => row.split('\t')[8].match(/(?:^|;)part=[^;]*/g) ?? [])).toEqual([[], [], []]);
});

it('omits a stored rank when exporting a feature from an older project', () => {
  const { records: [landmark] } = parseGenBank(read(references.chloroplast.genBank));
  const { next: [record] } = attach({ ...landmark, id: 'NC_000932.1' }, mixedStrandRps12Rows().join('\n'));
  record.features[0].metadata!.part = '1';
  expect(exportToGff3([record]).text).not.toMatch(/[\t;]part=/);
});

it.each([true, false])('reports in-bounds circular end rows with landmark declaration=%s', declared => {
  const { next: [record], warnings } = attach({
    id: 'workspace-circle', name: 'circle', sequence: 'ATGCCCAAATAA', isCircular: true, features: [],
  }, [
    ...(declared ? ['circle\t.\tregion\t1\t12\t.\t+\t.\tgbkey=Src;Is_circular=true'] : []),
    'circle\t.\tCDS\t1\t3\t.\t+\t0\tID=end-touching',
    'circle\t.\tCDS\t7\t12\t.\t+\t0\tID=end-touching',
  ].join('\n'));
  const cds = record.features.find(feature => feature.type === 'CDS')!;
  expect.soft(conceptualTranslation(cds, record)).toMatchObject({ status: 'ok', residues: 'MK' });
  expect.soft(cds).toMatchObject({ start: 0, end: 12, segments: [{ start: 0, end: 3 }, { start: 6, end: 12 }] });
  expect(warnings).toEqual([expect.stringMatching(/workspace-circle.*end-touching.*separate intervals.*older Dunceious.*sequence and translation/i)]);
});

function attachCds(sequence: string, rows: string[], isCircular = false, declareCircular = isCircular) {
  const { next: [record], warnings } = attach({
    id: 'workspace-record', name: 's', sequence, isCircular, features: [],
  }, [
    ...(declareCircular ? [`s\t.\tregion\t1\t${sequence.length}\t.\t+\t.\tgbkey=Src;Is_circular=true`] : []),
    ...rows.map(row => 's\t.\tCDS\t' + row),
  ].join('\n'));
  const cds = record.features.find(feature => feature.type === 'CDS')!;
  const protein = translateSequence(extractCodingSequence(cds, record.sequence).codingSeq).replaceAll('_', '*');
  return { cds, protein, warnings };
}

it('uses coordinate order for a descending plus-strand group without ranks', () => {
  const { protein, warnings } = attachCds('AAATAAATGAAA', [
    '7\t12\t.\t+\t0\tID=t',
    '1\t6\t.\t+\t0\tID=t',
  ]);
  expect(protein).toBe('K*MK');
  expect(warnings).toEqual([]);
});

it('reports coordinate reordering for in-bounds plus rows on a circular landmark', () => {
  const { protein, warnings } = attachCds('GTAACCATGAAAGGG', [
    '7\t12\t.\t+\t0\tID=c',
    '2\t4\t.\t+\t0\tID=c',
  ], true);
  expect.soft(protein).toBe('*MK');
  expect(warnings).toEqual([expect.stringMatching(/workspace-record.*\bc\b.*coordinate order.*origin/i)]);
});

it.each([false, true])('compares the documented circular minus CDS shape with descending rows=%s', descending => {
  const first = 'NC_004367.1\tRefSeq\tCDS\t959\t966\t.\t-\t0\tID=cds0;Parent=rna0';
  const second = 'NC_004367.1\tRefSeq\tCDS\t140247\t140485\t.\t-\t1\tID=cds0;Parent=rna0';
  const { features, notices } = parseGFF3([
    '##sequence-region NC_004367.1 1 149696',
    'NC_004367.1\tRefSeq\tregion\t1\t149696\t.\t+\t.\tID=landmark;gbkey=Src;Is_circular=true',
    'NC_004367.1\tRefSeq\tgene\t138637\t150662\t.\t-\t.\tID=gene0',
    'NC_004367.1\tRefSeq\tmRNA\t138637\t150662\t.\t-\t.\tID=rna0;Parent=gene0',
    ...(descending ? [second, first] : [first, second]),
  ].join('\n'));
  const cds = features['NC_004367.1'].find(feature => feature.type === 'CDS');
  expect.soft(cds).toMatchObject({
    strand: -1,
    segments: [{ start: 958, end: 966 }, { start: 140246, end: 140485 }],
    metadata: { codon_start: '2' },
  });
  expect(notices?.['NC_004367.1'] ?? []).toEqual(descending ? [] : [
    { message: expect.stringMatching(/cds0.*coordinate order.*origin/i) },
  ]);
});

it('uses NCBI part ranks with row totals to override coordinate order', () => {
  const { protein, warnings } = attachCds('AAATAAATGAAA', [
    '7\t12\t.\t+\t0\tID=t;part=1/2',
    '1\t6\t.\t+\t0\tID=t;part=2/2',
  ]);
  expect.soft(protein).toBe('MKK*');
  expect(warnings).toEqual([]);
});

it('uses three ranks with and without row totals on a gene', () => {
  const { features, notices } = parseGFF3([
    's\t.\tgene\t2\t4\t.\t+\t.\tID=g;part=3/3',
    's\t.\tgene\t5\t7\t.\t+\t.\tID=g;part=2',
    's\t.\tgene\t8\t10\t.\t+\t.\tID=g;part=1/3',
  ].join('\n'));
  expect.soft(features.s[0].segments).toEqual([
    { start: 7, end: 10 }, { start: 4, end: 7 }, { start: 1, end: 4 },
  ]);
  expect(notices).toBeUndefined();
});

it.each([
  { name: 'a gap', parts: [';part=1', ';part=3'] },
  { name: 'duplicate ranks', parts: [';part=1/2', ';part=1/2'] },
  { name: 'a non-numeric rank', parts: [';part=first', ';part=2/2'] },
  { name: 'one incorrect total', parts: [';part=1/2', ';part=2/3'] },
  { name: 'a missing rank', parts: ['', ';part=2/2'] },
])('ignores ranks and warns for $name on monotonic rows', ({ parts }) => {
  const { protein, warnings } = attachCds('AAATAAATGAAA', [
    '7\t12\t.\t+\t0\tID=t' + parts[0],
    '1\t6\t.\t+\t0\tID=t' + parts[1],
  ]);
  expect.soft(protein).toBe('K*MK');
  expect(warnings).toEqual([expect.stringMatching(/workspace-record.*\bt\b.*part.*ranks.*ignored/i)]);
});

it('warns if a single row claims a larger ranked group', () => {
  const { protein, warnings } = attachCds('ATGAAA', ['1\t6\t.\t+\t0\tID=t;part=1/2']);
  expect.soft(protein).toBe('MK');
  expect(warnings).toEqual([expect.stringMatching(/workspace-record.*\bt\b.*part.*ranks.*ignored/i)]);
});

it.each([
  ['unranked', ['', '', '']],
  ['incomplete', [';part=3', '', ';part=1']],
  ['duplicate ranks', [';part=3', ';part=1', ';part=1']],
] as const)('warns and reads a non-monotonic minus-strand group in file order with %s rows', (_, ranks) => {
  const { protein, warnings } = attachCds('TTATTTCAT', [
    '7\t9\t.\t-\t0\tID=splice' + ranks[0],
    '1\t3\t.\t-\t0\tID=splice' + ranks[1],
    '4\t6\t.\t-\t0\tID=splice' + ranks[2],
  ]);
  expect.soft(protein).toBe('M*K');
  expect(warnings).toEqual([
    ...(ranks.some(Boolean) ? [expect.stringMatching(/workspace-record.*splice.*part.*ranks.*ignored/i)] : []),
    expect.stringMatching(/workspace-record.*splice.*row order.*taken from the file/i),
  ]);
});

it.each([
  { strand: '+', rows: ['10\t15\t.\t+\t0\tID=c', '5\t7\t.\t+\t0\tID=c'], protein: '*MK' },
  { strand: '-', rows: ['5\t7\t.\t-\t0\tID=c', '10\t15\t.\t-\t0\tID=c'], protein: 'FHL' },
])('reports a change from file order on strand $strand for an extended row', ({ rows, protein }) => {
  const result = attachCds('AAACTAACCATG', rows, true);
  expect.soft(result.protein).toBe(protein);
  expect(result.warnings).toEqual([expect.stringMatching(/workspace-record.*\bc\b.*coordinate order.*origin/i)]);
});

it('takes the minus-strand phase from the extended row read first in coordinate order', () => {
  const { cds, protein } = attachCds('AAACTAACCATG', [
    '5\t7\t.\t-\t2\tID=c',
    '10\t14\t.\t-\t1\tID=c',
  ], true);
  expect(cds.metadata?.codon_start).toBe('2');
  expect(protein).toBe('SF');
});

it.each([
  { name: 'out-of-range written order', attributes: [';insdc_written_order=5', ''] },
  { name: 'interval-strand marker on the second row only', attributes: ['', ';insdc_interval_strands=true'] },
  { name: 'invalid rank on all rows', attributes: [';insdc_written_order=,1', ';insdc_written_order=,1'] },
  { name: 'invalid remote descriptor', attributes: [';insdc_remote=1:bad', ';insdc_remote=1:bad'] },
  { name: 'different valid rank lists', attributes: [';insdc_written_order=0,1', ';insdc_written_order=1,0'] },
])('falls back to coordinate order and warns for $name', ({ attributes }) => {
  const { protein, warnings } = attachCds('TTAGGGTTTCAT', [
    '7\t12\t.\t-\t0\tID=m' + attributes[0],
    '1\t3\t.\t-\t0\tID=m' + attributes[1],
  ]);
  expect.soft(protein).toBe('MK*');
  expect(warnings).toEqual([expect.stringMatching(/workspace-record.*\bm\b.*private.*ignored/i)]);
});

it('prefers consistent private order when the part ranks disagree with it', () => {
  const { protein, warnings } = attachCds('TTAGGGTTTCAT', [
    '7\t12\t.\t-\t0\tID=m;insdc_interval_strands=true;part=2',
    '1\t3\t.\t-\t0\tID=m;insdc_interval_strands=true;part=1',
  ]);
  expect(protein).toBe('MK*');
  expect(warnings).toEqual([]);
});

it.each([
  { name: 'a linear landmark', circular: false, spans: [[1, 3], [7, 12]] },
  { name: 'rows short of the landmark end', circular: true, spans: [[1, 3], [7, 9]] },
  { name: 'a group with an extended row', circular: true, spans: [[1, 3], [10, 15]] },
])('omits the split-origin notice for $name', ({ circular, spans }) => {
  const { warnings } = attachCds('ATGCCCAAATAA',
    spans.map(([start, end]) => `${start}\t${end}\t.\t+\t0\tID=end-touching`), circular);
  expect(warnings).toEqual([]);
});

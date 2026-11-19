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
import { parseGenBank } from '@/src/core/genbank';
import { extractCodingSequence } from '@/src/domain/bio/sequence';
import { conceptualTranslation } from '@/src/domain/bio/translation';
import type { SeqRecord } from '@/src/domain/bio/types';
import { handleBioMessage } from '@/src/workers/handlers/bio';
import { applyAnnotations } from '../bioResponse';

const fixtureDirectory = 'src/core/formats/__tests__/fixtures/ncbi-gff3/';
const read = (path: string) => readFileSync(path, 'utf8');

function attach(record: SeqRecord, content: string) {
  const response = handleBioMessage({ type: 'PARSE_ANNOTATIONS', filename: 'reference.gff3', content });
  if (response.type !== 'ANNOTATIONS_SUCCESS') throw new Error(JSON.stringify(response));
  const result = applyAnnotations([{ ...record, features: [] }], response.annotations, response.details, response.idMap, response.originNotices);
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
] as const)('matches GenBank translations for $reference in $order order', ({ reference, order }) => {
  const { gff, genBank, proteins } = references[reference];
  const genBankText = read(genBank);
  const { records: [oracle] } = parseGenBank(genBankText);
  const accession = gff.replace('.gff3', '');
  expect(/^VERSION +(.+)$/m.exec(genBankText)?.[1]).toBe(accession);
  const landmark = { ...oracle, id: accession };
  const original = read(fixtureDirectory + gff);
  const content = order === 'original' ? original : reordered(original, order);
  const { next: [record] } = attach(landmark, content);
  const baseline = order === 'original' ? undefined : attach(landmark, original).next[0];

  for (const id of proteins) {
    const expected = oracle.features.find(feature => feature.metadata?.protein_id === id)?.metadata?.translation;
    expect(expected, id).toBeTruthy();
    const actual = record.features.find(feature => feature.metadata?.ID === 'cds-' + id)!;
    expect(actual, id).toBeDefined();
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

it.each([true, false])('reports in-bounds circular end rows with landmark declaration=%s', declared => {
  const { next: [record], warnings } = attach({
    id: 'circle', name: 'circle', sequence: 'ATGCCCAAATAA', isCircular: true, features: [],
  }, [
    ...(declared ? ['circle\t.\tregion\t1\t12\t.\t+\t.\tgbkey=Src;Is_circular=true'] : []),
    'circle\t.\tCDS\t1\t3\t.\t+\t0\tID=end-touching',
    'circle\t.\tCDS\t7\t12\t.\t+\t0\tID=end-touching',
  ].join('\n'));
  const cds = record.features.find(feature => feature.type === 'CDS')!;
  expect.soft(conceptualTranslation(cds, record)).toMatchObject({ status: 'ok', residues: 'MK' });
  expect.soft(cds).toMatchObject({ start: 0, end: 12, segments: [{ start: 0, end: 3 }, { start: 6, end: 12 }] });
  expect(warnings).toEqual([expect.stringMatching(/end-touching.*read as separate intervals.*one row whose end exceeds the landmark length/)]);
});

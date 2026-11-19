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
import { extractFeatureSequence } from '@/src/domain/bio/sequence';
import { conceptualTranslation } from '@/src/domain/bio/translation';
import { handleBioMessage } from '@/src/workers/handlers/bio';
import { exportToGenBank, parseGenBank } from '../index';

function genBank(locus: string, sequence: string, features = '', origin = 'ORIGIN'): string {
  return `LOCUS       ${locus}
FEATURES             Location/Qualifiers
${features}${origin}
        1 ${sequence}
//
`;
}

function importGenBank(content: string) {
  return handleBioMessage({ type: 'PARSE_GENBANK', filename: 'fixture.gb', content });
}

it('opens human VMO1 and round-trips its bond locations verbatim', () => {
  const input = readFileSync('src/core/genbank/__tests__/fixtures/vmo1-human.gb', 'utf8');
  const descriptors = ['bond(53,86)', 'bond(114,146)', 'bond(169,199)', 'bond(174,200)'];
  const imported = importGenBank(input);
  expect(imported.type).toBe('PARSE_SUCCESS');
  if (imported.type !== 'PARSE_SUCCESS') throw new Error('Expected GenPept import to succeed');

  const [record] = imported.records;
  expect(record.features).toHaveLength(17);
  const bonds = record.features.filter(feature => feature.type === 'Bond');
  expect(bonds.map(feature => feature.locationString)).toEqual(descriptors);
  expect(bonds.map(feature => feature.segments)).toEqual([
    [{ start: 52, end: 53 }],
    [{ start: 113, end: 114 }],
    [{ start: 168, end: 169 }],
    [{ start: 173, end: 174 }],
  ]);
  for (const bond of bonds) {
    expect(conceptualTranslation(bond, record)).toEqual({ status: 'unavailable', reason: 'protein-record' });
  }

  const { text } = exportToGenBank([record]);
  expect([...text.matchAll(/^ {5}Bond +(.+)$/gm)].map(match => match[1])).toEqual(descriptors);
  const reopened = importGenBank(text);
  expect(reopened).toMatchObject({ type: 'PARSE_SUCCESS', findings: [] });
  if (reopened.type !== 'PARSE_SUCCESS') throw new Error('Expected GenPept export to reopen');
  expect(reopened.records[0].features).toHaveLength(17);
  expect(reopened.records[0].features.filter(feature => feature.type === 'Bond').map(feature => feature.locationString)).toEqual(descriptors);
});

it.each([
  'bond(2,6)', 'bond(<2,6)', 'bond(ABC123.1:2,6)', 'join(bond(2,6),3)',
  'one-of(bond(2,6),bond(3,5))', 'order(join(2,3),bond(4,5))',
])('refuses nucleotide bond location %s and names the descriptor', location => {
  const input = genBank('DNA 9 bp DNA linear', 'atgcaaata', `     misc_feature    ${location}\n`);
  expect(importGenBank(input)).toMatchObject({
    type: 'PARSE_REFUSED',
    findings: [expect.objectContaining({ code: 'malformed-location', message: expect.stringContaining(`misc_feature location ${location}`) })],
  });
});

it('round-trips a protein bond whose second endpoint is absent', () => {
  const input = genBank('PROT 6 aa linear', 'mcaavc', '     Bond            bond(2)\n');
  const imported = importGenBank(input);
  expect(imported.type).toBe('PARSE_SUCCESS');
  if (imported.type !== 'PARSE_SUCCESS') throw new Error('Expected GenPept import to succeed');

  const { text } = exportToGenBank(imported.records);
  expect(text).toContain('     Bond            bond(2)\n');
  expect(importGenBank(text)).toMatchObject({
    type: 'PARSE_SUCCESS',
    findings: [],
    records: [{ features: [{ locationString: 'bond(2)', segments: [{ start: 1, end: 2 }] }] }],
  });
});

it.each(['bond(ABC123.1:,6)', 'join(bond(2,6)..3,4)'])('refuses malformed protein bond location %s and names the descriptor', location => {
  const input = genBank('PROT 6 aa linear', 'mcaavc', `     Bond            ${location}\n`);
  expect(importGenBank(input)).toMatchObject({
    type: 'PARSE_REFUSED',
    findings: [expect.objectContaining({ code: 'malformed-location', message: expect.stringContaining(`Bond location ${location}`) })],
  });
});

it('checks the second endpoint of a protein bond against the record length', () => {
  const input = genBank('PROT 6 aa linear', 'mcaavc', '     Bond            bond(2,7)\n');
  expect(importGenBank(input)).toMatchObject({
    type: 'PARSE_REFUSED',
    findings: [expect.objectContaining({ code: 'location-out-of-range', message: expect.stringContaining('Bond location bond(2,7)') })],
  });
});

it.each([
  ['acſt', '4 bp', 'ſ', 3],
  ['AſGT', '4 bp', 'ſ', 2],
  ['atſ', '3 bp', 'ſ', 3],
  ['aßt', '4 bp', 'ß', 2],
  ['aıt', '3 aa', 'ı', 2],
  ['aﬀt', '4 aa', 'ﬀ', 2],
])('refuses original non-ASCII ORIGIN residue in %s', (sequence, size, invalid, position) => {
  const response = importGenBank(genBank(`X ${size}`, sequence));
  expect(response).toMatchObject({
    type: 'PARSE_REFUSED',
    findings: expect.arrayContaining([expect.objectContaining({
      code: 'invalid-residue',
      message: `The sequence contains "${invalid}" at ${size.endsWith('aa') ? 'residue' : 'base'} ${position}.`,
    })]),
  });
});

it.each([
  ['noncircular 9 bp DNA linear', 'ATGAAATAA', '9^1'],
  ['circular_test 4 bp DNA linear', 'ACGT', '4^1'],
  ['noncircular                9 bp    DNA     linear   PLN 01-JAN-2000', 'ATGAAATAA', '9^1'],
])('refuses a circular origin site on the declared linear LOCUS %s', (locus, sequence, site) => {
  expect(importGenBank(genBank(locus, sequence, `     misc_feature    ${site}\n`))).toMatchObject({
    type: 'PARSE_REFUSED',
    findings: [expect.objectContaining({ code: 'malformed-location', line: 3 })],
  });
});

it.each([
  'rna_control 6 bp DNA',
  'rna_control                6 bp ss-DNA     linear   PLN 01-JAN-2000',
])('uses the declared DNA alphabet for the complement of AAA (%s)', locus => {
  const { records, findings } = parseGenBank(genBank(locus, 'AAAAAA', '     misc_feature    complement(1..3)\n'));
  expect(findings).toEqual([]);
  const [record] = records;
  expect(extractFeatureSequence(record.features[0], record.sequence, record.moleculeType).featureSeq).toBe('TTT');
});

it('accepts a slash-led line that closes a multiline note', () => {
  const { records, findings } = parseGenBank(genBank('X 4 bp DNA', 'ACGT', `     misc_feature    1..4
                     /note="The argument ends with
                     /flag="
`));
  expect(findings).toEqual([]);
  expect(records[0].features[0].metadata?.note).toBe('The argument ends with /flag=');
});

it('keeps escaped quotation marks on a slash-led continuation inside a note', () => {
  const { records, findings } = parseGenBank(genBank('X 4 bp DNA', 'ACGT', `     misc_feature    1..4
                     /note="The command uses
                     /flag=""x""
                     for testing."
                     /label="example"
`));
  expect(findings).toEqual([]);
  expect(records[0].features[0]).toMatchObject({
    name: 'example',
    metadata: { note: 'The command uses /flag="x" for testing.' },
  });
});

it.each([
  ['/note="abc" junk', ''],
  ['/note="abc', '                     def" junk\n'],
  ['/note="abc"', '                     junk\n'],
])('refuses text after a closing qualifier quote (%s)', (note, continuation) => {
  const response = importGenBank(genBank('X 4 bp DNA', 'ACGT',
    `     misc_feature    1..4\n                     ${note}\n${continuation}`));
  expect(response).toMatchObject({
    type: 'PARSE_REFUSED',
    findings: [expect.objectContaining({ code: 'malformed-qualifier', line: 4, message: expect.stringContaining('/note') })],
  });
});

it('refuses ORIGINAL in place of the ORIGIN field', () => {
  expect(importGenBank(genBank('X 4 bp DNA', 'ACGT', '', 'ORIGINAL'))).toMatchObject({
    type: 'PARSE_REFUSED',
    findings: expect.arrayContaining([expect.objectContaining({ code: 'no-sequence' })]),
  });
});

it('names the line of a misplaced feature key', () => {
  const response = importGenBank(genBank('X 4 bp DNA', 'ACGT', `      CDS            1..4
                     /note="ignored before"
`));
  expect(response).toMatchObject({
    type: 'PARSE_REFUSED',
    findings: expect.arrayContaining([expect.objectContaining({ code: 'malformed-feature', line: 3 })]),
  });
});

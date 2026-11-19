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
import { handleBioMessage } from '../bio';

it('passes detail candidates through the annotation worker response', () => {
  const result = handleBioMessage({ type: 'PARSE_ANNOTATIONS', filename: 'x.gff3', content: 'seq_1\ts\tregion\t1\t1000\t.\t+\t.\tgbkey=Src;host=camel' });
  expect(result).toMatchObject({ type: 'ANNOTATIONS_SUCCESS', details: { seq_1: { start: 0, end: 1000, details: { host: 'camel' } } } });
});


it.each([['CDS', '.'], ['SO:0000316', '.'], ['CDS', '3'], ['CDS', ''], ['CDS', 'x']])(
  'refuses %s phase "%s" on a later GFF3 row', (type, phase) => {
  const response = handleBioMessage({ type: 'PARSE_ANNOTATIONS', filename: 'bad.gff3',
    content: `##gff-version 3\nr\ts\t${type}\t1\t3\t.\t+\t0\tID=c\nr\ts\t${type}\t4\t10\t.\t+\t${phase}\tID=c` });
  expect(response).toMatchObject({ type: 'ERROR', error: expect.stringContaining(`GFF3 row 3, ${type} c: CDS phase must be 0, 1 or 2 (found "${phase}")`) });
});

it('refuses conflicting CDS translations and names both rows and values', () => {
  const response = handleBioMessage({ type: 'PARSE_ANNOTATIONS', filename: 'bad.gff3', content:
    '##gff-version 3\nr\ts\tCDS\t1\t3\t.\t+\t0\tID=c\nr\ts\tCDS\t4\t6\t.\t+\t0\tID=c;translation=MQ\nr\ts\tCDS\t7\t9\t.\t+\t0\tID=c;translation=MK' });
  expect(response).toMatchObject({ type: 'ERROR', error: expect.stringMatching(/CDS c.*translation.*"MQ".*row 3.*"MK".*row 4/) });
});

it.each([
  ['x\t.\tCDS\t1\t9\t.\t+', 'CDS', 7],
  ['x\t.\tSO:0000316\t1\t9\t.\t-\t0', 'SO:0000316', 8],
])('refuses truncated CDS row %s and identifies the row', (row, type, columns) => {
  const response = handleBioMessage({ type: 'PARSE_ANNOTATIONS', filename: 'bad.gff3',
    content: '##gff-version 3\n' + row + '\n' });
  expect(response).toMatchObject({
    type: 'ERROR', error: `GFF3 row 2, ${type}: CDS requires 9 columns for phase and attributes (found ${columns})`,
  });
  const annotation = handleBioMessage({ type: 'PARSE_ANNOTATIONS', filename: 'short.gff3',
    content: '##gff-version 3\nx\t.\tgene\t1\t9\t.\t+\n' });
  expect(annotation).toHaveProperty('type', 'ANNOTATIONS_SUCCESS');
  expect(annotation).toHaveProperty('annotations', {});
});

it.each([
  ['##gff-version 3\nx\t.\tsequence_feature\t1\t3\t.\t+\t.\tID=c;insdc_type=misc_feature;insdc_remote=1:AB123.1:2%5E3\n',
    'GFF3 row 2: unsupported between-base site in remote descriptor "1:AB123.1:2^3"'],
  ['##gff-version 3\nx\t.\tsequence_feature\t1\t3\t.\t+\t.\tID=c\nx\t.\tsequence_feature\t7\t9\t.\t-\t.\tID=c;insdc_remote=0:complement(AB123.1:2%5E3)\n',
    'GFF3 row 3: unsupported between-base site in remote descriptor "0:complement(AB123.1:2^3)"'],
])('refuses an insdc_remote site with a literal row and descriptor', (content, error) => {
  expect(handleBioMessage({ type: 'PARSE_ANNOTATIONS', filename: 'remote.gff3', content })).toMatchObject({ type: 'ERROR', error });
});

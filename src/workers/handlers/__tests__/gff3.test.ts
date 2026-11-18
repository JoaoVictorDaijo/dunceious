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


it.each(['CDS', 'SO:0000316'])('refuses a %s with undefined phase and identifies its GFF3 row', type => {
  const response = handleBioMessage({ type: 'PARSE_ANNOTATIONS', filename: 'bad.gff3',
    content: `##gff-version 3\nr\ts\tgene\t1\t10\t.\t+\t.\tID=g\nr\ts\t${type}\t1\t10\t.\t+\t.\tID=c` });
  expect(response).toMatchObject({ type: 'ERROR', error: expect.stringMatching(/row 3.* c.*phase.*0, 1 or 2/) });
});

it('refuses conflicting CDS translations and names both rows and values', () => {
  const response = handleBioMessage({ type: 'PARSE_ANNOTATIONS', filename: 'bad.gff3', content:
    '##gff-version 3\nr\ts\tCDS\t1\t3\t.\t+\t0\tID=c\nr\ts\tCDS\t4\t6\t.\t+\t0\tID=c;translation=MQ\nr\ts\tCDS\t7\t9\t.\t+\t0\tID=c;translation=MK' });
  expect(response).toMatchObject({ type: 'ERROR', error: expect.stringMatching(/CDS c.*translation.*"MQ".*row 3.*"MK".*row 4/) });
});

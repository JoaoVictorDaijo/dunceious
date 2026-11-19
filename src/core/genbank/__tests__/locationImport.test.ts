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

import { expect, it } from 'vitest';
import { conceptualTranslation } from '@/src/domain/bio/translation';
import { handleBioMessage } from '@/src/workers/handlers/bio';

function genBank(locus: string, sequence: string, features = ''): string {
  return `LOCUS       ${locus}
FEATURES             Location/Qualifiers
${features}ORIGIN
        1 ${sequence}
//
`;
}

function importGenBank(content: string) {
  return handleBioMessage({ type: 'PARSE_GENBANK', filename: 'fixture.gb', content });
}

it.each(['<2^3', '<1^2', '2^>3', '1^>2', 'join(1..2,2^>3)'])('refuses malformed GenBank caret location %s', location => {
  const response = importGenBank(genBank('X 9 bp DNA', 'ATGAAATAA', `     misc_feature    ${location}\n`));
  expect(response).toMatchObject({
    type: 'PARSE_REFUSED',
    findings: [expect.objectContaining({ code: 'malformed-location', line: 3, message: expect.stringContaining(location) })],
  });
});

it('refuses a nonadjacent caret descriptor in a GFF3 remote interval', () => {
  const response = handleBioMessage({
    type: 'PARSE_ANNOTATIONS',
    filename: 'fixture.gff3',
    content: '##gff-version 3\nX\tx\tmisc_feature\t1\t2\t.\t+\t.\tID=f;insdc_remote=0:AB123.1:2^5',
  });
  expect(response).toMatchObject({ type: 'ERROR', error: expect.stringContaining('2^5') });
});

it.each([
  ['AACTGAAATAA', 'join(1^2,<3..11)', 11, 'LK'],
  ['ACTGAAATAA', 'join(1^2,<2..10)', 11, 'LK'],
  ['CCTGAAATAA', 'join(1^2,<2..10)', 11, 'LK'],
  ['TTATTTCAGTT', 'complement(join(1..>9,10^11))', 11, 'LK'],
  ['ATGTGAAA', 'join(1..>6,7^8)', 27, 'MW'],
  ['TTTCACAT', 'complement(join(1^2,<3..8))', 27, 'MW'],
])('uses the residue-bearing CDS ends on %s at %s (table %i)', (sequence, location, table, protein) => {
  const response = importGenBank(genBank(`X ${sequence.length} bp DNA`, sequence,
    `     CDS             ${location}\n                     /transl_table=${table}\n`));
  expect(response.type).toBe('PARSE_SUCCESS');
  if (response.type !== 'PARSE_SUCCESS') return;
  const [record] = response.records;
  expect(conceptualTranslation(record.features[0], record)).toMatchObject({ status: 'ok', residues: protein });
});

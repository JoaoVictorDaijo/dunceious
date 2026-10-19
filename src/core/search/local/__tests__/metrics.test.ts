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

import { expect, it } from 'vitest';
import { hitColumns } from '../../hitColumns';
import { localMetrics } from '../metrics';
import { loadScoring, scoreOf } from '../scoring';

it.each([
  ['EDNAFULL', 'ATAT', 'AUAU', '1=1X1=1X', 20, 4, 2, 4, 0],
  ['EDNAFULL', 'ACNAC', 'ACNAC', '5=', 19, 5, 5, 4, 0],
  ['EBLOSUM62', 'N', 'N', '1=', 6, 1, 1, 1, 0],
  ['EDNAFULL', 'tACGTa', 'ACT', '1S2=1I1=1S', 5, 5, 3, 3, 1],
] as const)('measures %s %s/%s from original symbols and gap columns',
  (id, query, span, cigar, score, queryEnd, identical, similar, gaps) => {
    const scoring = loadScoring(id);
    const alignment = { score2: score * 2, queryStart: cigar.includes('S') ? 1 : 0,
      queryEnd, recordStart: 0, recordEnd: span.length, cigar };
    const columns = hitColumns({ cigar, query, span, mode: 'local', alphabet: 'nucleotide',
      matrixScore: (a, b) => scoreOf(scoring, a, b) });
    expect(localMetrics(columns, alignment, scoring, query.length)).toEqual({
      score, length: span.length + (gaps ? 1 : 0), identical, similar, gaps,
      queryStart: alignment.queryStart, queryEnd, queryLength: query.length,
    });
  });

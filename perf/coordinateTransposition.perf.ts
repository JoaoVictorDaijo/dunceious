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

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseGenBank } from '../src/core/genbank';
import { processTransposition } from '../src/domain/bio/coordinate';
import { bench } from './perfUtils';

const [record] = parseGenBank(readFileSync(
  new URL('../examples/arabidopsis-chloroplast-NC_000932.gb', import.meta.url), 'utf8',
));
const records = [{ ...record, alignedSequence: record.sequence }];

describe('processTransposition on a complete chloroplast genome', () => {
  it('transposes 154,478 bases and 259 features within a 100 ms p95 budget', () => {
    const [result] = processTransposition(records);
    expect(result.features).toHaveLength(259);
    expect(result.features[0]).toMatchObject({
      start: 0, end: 154478, segments: [{ start: 0, end: 154478 }],
    });
    const timing = bench(() => processTransposition(records), { warmup: 2, iterations: 5 });
    console.log('Chloroplast transposition', timing);
    expect(timing.p95Ms).toBeLessThan(100);
  });
});

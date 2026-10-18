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

export function oracleMatrix(id: 'EDNAFULL' | 'EBLOSUM62') {
  const rows = readFileSync(`src/core/search/local/matrices/${id}`, 'utf8')
    .split('\n').filter(line => line.trim() && !line.startsWith('#'));
  const labels = rows.shift()!.trim().split(/\s+/);
  const values = new Map<string, number>();
  for (const row of rows) {
    const [symbol, ...scores] = row.trim().split(/\s+/);
    labels.forEach((other, i) => values.set(symbol + other, Number(scores[i])));
  }
  return (a: string, b: string) => {
    const value = values.get(a.toUpperCase() + b.toUpperCase());
    if (value === undefined) throw new Error('Unknown oracle residue');
    return value;
  };
}

/** Textbook Gotoh local DP in EMBOSS units; full matrices independent of matcher. */
export function gotoh(query: string, record: string, score: (a: string, b: string) => number): number {
  const width = record.length + 1;
  const cells = (query.length + 1) * width;
  const best = new Float64Array(cells);
  const queryGap = new Float64Array(cells).fill(-Infinity);
  const recordGap = new Float64Array(cells).fill(-Infinity);
  let optimum = 0;
  for (let i = 1; i <= query.length; i++) {
    for (let j = 1; j <= record.length; j++) {
      const k = i * width + j;
      queryGap[k] = Math.max(best[k - 1] - 10, queryGap[k - 1] - 0.5);
      recordGap[k] = Math.max(best[k - width] - 10, recordGap[k - width] - 0.5);
      best[k] = Math.max(0, best[k - width - 1] + score(query[i - 1], record[j - 1]), queryGap[k], recordGap[k]);
      optimum = Math.max(optimum, best[k]);
    }
  }
  return optimum;
}

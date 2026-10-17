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

import { matchLineSymbol, type HitColumn, type HitCounts, type HitMode } from '@/src/core/search/hitColumns';

/** EMBOSS 6.6.0 ajalign.c alignWriteSrsAny: 13-character names, 6-character coordinates, 60 columns. */
export function formatPairAlignment(input: { columns: HitColumn[]; queryName: string; recordName: string;
  queryStart: number; recordStart: number; strand: 1 | -1; width?: 60 }): string {
  const { columns, queryName, queryStart, recordStart, strand, width = 60 } = input;
  const recordName = strand === -1 ? `${input.recordName} (reverse strand)` : input.recordName;
  // The reverse label must remain legible rather than being cut to the pair format's name field.
  const nameWidth = strand === -1 ? Math.max(13, recordName.length, queryName.length) : 13;
  let q = queryStart - 1; let r = recordStart - strand; let text = '';
  for (let i = 0; i < columns.length; i += width) {
    const block = columns.slice(i, i + width);
    const qCount = block.filter(c => c.queryBase !== null).length;
    const rCount = block.filter(c => c.recordBase !== null).length;
    const line = (name: string, start: number, sequence: string, end: number) =>
      `${name.slice(0, nameWidth).padEnd(nameWidth)} ${String(start).padStart(6)} ${sequence} ${String(end).padStart(6)}\n`;
    text += line(queryName, q + (qCount ? 1 : 0), block.map(c => c.queryBase ?? '-').join(''), q + qCount);
    text += ' '.repeat(nameWidth + 8) + block.map(c => matchLineSymbol(c.cls)).join('') + '\n';
    text += line(recordName, r + (rCount ? strand : 0), block.map(c => c.recordBase ?? '-').join(''), r + strand * rCount) + '\n';
    q += qCount; r += strand * rCount;
  }
  return text;
}

export function hitCountsText(counts: HitCounts, mode: HitMode): string {
  const parts = [`${counts.identical} identical`];
  if (mode !== 'local' && counts.ambiguity) parts.push(`${counts.ambiguity} matched through an ambiguity code`);
  if (mode === 'local' && counts.similar) parts.push(`${counts.similar} similar`);
  for (const cls of ['mismatch', 'insertion', 'deletion'] as const) {
    const n = counts[cls];
    if (n) parts.push(`${n} ${cls}${n === 1 ? '' : cls === 'mismatch' ? 'es' : 's'}`);
  }
  return parts.join(', ');
}

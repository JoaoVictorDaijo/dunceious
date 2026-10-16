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

/** SAMv1 §1.4 extended CIGAR; reference = record, read = query. */
export type CigarOp = '=' | 'X' | 'I' | 'D' | 'S';

export function parseCigar(cigar: string): Array<{ op: CigarOp; length: number }> {
  const runs: Array<{ op: CigarOp; length: number }> = [];
  const pattern = /([0-9]+)([=XIDS])/gy;
  let offset = 0;
  while (offset < cigar.length) {
    pattern.lastIndex = offset;
    const match = pattern.exec(cigar);
    if (!match) throw new Error('Invalid CIGAR');
    const length = Number(match[1]);
    const op = match[2] as CigarOp;
    if (!Number.isSafeInteger(length) || length <= 0 || runs.at(-1)?.op === op) {
      throw new Error('Invalid CIGAR');
    }
    runs.push({ op, length });
    offset = pattern.lastIndex;
  }
  if (!runs.length) throw new Error('Invalid CIGAR');
  return runs;
}

export function formatCigar(ops: Iterable<CigarOp>): string {
  const runs: string[] = [];
  let previous: CigarOp | undefined;
  let length = 0;
  for (const op of ops) {
    if (op === previous) length++;
    else {
      if (previous) runs.push(`${length}${previous}`);
      previous = op;
      length = 1;
    }
  }
  if (previous) runs.push(`${length}${previous}`);
  return runs.join('');
}

export function cigarSpans(cigar: string): { query: number; record: number } {
  let query = 0;
  let record = 0;
  for (const { op, length } of parseCigar(cigar)) {
    if (op !== 'D') query += length;
    if (op !== 'I' && op !== 'S') record += length;
  }
  return { query, record };
}

export function expandCigar(cigar: string): CigarOp[] {
  const columns: CigarOp[] = [];
  for (const { op, length } of parseCigar(cigar)) {
    for (let i = 0; i < length; i++) columns.push(op);
  }
  return columns;
}

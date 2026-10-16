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

import { formatCigar, type CigarOp } from '@/src/domain/bio/cigar';
import { residueAlternatives, type ResidueAlphabet } from './query';

export const EDIT_PATH_CELL_BUDGET = 16_000_000;

/**
 * Anchored Wagner–Fischer edit distance (1974, doi:10.1145/321796.321811).
 * Traceback prefers diagonal, I, D from the end; identity uses original symbols.
 * Recursive row checkpoints preserve forward DP values and therefore every tie,
 * unlike a middle-row path split. At least two working rows are unavoidable.
 */
export function wholeQueryPath(
  query: string,
  span: string,
  alphabet: ResidueAlphabet,
  options?: { cellBudget?: number },
): { cigar: string; edits: number } {
  const n = query.length;
  const m = span.length;
  const budget = options?.cellBudget ?? EDIT_PATH_CELL_BUDGET;
  if (!Number.isFinite(budget) || budget < 1) throw new Error('Invalid edit path cell budget');
  if (!n) return { cigar: m ? `${m}D` : '', edits: m };
  if (!m) return { cigar: `${n}I`, edits: n };
  const accepted = Array.from(query, base => residueAlternatives(base, alphabet));
  const record = span.toUpperCase();
  const queryUpper = query.toUpperCase();
  const reversed: CigarOp[] = [];
  let edits: number | undefined;

  function nextRow(previous: Uint32Array, i: number, width: number): Uint32Array {
    const row = new Uint32Array(width + 1);
    row[0] = i;
    for (let j = 1; j <= width; j++) {
      row[j] = Math.min(previous[j - 1] + Number(!accepted[i - 1].includes(record[j - 1])),
        previous[j] + 1, row[j - 1] + 1);
    }
    return row;
  }

  function recover(lo: number, hi: number, width: number, checkpoint: Uint32Array): number {
    if (!width) {
      for (let i = lo; i < hi; i++) reversed.push('I');
      edits ??= hi;
      return 0;
    }
    if (hi - lo > 1 && (hi - lo + 1) * (width + 1) > budget) {
      const middle = lo + Math.ceil((hi - lo) / 2);
      let row = checkpoint;
      for (let i = lo + 1; i <= middle; i++) row = nextRow(row, i, width);
      const upperWidth = recover(middle, hi, width, row);
      return recover(lo, middle, upperWidth, checkpoint);
    }
    const rows: Uint32Array[] = [checkpoint];
    for (let i = lo + 1; i <= hi; i++) rows.push(nextRow(rows[rows.length - 1], i, width));
    edits ??= rows[hi - lo][width];
    let i = hi;
    let j = width;
    while (i > lo) {
      const current = rows[i - lo][j];
      if (j && current === rows[i - lo - 1][j - 1] + Number(!accepted[i - 1].includes(record[j - 1]))) {
        reversed.push(queryUpper[i - 1] === record[j - 1] ? '=' : 'X');
        i--;
        j--;
      } else if (current === rows[i - lo - 1][j] + 1) {
        reversed.push('I');
        i--;
      } else {
        reversed.push('D');
        j--;
      }
    }
    return j;
  }

  const initial = Uint32Array.from({ length: m + 1 }, (_, j) => j);
  const remaining = recover(0, n, m, initial);
  for (let j = 0; j < remaining; j++) reversed.push('D');
  return { cigar: formatCigar(reversed.reverse()), edits: edits! };
}

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

import { parseCigar } from '@/src/domain/bio/cigar';
import { residueAlternatives, type ResidueAlphabet } from './query';

import type { SearchHitMode } from '@/src/domain/bio/types';

export type HitMode = SearchHitMode;
export type HitColumnClass = 'identical' | 'ambiguity' | 'similar' | 'mismatch' | 'deletion' | 'insertion';
export interface HitColumn {
  op: '=' | 'X' | 'I' | 'D';
  cls: HitColumnClass;
  queryIndex: number | null;
  recordOffset: number | null;
  queryBase: string | null;
  recordBase: string | null;
  recordAmbiguity: boolean;
}
export interface HitCounts {
  identical: number;
  ambiguity: number;
  similar: number;
  mismatch: number;
  insertion: number;
  deletion: number;
}

/** Offsets follow the path's strand; soft clips consume query without display columns. */
export function hitColumns(input: {
  cigar: string;
  query: string;
  span: string;
  mode: HitMode;
  alphabet: ResidueAlphabet;
  matrixScore?: (queryBase: string, recordBase: string) => number;
}): HitColumn[] {
  const { cigar, query, span, mode, alphabet, matrixScore } = input;
  if (mode === 'local' && !matrixScore) throw new Error('Local hit columns require a matrix score');
  const columns: HitColumn[] = [];
  let qi = 0;
  let ri = 0;
  for (const { op, length } of parseCigar(cigar)) {
    if (op === 'S') {
      qi += length;
      continue;
    }
    for (let i = 0; i < length; i++) {
      const queryBase = op === 'D' ? null : query[qi];
      const recordBase = op === 'I' ? null : span[ri];
      let cls: HitColumnClass;
      let recordAmbiguity = false;
      if (op === 'I') cls = 'insertion';
      else if (op === 'D') cls = 'deletion';
      else if (mode === 'local') {
        cls = op === '=' ? 'identical' : matrixScore!(queryBase!, recordBase!) > 0 ? 'similar' : 'mismatch';
      } else {
        const accepted = residueAlternatives(queryBase!, alphabet).includes(recordBase!.toUpperCase());
        cls = accepted ? op === '=' ? 'identical' : 'ambiguity' : 'mismatch';
        recordAmbiguity = op === '=' && !accepted;
      }
      columns.push({ op, cls, queryIndex: op === 'D' ? null : qi,
        recordOffset: op === 'I' ? null : ri, queryBase, recordBase, recordAmbiguity });
      if (op !== 'D') qi++;
      if (op !== 'I') ri++;
    }
  }
  return columns;
}

export function hitCounts(columns: HitColumn[]): HitCounts {
  const counts: HitCounts = { identical: 0, ambiguity: 0, similar: 0, mismatch: 0, insertion: 0, deletion: 0 };
  for (const column of columns) counts[column.cls]++;
  return counts;
}

/** EMBOSS 6.6.0 ajalign.c alignSim symbols; both gap kinds occupy a space. */
export function matchLineSymbol(cls: HitColumnClass): '|' | ':' | '.' | ' ' {
  if (cls === 'identical') return '|';
  if (cls === 'ambiguity' || cls === 'similar') return ':';
  if (cls === 'mismatch') return '.';
  return ' ';
}

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

import EDNAFULL from './matrices/EDNAFULL?raw';
import EBLOSUM62 from './matrices/EBLOSUM62?raw';

export type LocalScoringId = 'EDNAFULL' | 'EBLOSUM62';
export interface LocalScoring {
  id: LocalScoringId;
  symbols: string;
  size: number;
  matrix2: Int32Array;
  gapOpen2: 20;
  gapExtend2: 1;
  label: string;
}
const cache = new Map<LocalScoringId, LocalScoring>();

/** EMBOSS 6.6.0 ajmatrices.c row/column labels; doubled for exact half-unit gaps. */
export function loadScoring(id: LocalScoringId): LocalScoring {
  const cached = cache.get(id);
  if (cached) return cached;
  const lines = (id === 'EDNAFULL' ? EDNAFULL : EBLOSUM62).split(/\r?\n/)
    .map(line => line.trim()).filter(line => line && !line.startsWith('#'));
  const symbols = lines[0].split(/\s+/).join('');
  const size = symbols.length;
  const matrix2 = new Int32Array(size * size);
  if (lines.length !== size + 1) throw new Error('Invalid EMBOSS matrix');
  for (let row = 0; row < size; row++) {
    const fields = lines[row + 1].split(/\s+/);
    if (fields.shift() !== symbols[row] || fields.length !== size) throw new Error('Invalid EMBOSS matrix');
    fields.forEach((field, column) => {
      const value = Number(field);
      if (!Number.isInteger(value)) throw new Error('Invalid EMBOSS matrix');
      matrix2[row * size + column] = value * 2;
    });
  }
  const scoring: LocalScoring = { id, symbols, size, matrix2, gapOpen2: 20, gapExtend2: 1,
    label: `${id}, gap 10/0.5 (EMBOSS water defaults)` };
  cache.set(id, scoring);
  return scoring;
}

function residueCode(symbol: string, scoring: LocalScoring): number {
  const normalized = symbol.toUpperCase();
  return normalized.length === 1 ? scoring.symbols.indexOf(normalized) : -1;
}

export function encodeResidues(sequence: string, scoring: LocalScoring): { codes: Uint8Array } | { invalid: string[] } {
  const codes = new Uint8Array(sequence.length);
  const invalid = new Set<string>();
  Array.from(sequence).forEach((symbol, index) => {
    const code = residueCode(symbol, scoring);
    if (code < 0) invalid.add(symbol);
    else codes[index] = code;
  });
  return invalid.size ? { invalid: [...invalid] } : { codes };
}

export function scoreOf(scoring: LocalScoring, a: string, b: string): number {
  const i = residueCode(a, scoring);
  const j = residueCode(b, scoring);
  if (i < 0 || j < 0) throw new Error('Residue outside the scoring alphabet');
  return scoring.matrix2[i * scoring.size + j] / 2;
}

export function scoringFor(isProtein: boolean): LocalScoringId {
  return isProtein ? 'EBLOSUM62' : 'EDNAFULL';
}

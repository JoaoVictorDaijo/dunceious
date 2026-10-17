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

import { describe, expect, it } from 'vitest';
import { encodeResidues, loadScoring, scoreOf, scoringFor } from '../scoring';

describe('EMBOSS scoring', () => {
  it.each(['\uFB05', '\uFB06'])('lists expanding uppercase symbol %s as unsupported', symbol => {
    expect(encodeResidues(`D${symbol}D${symbol}`, loadScoring('EBLOSUM62'))).toEqual({ invalid: [symbol] });
  });
  it.each([
    ['\uFB05', 'D'], ['D', '\uFB05'], ['\uFB06', 'D'], ['D', '\uFB06'],
    ['ST', 'D'], ['D', 'ST'], ['', 'D'], ['D', ''],
  ])('refuses scoring operands %j/%j unless each normalizes to one label', (a, b) => {
    const scoring = loadScoring('EBLOSUM62');
    expect(() => scoreOf(scoring, a, b)).toThrow('Residue outside the scoring alphabet');
  });
  it.each([
    ['EDNAFULL', 'A', 'A', 5], ['EDNAFULL', 'A', 'T', -4],
    ['EDNAFULL', 'N', 'N', -1], ['EDNAFULL', 'U', 'T', 5],
    ['EDNAFULL', 'T', 'U', 5], ['EBLOSUM62', 'N', 'N', 6],
    ['EBLOSUM62', 'W', 'W', 11], ['EBLOSUM62', 'B', 'Z', 1],
    ['EBLOSUM62', 'X', 'X', -1],
  ] as const)('%s %s/%s = %s', (id, a, b, score) => {
    const scoring = loadScoring(id);
    expect(scoreOf(scoring, a, b)).toBe(score);
    expect(scoring.matrix2[scoring.symbols.indexOf(a) * scoring.size + scoring.symbols.indexOf(b)]).toBe(score * 2);
  });
  it('accepts case-insensitive matrix symbols without changing T/U identity', () => {
    const dna = loadScoring('EDNAFULL');
    expect(dna.symbols).toBe('ATGCSWRYKMBVHDNU');
    expect(encodeResidues('acgu', dna)).toEqual({ codes: new Uint8Array([0, 3, 2, 15]) });
    expect(scoreOf(dna, 'u', 't')).toBe(5);
    expect(encodeResidues('ACG--?a?', dna)).toEqual({ invalid: ['-', '?'] });
    expect(encodeResidues('AJO', loadScoring('EBLOSUM62'))).toEqual({ invalid: ['J', 'O'] });
    expect(encodeResidues('*', loadScoring('EBLOSUM62'))).toEqual({ codes: new Uint8Array([23]) });
    expect(encodeResidues('a A', dna)).toEqual({ invalid: [' '] });
    expect(encodeResidues('', dna)).toEqual({ codes: new Uint8Array() });
  });
  it('uses water defaults and memoizes the parsed files', () => {
    const dna = loadScoring(scoringFor(false));
    expect(loadScoring('EDNAFULL')).toBe(dna);
    expect(dna.gapOpen2).toBe(20);
    expect(dna.gapExtend2).toBe(1);
    expect(dna.label).toBe('EDNAFULL, gap 10/0.5 (EMBOSS water defaults)');
    expect(scoringFor(true)).toBe('EBLOSUM62');
  });
});

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
import { beforeAll, expect, it } from 'vitest';
import { instantiateLocalEngine, type LocalEngine } from '../engine';
import { encodeResidues, loadScoring } from '../scoring';
import { gotoh, oracleMatrix } from './oracle/gotoh';

let engine: LocalEngine;
beforeAll(async () => { engine = await instantiateLocalEngine(await WebAssembly.compile(readFileSync('public/wasm/local-align.wasm'))); });
it.each(['EDNAFULL', 'EBLOSUM62'] as const)('matches Gotoh and the first matcher score for %s', matrix => {
  const scoring = loadScoring(matrix);
  const codes = (s: string) => {
    const result = encodeResidues(s, scoring);
    if (!('codes' in result)) throw new Error('Invalid synthetic residue');
    return result.codes;
  };
  let seed = 0x6a09e667;
  const alphabet = matrix === 'EDNAFULL' ? 'ACGTUSWRYKMBVHDN' : scoring.symbols;
  const sequence = (length: number) => Array.from({ length }, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return alphabet[(seed >>> 16) % alphabet.length];
  }).join('');
  const pairs = [['', ''], ['', 'AC'], ['AC', ''], ['A', 'C'],
    ['AAAAACCCCCGGGGG', 'AAAAACCCCGGGGG'], ['AAAACCCCGGGGTTTT', 'AAAAGGGGTTTT'],
    ...(matrix === 'EDNAFULL' ? [['N', 'N'], ['ATAT', 'AUAU']] : [['*', 'A'], ['WWWWAAAWWWW', 'WWWWWWWW']]),
    ...Array.from({ length: 100 }, (_, i) => [sequence(1 + i % 43), sequence(1 + i % 67)])];
  for (const [query, record] of pairs) {
    const progress: number[] = [];
    const score2 = engine.maxScore(codes(query), codes(record), scoring, p => progress.push(p));
    expect(score2, `${query}/${record}`).toBe(gotoh(query, record, oracleMatrix(matrix)) * 2);
    const iterator = engine.enumerate(codes(query), codes(record), scoring);
    try { expect(score2).toBe(iterator.next().value?.score2 ?? 0); }
    finally { iterator.return?.(); }
    expect(progress[0]).toBe(0);
    expect(progress.at(-1)).toBe(1);
  }
});
it('rejects invalid scoring inputs without poisoning later score calls', () => {
  const scoring = loadScoring('EDNAFULL');
  expect(() => engine.maxScore(new Uint8Array([255]), new Uint8Array([0]), scoring)).toThrow('Local alignment scoring failed');
  expect(() => engine.maxScore(new Uint8Array([0]), new Uint8Array([0]), { ...scoring, size: 0 })).toThrow('Invalid local scoring matrix');
  expect(() => engine.maxScore(new Uint8Array([0]), new Uint8Array([0]), scoring, () => { throw new Error('cancel'); })).toThrow('cancel');
  expect(engine.maxScore(new Uint8Array([0]), new Uint8Array([0]), scoring)).toBe(10);
});

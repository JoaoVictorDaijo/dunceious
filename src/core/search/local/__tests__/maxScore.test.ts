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

const engines = {} as Record<LocalEngine['scoreKernel'], LocalEngine>;
beforeAll(async () => {
  const module = await WebAssembly.compile(readFileSync('public/wasm/local-align.wasm'));
  const scoreModule = await WebAssembly.compile(readFileSync('public/wasm/local-align-ssw.wasm'));
  engines.scalar = await instantiateLocalEngine(module);
  engines['ssw-simd'] = await instantiateLocalEngine(module, { scoreModule });
});
const kernels = ['scalar', 'ssw-simd'] as const;
it('selects the SSW kernel only when the score module is supplied', () => {
  for (const kernel of kernels) expect(engines[kernel].scoreKernel).toBe(kernel);
});
it.each(kernels.flatMap(kernel => (['EDNAFULL', 'EBLOSUM62'] as const).map(matrix => [kernel, matrix] as const)))(
  '%s matches Gotoh and the first matcher score for %s', (kernel, matrix) => {
  const engine = engines[kernel];
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
it.each(kernels)('%s rejects invalid scoring inputs without poisoning later score calls', kernel => {
  const engine = engines[kernel];
  const scoring = loadScoring('EDNAFULL');
  expect(() => engine.maxScore(new Uint8Array([255]), new Uint8Array([0]), scoring)).toThrow('Local alignment scoring failed');
  expect(() => engine.maxScore(new Uint8Array([0]), new Uint8Array([0]), { ...scoring, size: 0 })).toThrow('Invalid local scoring matrix');
  expect(() => engine.maxScore(new Uint8Array([0]), new Uint8Array([0]), scoring, () => { throw new Error('cancel'); })).toThrow('cancel');
  expect(engine.maxScore(new Uint8Array([0]), new Uint8Array([0]), scoring)).toBe(10);
});

// A self-alignment's best score is every residue's diagonal entry, so it is known in closed form.
// The SSW word pass is exact below INT16_MAX; at and past it the engine must take the scalar pass.
it.each([
  ['EDNAFULL', 'A', 3276], ['EDNAFULL', 'A', 3277], ['EDNAFULL', 'ACGT', 5000],
  ['EBLOSUM62', 'W', 1489], ['EBLOSUM62', 'W', 1490],
] as const)('both kernels score a %s self-alignment of %s × %i exactly across the 16-bit limit', (matrix, unit, length) => {
  const scoring = loadScoring(matrix);
  const sequence = unit.repeat(Math.ceil(length / unit.length)).slice(0, length);
  const result = encodeResidues(sequence, scoring);
  if (!('codes' in result)) throw new Error('Invalid synthetic residue');
  const expected = [...result.codes].reduce((sum, code) => sum + scoring.matrix2[code * scoring.size + code], 0);
  for (const kernel of kernels) expect(engines[kernel].maxScore(result.codes, result.codes, scoring)).toBe(expected);
});
it.each(['EDNAFULL', 'EBLOSUM62'] as const)('the SSW kernel equals the scalar kernel on related pairs with indels for %s', matrix => {
  const scoring = loadScoring(matrix);
  const alphabet = matrix === 'EDNAFULL' ? 'ACGTACGTACGTRYKMSWBDHVN' : scoring.symbols;
  let seed = 0x3c6ef372;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  const sequence = (length: number) => Array.from({ length }, () => alphabet[Math.floor(random() * alphabet.length)]).join('');
  const mutate = (s: string) => [...s].map(c => {
    const x = random();
    return x < 0.05 ? '' : x < 0.1 ? c + sequence(1 + Math.floor(random() * 6)) : x < 0.25 ? sequence(1) : c;
  }).join('');
  const codes = (s: string) => {
    const result = encodeResidues(s, scoring);
    if (!('codes' in result)) throw new Error('Invalid synthetic residue');
    return result.codes;
  };
  for (let i = 0; i < 300; i++) {
    const query = sequence(1 + Math.floor(random() * 300));
    const record = sequence(Math.floor(random() * 500)) + mutate(query) + sequence(Math.floor(random() * 500));
    expect(engines['ssw-simd'].maxScore(codes(query), codes(record), scoring), `${query}/${record}`)
      .toBe(engines.scalar.maxScore(codes(query), codes(record), scoring));
  }
});

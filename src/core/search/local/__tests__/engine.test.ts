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
import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { instantiateLocalEngine, type LocalAlignment } from '../engine';
import { encodeResidues, loadScoring } from '../scoring';

let module: WebAssembly.Module;
beforeAll(async () => { module = await WebAssembly.compile(readFileSync('public/wasm/local-align.wasm')); });
afterEach(() => vi.restoreAllMocks());
const scoring = loadScoring('EDNAFULL');
function codes(sequence: string): Uint8Array {
  const result = encodeResidues(sequence, scoring);
  if (!('codes' in result)) throw new Error('Invalid test residue');
  return result.codes;
}
function all(iterator: Iterator<LocalAlignment>): LocalAlignment[] {
  return Array.from({ [Symbol.iterator]: () => iterator });
}

it('returns no alignment for no-positive and empty inputs', async () => {
  const engine = await instantiateLocalEngine(module);
  expect(all(engine.enumerate(codes('A'), codes('C'), scoring))).toEqual([]);
  expect(all(engine.enumerate(codes(''), codes('AC'), scoring))).toEqual([]);
  expect(all(engine.enumerate(codes('A'), codes(''), scoring))).toEqual([]);
});

it('soft-clips query ends and preserves symbol identity for T/U', async () => {
  const engine = await instantiateLocalEngine(module);
  expect(engine.enumerate(codes('CCATATCC'), codes('AUAU'), scoring).next().value).toEqual({
    score2: 40, queryStart: 2, queryEnd: 6, recordStart: 0, recordEnd: 4, cigar: '2S1=1X1=1X2S',
  });
});

it('reports a complete monotonic first pass and supports interleaved iterators', async () => {
  const engine = await instantiateLocalEngine(module);
  const progress: number[] = [];
  const first = engine.enumerate(codes('A'.repeat(130)), codes('A'.repeat(132)), scoring, p => progress.push(p));
  const second = engine.enumerate(codes('ACGT'), codes('ACGT'), scoring);
  expect(first.next().value?.score2).toBe(1300);
  expect(second.next().value?.score2).toBe(40);
  expect(first.next().value?.score2).toBe(1300);
  expect(progress[0]).toBe(0); expect(progress.at(-1)).toBe(1);
  expect(progress.length).toBeGreaterThan(2);
  expect(progress.every((p, i) => p >= 0 && p <= 1 && (!i || p >= progress[i - 1]))).toBe(true);
  first.return?.(); second.return?.();
  expect(all(engine.enumerate(codes('A'), codes('A'), scoring))[0]).toEqual({
    score2: 10, queryStart: 0, queryEnd: 1, recordStart: 0, recordEnd: 1, cigar: '1=',
  });
});

it('keeps long unaligned query flanks without an argument-count or query cap', async () => {
  const engine = await instantiateLocalEngine(module);
  const iterator = engine.enumerate(codes('A' + 'C'.repeat(200_000)), codes('A'), scoring);
  expect(iterator.next().value).toEqual({ score2: 10, queryStart: 0, queryEnd: 1,
    recordStart: 0, recordEnd: 1, cigar: '1=200000S' });
  iterator.return?.();
  expect(engine.peakMemoryBytes()).toBeGreaterThan(0);
});

it('rejects invalid encoded residues and releases resources when progress throws', async () => {
  const engine = await instantiateLocalEngine(module);
  expect(() => engine.enumerate(new Uint8Array([255]), codes('A'), scoring).next()).toThrow();
  expect(() => engine.enumerate(codes('A'), codes('A'), scoring, () => { throw new Error('cancel progress'); }).next()).toThrow('cancel progress');
  expect(all(engine.enumerate(codes('A'), codes('A'), scoring))).toHaveLength(1);
});

it.each([
  [[22, 0, 2, 0, 2], '=='],
  [[20, 0, 1, 0, 2], '=='],
  [[20, 0, 2, 0, 1], '=='],
  [[20, -1, 2, 0, 2], '=='],
  [[20, 0, 2, 0, 2], 'XX'],
  [[20, 0, 2, 0, 2], '=Q'],
] as const)('rejects corrupt ABI paths %j %s before yielding', async (out, ops) => {
  const memory = new WebAssembly.Memory({ initial: 1 });
  let top = 8;
  const destroy = vi.fn();
  vi.spyOn(WebAssembly, 'instantiate').mockResolvedValue({ exports: {
    memory, _initialize() {}, malloc(n: number) { const p = top; top += Math.ceil(n / 8) * 8; return p; }, free() {},
    la_create() { return 1; }, la_destroy: destroy, la_bigpass_step() { return 2; },
    la_next(_h: number, output: number, buffer: number, _cap: number, length: number) {
      new Int32Array(memory.buffer, output, 5).set(out);
      new Uint8Array(memory.buffer, buffer, ops.length).set([...ops].map(c => c.charCodeAt(0)));
      new Int32Array(memory.buffer, length, 1)[0] = ops.length;
      return 1;
    },
  } } as unknown as WebAssembly.Instance);
  const engine = await instantiateLocalEngine(module);
  expect(() => engine.enumerate(codes('AA'), codes('AA'), scoring).next()).toThrow('Local alignment failed its path check');
  expect(destroy).toHaveBeenCalledWith(1);
});

const pairHashOracle = JSON.parse(readFileSync('src/core/search/local/__tests__/fixtures/engine-before-pair-hash.json', 'utf8')) as {
  cases: Array<{ query: string; record: string; alignments: LocalAlignment[] }>;
};
it.each(pairHashOracle.cases)('preserves every previous-WASM alignment for $query/$record', async ({ query, record, alignments }) => {
  const engine = await instantiateLocalEngine(module);
  expect(all(engine.enumerate(codes(query), codes(record), scoring))).toEqual(alignments);
});

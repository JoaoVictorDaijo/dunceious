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
import { expect, it } from 'vitest';
import { loadScoring } from '../scoring';

it('enumerates both AA/AAA optima in matcher order, then exhausts', async () => {
  const module = await WebAssembly.compile(readFileSync('public/wasm/local-align.wasm'));
  expect(WebAssembly.Module.imports(module)).toEqual([
    { module: 'env', name: 'emscripten_notify_memory_growth', kind: 'function' },
  ]);
  const instance = await WebAssembly.instantiate(module, { env: { emscripten_notify_memory_growth() {} } });
  const e = instance.exports as {
    memory: WebAssembly.Memory;
    _initialize(): void;
    malloc(n: number): number;
    free(p: number): void;
    la_create(q: number, ql: number, r: number, rl: number, m: number, size: number, go: number, ge: number): number;
    la_bigpass_step(h: number, rows: number): number;
    la_next(h: number, out: number, ops: number, cap: number, len: number): number;
    la_destroy(h: number): void;
  };
  e._initialize();
  const p = e.malloc(2048);
  const matrix = loadScoring('EDNAFULL').matrix2;
  new Uint8Array(e.memory.buffer, p, 5).fill(0);
  new Int32Array(e.memory.buffer, p + 8, matrix.length).set(matrix);
  const handle = e.la_create(p, 2, p + 2, 3, p + 8, 16, 20, 1);
  expect(handle).toBeGreaterThan(0);
  try {
    expect(e.la_bigpass_step(handle, 1)).toBe(1);
    expect(e.la_bigpass_step(handle, 1)).toBe(2);
    for (const start of [0, 1]) {
      expect(e.la_next(handle, p + 1100, p + 1200, 10, p + 1120)).toBe(1);
      expect([...new Int32Array(e.memory.buffer, p + 1100, 5)]).toEqual([20, 0, 2, start, start + 2]);
      expect(new Int32Array(e.memory.buffer, p + 1120, 1)[0]).toBe(2);
      expect([...new Uint8Array(e.memory.buffer, p + 1200, 2)]).toEqual([61, 61]);
    }
    const singletons: number[][] = [];
    for (let i = 0; i < 2; i++) {
      expect(e.la_next(handle, p + 1100, p + 1200, 10, p + 1120)).toBe(1);
      const hit = [...new Int32Array(e.memory.buffer, p + 1100, 5)];
      expect(hit[0]).toBe(10);
      singletons.push(hit.slice(1));
    }
    expect(singletons.sort()).toEqual([[0, 1, 2, 3], [1, 2, 0, 1]]);
    expect(e.la_next(handle, p + 1100, p + 1200, 10, p + 1120)).toBe(0);
  } finally {
    e.la_destroy(handle);
    e.free(p);
  }
});

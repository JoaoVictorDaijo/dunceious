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
import { afterEach, expect, it, vi } from 'vitest';
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.resetModules(); });
const load = (path: string) => { const b = readFileSync(path); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const engine = load('public/wasm/local-align.wasm');
const score = load('public/wasm/local-align-ssw.wasm');
const serve = (files: Record<string, ArrayBuffer>) => vi.fn(async (url: string) =>
  url in files ? { ok: true, arrayBuffer: async () => files[url] } : { ok: false, status: 404 });
it('fetches and validates both modules once and retains them for offline replacement', async () => {
  const fetcher = serve({ '/wasm/local-align.wasm': engine, '/wasm/local-align-ssw.wasm': score });
  vi.stubGlobal('fetch', fetcher);
  const { loadLocalEngineBytes } = await import('../../lib/localEngineModule');
  const first = await loadLocalEngineBytes();
  expect(first).toEqual({ engine, score });
  expect(first.engine).toBe(engine);
  expect(first.score).toBe(score);
  expect(await loadLocalEngineBytes()).toBe(first);
  expect(fetcher.mock.calls.map(([url]) => url).sort()).toEqual(['/wasm/local-align-ssw.wasm', '/wasm/local-align.wasm']);
});
it('skips the score module where wasm SIMD does not validate', async () => {
  const fetcher = serve({ '/wasm/local-align.wasm': engine });
  vi.stubGlobal('fetch', fetcher);
  vi.spyOn(WebAssembly, 'validate').mockReturnValue(false);
  const { loadLocalEngineBytes } = await import('../../lib/localEngineModule');
  expect(await loadLocalEngineBytes()).toEqual({ engine, score: null });
  expect(fetcher).toHaveBeenCalledExactlyOnceWith('/wasm/local-align.wasm');
});
it('fails instead of falling back when a SIMD browser cannot load the score module', async () => {
  vi.stubGlobal('fetch', serve({ '/wasm/local-align.wasm': engine }));
  const { loadLocalEngineBytes } = await import('../../lib/localEngineModule');
  await expect(loadLocalEngineBytes()).rejects.toThrow('Local module load failed (HTTP 404)');
});
it.each(['http', 'corrupt', 'network'])('exposes a %s load failure', async kind => {
  vi.stubGlobal('fetch', kind === 'network' ? vi.fn().mockRejectedValue(new Error('offline')) : vi.fn().mockResolvedValue({ ok: kind !== 'http', status: 503, arrayBuffer: async () => new ArrayBuffer(2) }));
  const { loadLocalEngineBytes } = await import('../../lib/localEngineModule');
  await expect(loadLocalEngineBytes()).rejects.toThrow();
});

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
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
it('fetches and validates once and retains the bytes for offline replacement', async () => {
  const b = readFileSync('public/wasm/local-align.wasm');
  const bytes = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  const fetcher = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => bytes });
  vi.stubGlobal('fetch', fetcher);
  const { loadLocalEngineBytes } = await import('../../lib/localEngineModule');
  expect(await loadLocalEngineBytes()).toBe(bytes);
  expect(await loadLocalEngineBytes()).toBe(bytes);
  expect(fetcher).toHaveBeenCalledExactlyOnceWith('/wasm/local-align.wasm');
});
it.each(['http', 'corrupt', 'network'])('exposes a %s load failure', async kind => {
  vi.stubGlobal('fetch', kind === 'network' ? vi.fn().mockRejectedValue(new Error('offline')) : vi.fn().mockResolvedValue({ ok: kind !== 'http', status: 503, arrayBuffer: async () => new ArrayBuffer(2) }));
  const { loadLocalEngineBytes } = await import('../../lib/localEngineModule');
  await expect(loadLocalEngineBytes()).rejects.toThrow();
});

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

import { useEffect, useState } from 'react';
export interface LocalEngineBytes {
  engine: ArrayBuffer;
  /** SSW SIMD score module; null where wasm SIMD is unavailable, so the scalar score pass runs. */
  score: ArrayBuffer | null;
}
let loading: Promise<LocalEngineBytes> | null = null;

/** i32.const 0; i8x16.splat; i8x16.popcnt: the wasm-feature-detect SIMD probe. */
const SIMD_PROBE = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0,
  10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);

async function fetchModule(name: string): Promise<ArrayBuffer> {
  const response = await fetch(`${import.meta.env.BASE_URL}wasm/${name}`);
  if (!response.ok) throw new Error(`Local module load failed (HTTP ${response.status})`);
  const bytes = await response.arrayBuffer();
  await WebAssembly.compile(bytes);
  return bytes;
}

/** Keep validated bytes on the page so replacement workers work offline. A SIMD browser that cannot
 * compile the score module fails like the engine would, rather than silently dropping to scalar. */
export function loadLocalEngineBytes(): Promise<LocalEngineBytes> {
  loading ??= (async () => {
    const [engine, score] = await Promise.all([fetchModule('local-align.wasm'),
      WebAssembly.validate(SIMD_PROBE) ? fetchModule('local-align-ssw.wasm') : null]);
    return { engine, score };
  })();
  return loading;
}
export function useLocalEngineBytes() {
  const [state, setState] = useState<{ bytes: LocalEngineBytes | null; error: string | null }>({ bytes: null, error: null });
  useEffect(() => {
    let alive = true;
    void loadLocalEngineBytes().then(bytes => { if (alive) setState({ bytes, error: null }); },
      e => { if (alive) setState({ bytes: null, error: `Local module load failed: ${String(e)}` }); });
    return () => { alive = false; };
  }, []);
  return state;
}

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
let loading: Promise<ArrayBuffer> | null = null;

/** Keep validated bytes on the page so replacement workers work offline. */
export function loadLocalEngineBytes(): Promise<ArrayBuffer> {
  loading ??= (async () => {
    const response = await fetch(`${import.meta.env.BASE_URL}wasm/local-align.wasm`);
    if (!response.ok) throw new Error(`Local module load failed (HTTP ${response.status})`);
    const bytes = await response.arrayBuffer();
    await WebAssembly.compile(bytes);
    return bytes;
  })();
  return loading;
}
export function useLocalEngineBytes() {
  const [state, setState] = useState<{ bytes: ArrayBuffer | null; error: string | null }>({ bytes: null, error: null });
  useEffect(() => {
    let alive = true;
    void loadLocalEngineBytes().then(bytes => { if (alive) setState({ bytes, error: null }); },
      e => { if (alive) setState({ bytes: null, error: `Local module load failed: ${String(e)}` }); });
    return () => { alive = false; };
  }, []);
  return state;
}

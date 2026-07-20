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

import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  THEMES,
  THEME_KEYS,
  DEFAULT_THEME_KEY,
  DEFAULT_PALETTE,
  getTheme,
  resolveThemeVars,
  readThemePref,
  writeThemePref,
} from '../theme';

const KEY = 'dunceious.theme';

function makeStorage(seed?: Record<string, string>) {
  const store = new Map<string, string>(Object.entries(seed ?? {}));
  return {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    store,
  };
}
function stubWindow(storage: ReturnType<typeof makeStorage>) {
  vi.stubGlobal('window', { localStorage: storage });
}

describe('theme registry', () => {
  it('ships exactly the seven shortlisted keys, clean first', () => {
    expect(THEME_KEYS).toEqual([
      'clean', 'layered-light', 'aurora', 'conic', 'light-shaft', 'duotone-drift', 'mesh-grain',
    ]);
  });

  it('default is clean and present in the registry', () => {
    expect(DEFAULT_THEME_KEY).toBe('clean');
    expect(THEMES.some(t => t.key === DEFAULT_THEME_KEY)).toBe(true);
  });

  it('every theme has a non-empty label and unique key', () => {
    const keys = THEMES.map(t => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const t of THEMES) expect(t.label.length).toBeGreaterThan(0);
  });

  it('the palette covers all four environments with three hex tokens each', () => {
    for (const env of ['nucleotide', 'protein', 'hub', 'none'] as const) {
      const p = DEFAULT_PALETTE[env];
      for (const slot of ['env', 'env2', 'env3'] as const) {
        expect(p[slot]).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    }
  });

  it('ships the approved retunes (sky teal env3, protein a78bfa)', () => {
    expect(DEFAULT_PALETTE.nucleotide.env3).toBe('#0d9488');
    expect(DEFAULT_PALETTE.protein.env).toBe('#a78bfa');
  });

  it('resolveThemeVars maps the resolved env to the three CSS custom properties', () => {
    expect(resolveThemeVars(getTheme('clean'), 'hub')).toEqual({
      '--env': '#f59e0b', '--env2': '#fbbf24', '--env3': '#f97316',
    });
  });

  it('resolveThemeVars returns the neutral family for none', () => {
    expect(resolveThemeVars(getTheme('aurora'), 'none')).toEqual({
      '--env': '#929ba8', '--env2': '#b8bec7', '--env3': '#6e7684',
    });
  });

  it('getTheme falls back to the default for an unknown key', () => {
    expect(getTheme('nonsense' as never).key).toBe(DEFAULT_THEME_KEY);
  });
});

describe('theme persistence', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads the default when unset', () => {
    stubWindow(makeStorage());
    expect(readThemePref()).toBe('clean');
  });

  it('round-trips a valid key', () => {
    const storage = makeStorage();
    stubWindow(storage);
    writeThemePref('aurora');
    expect(storage.getItem(KEY)).toBe('aurora');
    expect(readThemePref()).toBe('aurora');
  });

  it('reads the default when the stored key is unknown/stale', () => {
    stubWindow(makeStorage({ [KEY]: 'removed-theme' }));
    expect(readThemePref()).toBe('clean');
  });

  it('is a no-op without a window (SSR/non-DOM)', () => {
    expect(() => writeThemePref('conic')).not.toThrow();
    expect(readThemePref()).toBe('clean');
  });

  it('falls back to the default when localStorage access throws (blocked storage)', () => {
    const denied = () => { throw new DOMException('denied', 'SecurityError'); };
    vi.stubGlobal('window', { localStorage: { getItem: denied, setItem: denied, removeItem: denied } });
    expect(readThemePref()).toBe('clean');
  });

  it('write is a no-op (does not throw) when localStorage access throws', () => {
    const denied = () => { throw new DOMException('denied', 'SecurityError'); };
    vi.stubGlobal('window', { localStorage: { getItem: denied, setItem: denied, removeItem: denied } });
    expect(() => writeThemePref('aurora')).not.toThrow();
  });
});

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
  it('ships exactly the four kept keys, clean first', () => {
    expect(THEME_KEYS).toEqual(['clean', 'layered-light', 'aurora', 'mesh-grain']);
  });

  it('every theme describes itself for the picker', () => {
    for (const t of THEMES) expect(t.description.length).toBeGreaterThan(0);
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

  it('keeps every env accent legible as text on the chrome and under slate-950 text', () => {
    const luminance = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map(i => {
        const c = parseInt(hex.slice(i, i + 2), 16) / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contrast = (a: string, b: string) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    // slate-900 / slate-950 as overridden in tailwind.config.js
    for (const p of Object.values(DEFAULT_PALETTE)) {
      expect(contrast(p.env, '#151e34')).toBeGreaterThanOrEqual(7);
      expect(contrast(p.env, '#091023')).toBeGreaterThanOrEqual(7);
    }
  });

  it('resolveThemeVars maps the resolved env to the three CSS custom properties', () => {
    expect(resolveThemeVars(getTheme('clean'), 'hub')).toEqual({
      '--env': '#dfa04b', '--env2': '#f5c891', '--env3': '#b07a2e',
    });
  });

  it('resolveThemeVars returns the neutral family for none', () => {
    expect(resolveThemeVars(getTheme('aurora'), 'none')).toEqual({
      '--env': '#a7afb9', '--env2': '#ccd2d9', '--env3': '#808790',
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
    stubWindow(makeStorage({ [KEY]: 'conic' }));
    expect(readThemePref()).toBe('clean');
  });

  it('is a no-op without a window (SSR/non-DOM)', () => {
    expect(() => writeThemePref('mesh-grain')).not.toThrow();
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

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

import type { EnvAccentKey } from './environment';

/** One accent's three token slots. `env` also tints chrome text/icons (helix, labels). */
export interface EnvPalette {
  env: string;
  env2: string;
  env3: string;
}

// Keys predate the current labels (layered-light shows as Halo, mesh-grain as
// Mesh); they are what browsers have persisted, so they stay.
export type ThemeKey = 'clean' | 'layered-light' | 'aurora' | 'mesh-grain';

export interface Theme {
  key: ThemeKey;
  label: string;
  /** One line for the picker's tooltip. */
  description: string;
  /** Per-environment token sets. V1 themes all share DEFAULT_PALETTE. */
  palette: Record<EnvAccentKey, EnvPalette>;
}

/**
 * The shipped accent palette — the single source of truth for the env tokens.
 * Every family is generated at the same OKLCH lightness (env 0.75, env2 0.86,
 * env3 0.62) and chroma (0.125; 0.018 for `none`), varying only the hue
 * (nucleotide 232°, protein 298°, hub 72°). Equal lightness is what keeps one
 * session from reading hotter than another — the old Tailwind-500 set let amber
 * run ~25% brighter. `env` doubles as the fill of active controls, so it must
 * carry slate-950 text and stay legible as text on the slate-900 chrome
 * (both above 7:1; pinned in theme.test.ts).
 */
export const DEFAULT_PALETTE: Record<EnvAccentKey, EnvPalette> = {
  nucleotide: { env: '#4bbbef', env2: '#95dcff', env3: '#2b91be' },
  protein:    { env: '#b89cf3', env2: '#d7c5ff', env3: '#8f76c1' },
  hub:        { env: '#dfa04b', env2: '#f5c891', env3: '#b07a2e' },
  none:       { env: '#a7afb9', env2: '#ccd2d9', env3: '#808790' },
};

export const DEFAULT_THEME_KEY: ThemeKey = 'clean';

export const THEMES: Theme[] = [
  { key: 'clean',         label: 'Clean',  palette: DEFAULT_PALETTE,
    description: 'Flat chrome with a single accent seam. Calmest, cheapest to render.' },
  { key: 'layered-light', label: 'Halo',   palette: DEFAULT_PALETTE,
    description: 'Soft pools of light glowing from the seam.' },
  { key: 'aurora',        label: 'Aurora', palette: DEFAULT_PALETTE,
    description: 'Slow luminous bands drifting across the header.' },
  { key: 'mesh-grain',    label: 'Mesh',   palette: DEFAULT_PALETTE,
    description: 'A still gradient mesh with a fine film grain.' },
];

export const THEME_KEYS: ThemeKey[] = THEMES.map(t => t.key);

const isThemeKey = (v: string | null): v is ThemeKey =>
  v !== null && THEME_KEYS.includes(v as ThemeKey);

/** The theme for a key, falling back to the default for anything unknown. */
export const getTheme = (key: ThemeKey): Theme =>
  THEMES.find(t => t.key === key) ?? THEMES.find(t => t.key === DEFAULT_THEME_KEY)!;

/** The three CSS custom properties for a theme at a resolved environment. */
export const resolveThemeVars = (
  theme: Theme,
  env: EnvAccentKey,
): Record<'--env' | '--env2' | '--env3', string> => {
  const p = theme.palette[env];
  return { '--env': p.env, '--env2': p.env2, '--env3': p.env3 };
};

const STORAGE_KEY = 'dunceious.theme';

/**
 * The persisted theme key for this browser, or the default when unset/unknown.
 * `localStorage` access is wrapped because it throws (not returns null) when storage
 * is blocked — sandboxed iframe, disabled site data, some private modes — and this
 * runs during App's first render, so an unguarded throw would fail the mount.
 */
export const readThemePref = (): ThemeKey => {
  if (typeof window === 'undefined') return DEFAULT_THEME_KEY;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isThemeKey(stored) ? stored : DEFAULT_THEME_KEY;
  } catch {
    return DEFAULT_THEME_KEY;
  }
};

/** Persist the chosen theme key (per browser); best-effort — a blocked/full store is a no-op. */
export const writeThemePref = (key: ThemeKey): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, key);
  } catch {
    /* storage blocked or full — the theme still applies for this session */
  }
};

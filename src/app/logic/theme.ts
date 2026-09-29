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

export type ThemeKey =
  | 'clean' | 'layered-light' | 'aurora' | 'conic'
  | 'light-shaft' | 'duotone-drift' | 'mesh-grain';

export interface Theme {
  key: ThemeKey;
  label: string;
  /** Per-environment token sets. V1 themes all share DEFAULT_PALETTE. */
  palette: Record<EnvAccentKey, EnvPalette>;
}

/**
 * The shipped accent palette — the single source of truth for the env tokens.
 * Values are the prototype's tuned families with both approved retunes:
 * nucleotide.env3 teal (#0d9488) and protein.env #a78bfa (WCAG AA on the chrome).
 * `none` is a luminance-matched neutral family, not eyeballed grey — it keeps the
 * no-session chrome from dropping below any contrast the coloured families survive.
 */
export const DEFAULT_PALETTE: Record<EnvAccentKey, EnvPalette> = {
  nucleotide: { env: '#0ea5e9', env2: '#22d3ee', env3: '#0d9488' },
  protein:    { env: '#a78bfa', env2: '#d8b4fe', env3: '#c026d3' },
  hub:        { env: '#f59e0b', env2: '#fbbf24', env3: '#f97316' },
  none:       { env: '#929ba8', env2: '#b8bec7', env3: '#6e7684' },
};

export const DEFAULT_THEME_KEY: ThemeKey = 'clean';

export const THEMES: Theme[] = [
  { key: 'clean',         label: 'Clean',         palette: DEFAULT_PALETTE },
  { key: 'layered-light', label: 'Layered Light', palette: DEFAULT_PALETTE },
  { key: 'aurora',        label: 'Aurora',        palette: DEFAULT_PALETTE },
  { key: 'conic',         label: 'Conic Sheen',   palette: DEFAULT_PALETTE },
  { key: 'light-shaft',   label: 'Prism Shafts',  palette: DEFAULT_PALETTE },
  { key: 'duotone-drift', label: 'Duotone Drift', palette: DEFAULT_PALETTE },
  { key: 'mesh-grain',    label: 'Mesh Grain',    palette: DEFAULT_PALETTE },
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

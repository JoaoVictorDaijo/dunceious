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

export type EnvAccentKey = 'nucleotide' | 'protein' | 'hub' | 'none';

/**
 * The active environment accent. With no molecule there is no environment, so the
 * Annotation Hub does NOT go amber on an empty session — the null check runs first.
 * In the Hub the accent reads `hub`; in the viewport it reads the molecule's own
 * environment. Colour values for each key live in ENV_PALETTE below.
 */
export const resolveEnvAccent = (
  activeTab: 'alignment' | 'features',
  moleculeType: 'nucleotide' | 'protein' | null,
): EnvAccentKey => {
  if (moleculeType === null) return 'none';
  if (activeTab === 'features') return 'hub';
  return moleculeType;
};

/** One accent's three token slots. `env` also tints chrome text/icons (helix, labels). */
export interface EnvPalette {
  env: string;
  env2: string;
  env3: string;
}

/**
 * The accent palette — the single source of truth for the env tokens.
 * Every family is generated at the same OKLCH lightness (env 0.75, env2 0.86,
 * env3 0.62) and chroma (0.125; 0.018 for `none`), varying only the hue
 * (nucleotide 232°, protein 298°, hub 72°). Equal lightness is what keeps one
 * session from reading hotter than another — the old Tailwind-500 set let amber
 * run ~25% brighter. `env` doubles as the fill of active controls, so it must
 * carry slate-950 text and stay legible as text on the slate-900 chrome
 * (both above 7:1; pinned in environment.test.ts).
 */
export const ENV_PALETTE: Record<EnvAccentKey, EnvPalette> = {
  nucleotide: { env: '#4bbbef', env2: '#95dcff', env3: '#2b91be' },
  protein:    { env: '#b89cf3', env2: '#d7c5ff', env3: '#8f76c1' },
  hub:        { env: '#dfa04b', env2: '#f5c891', env3: '#b07a2e' },
  none:       { env: '#a7afb9', env2: '#ccd2d9', env3: '#808790' },
};

/** The three CSS custom properties for an environment. */
export const envAccentVars = (env: EnvAccentKey): Record<'--env' | '--env2' | '--env3', string> => {
  const p = ENV_PALETTE[env];
  return { '--env': p.env, '--env2': p.env2, '--env3': p.env3 };
};

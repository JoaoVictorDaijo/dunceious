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

// A single "environment accent" answers where you are, and the chrome's own
// accented elements — the helix mark, the edge strips, section labels — re-tint
// to it as you move between modes: the molecule's colour in the viewport, amber
// in the Database Hub. The dark-blue base never changes; only the accents do.
// Each layer carries a solid `hex` (for icons/text) and an `rgb` triple (for the
// edge-strip gradients).
export const ENV_LAYERS = [
  { key: 'nucleotide', hex: '#0ea5e9', rgb: '56, 189, 248' },
  { key: 'protein', hex: '#8b5cf6', rgb: '139, 92, 246' },
  { key: 'hub', hex: '#f59e0b', rgb: '245, 158, 11' },
] as const;

export type EnvLayer = (typeof ENV_LAYERS)[number];
export type EnvAccentKey = EnvLayer['key'] | 'none';

/**
 * The active accent. With no session the chrome keeps its default. In the
 * Database Hub the accent reads amber regardless of molecule (the task is what
 * matters there); in the viewport it reads the molecule's own colour.
 */
export const resolveEnvAccent = (
  activeTab: 'alignment' | 'features',
  moleculeType: 'nucleotide' | 'protein' | null,
): EnvAccentKey => {
  if (moleculeType === null) return 'none';
  if (activeTab === 'features') return 'hub';
  return moleculeType;
};

export const envLayer = (key: EnvAccentKey): EnvLayer | undefined =>
  ENV_LAYERS.find(l => l.key === key);

/** Solid accent colour for identity elements (the helix mark, labels) that re-tint by mode. */
export const envAccentColor = (key: EnvAccentKey): string | undefined => envLayer(key)?.hex;

/** Thin edge bloom for the hairline strips above and below the workspace. */
export const envEdgeGradient = (rgb: string, direction: 'to top' | 'to bottom'): string =>
  `linear-gradient(${direction}, rgba(${rgb}, 0.45), rgba(${rgb}, 0.12) 55%, transparent)`;

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

import { describe, it, expect } from 'vitest';
import { ENV_PALETTE, envAccentVars, resolveEnvAccent } from '../environment';

describe('resolveEnvAccent', () => {
  it('is none when no molecule is loaded, regardless of tab', () => {
    expect(resolveEnvAccent('alignment', null)).toBe('none');
    expect(resolveEnvAccent('features', null)).toBe('none');
  });

  it('is the molecule environment in the viewport', () => {
    expect(resolveEnvAccent('alignment', 'nucleotide')).toBe('nucleotide');
    expect(resolveEnvAccent('alignment', 'protein')).toBe('protein');
  });

  it('is hub in the Annotation Hub when a molecule is loaded', () => {
    expect(resolveEnvAccent('features', 'nucleotide')).toBe('hub');
    expect(resolveEnvAccent('features', 'protein')).toBe('hub');
  });
});

describe('env palette', () => {
  it('covers all four environments with three hex tokens each', () => {
    for (const env of ['nucleotide', 'protein', 'hub', 'none'] as const) {
      for (const slot of ['env', 'env2', 'env3'] as const) {
        expect(ENV_PALETTE[env][slot]).toMatch(/^#[0-9a-fA-F]{6}$/);
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
    for (const p of Object.values(ENV_PALETTE)) {
      expect(contrast(p.env, '#151e34')).toBeGreaterThanOrEqual(7);
      expect(contrast(p.env, '#091023')).toBeGreaterThanOrEqual(7);
    }
  });

  it('envAccentVars maps an environment to the three CSS custom properties', () => {
    expect(envAccentVars('hub')).toEqual({ '--env': '#dfa04b', '--env2': '#f5c891', '--env3': '#b07a2e' });
    expect(envAccentVars('none')).toEqual({ '--env': '#a7afb9', '--env2': '#ccd2d9', '--env3': '#808790' });
  });
});

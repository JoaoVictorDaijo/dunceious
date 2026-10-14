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

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as constants from '../constants';

const read = (file: string) => readFileSync(resolve(__dirname, file), 'utf8');

describe('translation transition contract', () => {
  it('shares the drawing threshold with the layout caller', () => {
    expect(constants).toHaveProperty('TRANSLATION_MIN_ZOOM', 5);
    for (const file of ['../GenomeViewer.tsx', '../tracks/SequenceTrack.tsx']) {
      const source = read(file);
      expect(source).toContain('zoomLevel > TRANSLATION_MIN_ZOOM');
      expect(source).not.toMatch(/zoomLevel > 5\b/);
    }
  });

  it('matches annotation timing and disables motion for reduced motion', () => {
    const css = read('../../index.css');
    expect(css).toMatch(/\.translation-motion[^{}]*\{[^}]*transform 240ms cubic-bezier\(0\.4, 0, 0\.2, 1\)/);
    expect(css).toMatch(/\.translation-band[^{}]*\{[^}]*opacity 240ms cubic-bezier\(0\.4, 0, 0\.2, 1\)/);
    const reduced = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/g)].map(m => m[1]).join('\n');
    expect(reduced).toMatch(/\.translation-motion[^{}]*\{[^}]*transition: none/);
    expect(reduced).toMatch(/\.translation-band[^{}]*\{[^}]*transition: none/);
  });
});

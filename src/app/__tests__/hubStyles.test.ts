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

import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import config from '../../../tailwind.config.js';

it('compiles the current card accent with valid direct percentage weights', async () => {
  const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
  const compiled = await postcss([tailwindcss({ ...config, content: [{ raw: '<section class="hub-group-card hub-group-current"></section>', extension: 'html' }] })]).process(css, { from: undefined });
  const values = new Map<string, string>();
  compiled.root.walkRules('.hub-group-current', rule => {
    rule.walkDecls(declaration => { values.set(declaration.prop, declaration.value); });
  });
  expect(values.get('border-color')).toBe('color-mix(in srgb, var(--env) 70%, transparent)');
  expect(values.get('box-shadow')).toContain('color-mix(in srgb, var(--env) 16%, transparent)');
});

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

const compile = async (raw: string, selector: string) => {
  const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
  const compiled = await postcss([tailwindcss({ ...config, content: [{ raw, extension: 'html' }] })]).process(css, { from: undefined });
  const values = new Map<string, string>();
  compiled.root.walkRules(selector, rule => {
    rule.walkDecls(declaration => { values.set(declaration.prop, declaration.value); });
  });
  return values;
};

it('keeps the current card border neutral', async () => {
  const values = await compile('<section class="hub-group-card hub-group-current"></section>', '.hub-group-current');
  expect(values.get('border-color')).toBe('#94a3b8');
  expect(values.has('box-shadow')).toBe(false);
});

it('marks the current section surface with a neutral fill and an accent edge', async () => {
  const values = await compile('<div class="hub-surface-current"></div>', '.hub-surface-current');
  expect(values.get('background-color')).toBe('#f8fafc');
  expect(values.get('box-shadow')).toBe('inset 4px 0 0 var(--env)');
});

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
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import postcss from 'postcss';
import tailwindcss from '@tailwindcss/postcss';

const cssFile = fileURLToPath(new URL('../index.css', import.meta.url));
const base = fileURLToPath(new URL('../../../', import.meta.url));
const source = readFileSync(cssFile, 'utf8');
const compiled = postcss([tailwindcss({ base, optimize: false })]).process(source, { from: cssFile });

async function declarations(selector: string) {
  const values = new Map<string, string>();
  (await compiled).root.walkRules(selector, rule => {
    rule.walkDecls(declaration => { values.set(declaration.prop, declaration.value); });
  });
  return values;
}

it('keeps the current card border neutral', async () => {
  const values = await declarations('.hub-group-current');
  expect(values.get('border-color')).toBe('#94a3b8');
  expect(values.has('box-shadow')).toBe(false);
});

it('marks the current section surface with a neutral fill and an accent edge', async () => {
  const values = await declarations('.hub-surface-current');
  expect(values.get('background-color')).toBe('#f8fafc');
  expect(values.get('box-shadow')).toBe('inset 4px 0 0 var(--env)');
});

it('loads the existing palette and variable fonts through the real CSS config directive', async () => {
  const text = (await compiled).css;
  expect((await declarations('.bg-slate-800')).get('background-color')).toBe('#243146');
  expect((await declarations('.bg-slate-900')).get('background-color')).toBe('#151e34');
  expect((await declarations('.text-amber-500')).get('color')).toBe('#f59e0b');
  expect(text).toContain('Inter Variable');
  expect(text).toContain('JetBrains Mono Variable');
});

it('generates environment accents and the existing animation plugin utilities', async () => {
  const background = await declarations('.bg-env');
  expect(background.get('background-color')).toContain('var(--env)');
  const animation = await declarations('.animate-in');
  expect(animation.get('animation-name')).toBe('enter');
  const names: string[] = [];
  (await compiled).root.walkAtRules('keyframes', rule => { names.push(rule.params); });
  expect(names).toContain('enter');
});

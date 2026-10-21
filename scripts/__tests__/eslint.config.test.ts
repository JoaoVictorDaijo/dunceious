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

import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

// Exercise the repository's real flat config, including globals.node for scripts.
const eslint = new ESLint();

async function lint(source: string) {
  const [result] = await eslint.lintText(source, { filePath: 'scripts/lint-contract.mjs' });
  return result.messages;
}

describe('recommended lint safeguards', () => {
  it.each(['globalThis();', 'new globalThis();'])(
    'rejects the non-callable global object: %s', async source => {
      expect(await lint(source)).toEqual([
        expect.objectContaining({ ruleId: 'no-obj-calls', severity: 2 }),
      ]);
    },
  );

  it('rejects optional chaining that can pass undefined to yield*', async () => {
    expect(await lint('export function* values(source) { yield* source?.values; }')).toEqual([
      expect.objectContaining({ ruleId: 'no-unsafe-optional-chaining', severity: 2 }),
    ]);
  });

  it('accepts ordinary global access and a defined iterable fallback', async () => {
    expect(await lint(`
      export const clock = globalThis.Date;
      export function* values(source) { yield* source?.values ?? []; }
    `)).toEqual([]);
  });
});

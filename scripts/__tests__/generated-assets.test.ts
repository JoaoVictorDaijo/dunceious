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

/**
 * Drift guard: the PreToolUse hook (guard-generated-files.mjs, via
 * generated-assets.mjs) blocks hand-edits to the brand assets that
 * gen-brand-assets.py emits. That block list and the generator are independent
 * sources of truth; this test fails loudly if they diverge, so a newly generated
 * asset can never silently become editable-and-then-overwritten.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { GENERATED_ASSETS } from '../generated-assets.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GENERATOR = path.join(HERE, '..', 'gen-brand-assets.py');

/** Repo-relative paths the generator writes via `os.path.join(PUBLIC, "…")`. */
function generatorOutputs(): string[] {
  const src = readFileSync(GENERATOR, 'utf8');
  const re = /os\.path\.join\(\s*PUBLIC\s*,\s*["']([^"']+)["']\s*\)/g;
  const names = new Set<string>();
  for (const m of src.matchAll(re)) names.add(`public/${m[1]}`);
  return [...names].sort();
}

describe('generated-asset guard list', () => {
  it('matches exactly what gen-brand-assets.py emits (no silent drift)', () => {
    const actual = generatorOutputs();
    // If the generator is refactored away from the `os.path.join(PUBLIC, …)`
    // shape, the regex finds nothing — fail loudly rather than pass on an empty set.
    expect(actual.length).toBeGreaterThan(0);
    expect([...GENERATED_ASSETS].sort()).toEqual(actual);
  });
});

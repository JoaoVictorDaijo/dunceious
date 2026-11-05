/*
 * Dunceious
 * Copyright (C) 2026 João Victor Daijo and Murilo Cassiano
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

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.join(__dirname, '..', '..');
const read = (file: string) => readFileSync(path.join(ROOT, file), 'utf8');

describe('pinned Node version', () => {
  it('is one exact version in .nvmrc and pnpm devEngines.runtime', () => {
    const version = read('.nvmrc').trim();
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.devEngines?.runtime).toEqual({ name: 'node', version, onFail: 'download' });
    expect(pkg.packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+\+sha512\./);
  });

  // CI's setup-node must install the same Node; a literal version drifts.
  it('is what every CI setup-node step installs', () => {
    const workflows = readdirSync(path.join(ROOT, '.github', 'workflows')).filter((f) => /\.ya?ml$/.test(f));
    for (const file of workflows) {
      const text = read(path.join('.github', 'workflows', file));
      const steps = text.split(/^\s*- (?:name|uses):/m).filter((s) => s.includes('actions/setup-node@'));
      for (const step of steps) {
        expect(step, file).toMatch(/node-version-file: \.nvmrc/);
        expect(step, file).not.toMatch(/node-version:/);
      }
    }
  });
});

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

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { collectPackages, packageDirOf, renderNotices } from '../legal-notices.mjs';

describe('packageDirOf', () => {
  it('resolves unscoped and scoped packages', () => {
    expect(packageDirOf('/app/node_modules/react/cjs/react.production.js')).toBe('/app/node_modules/react');
    expect(packageDirOf('/app/node_modules/@fontsource-variable/inter/index.css')).toBe(
      '/app/node_modules/@fontsource-variable/inter',
    );
  });

  it('strips the virtual-module prefix and query, and picks the innermost package', () => {
    expect(packageDirOf('\0/app/node_modules/a/node_modules/b/x.js?commonjs-module')).toBe(
      '/app/node_modules/a/node_modules/b',
    );
  });

  it('treats project code as first-party', () => {
    expect(packageDirOf('/app/src/main.tsx')).toBeNull();
  });
});

describe('collectPackages', () => {
  let root: string;

  function fakePackage(name: string, files: Record<string, string>) {
    const dir = path.join(root, 'node_modules', name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0', license: 'MIT' }));
    for (const [file, text] of Object.entries(files)) writeFileSync(path.join(dir, file), text);
    return dir;
  }

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'legal-notices-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('lists each bundled package once, sorted, with its license and NOTICE texts', () => {
    const zeta = fakePackage('zeta', { LICENSE: 'zeta license' });
    const alpha = fakePackage('@scope/alpha', { 'LICENSE.md': 'alpha license', NOTICE: 'alpha notice' });

    const packages = collectPackages([
      `${zeta}/index.js`,
      `${zeta}/other.js`,
      `${alpha}/style.css`,
      path.join(root, 'src', 'app.ts'),
    ]);

    expect(packages.map((p) => p.name)).toEqual(['@scope/alpha', 'zeta']);
    expect(packages[0].texts).toEqual(['alpha license', 'alpha notice']);
  });

  it('fails the build when a bundled package ships no license text', () => {
    const bare = fakePackage('bare', {});

    expect(() => collectPackages([`${bare}/index.js`])).toThrow(/bare@1\.0\.0 is bundled but ships no license file/);
  });
});

describe('renderNotices', () => {
  it('reproduces every license text under its package heading', () => {
    const text = renderNotices([{ name: 'react', version: '19.0.0', license: 'MIT', texts: ['MIT License body'] }]);

    expect(text).toContain('see COPYING.txt');
    expect(text).toContain('react 19.0.0 - MIT');
    expect(text).toContain('MIT License body');
  });
});

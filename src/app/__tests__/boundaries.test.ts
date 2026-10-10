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

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkImports } from './importGraph';

function appSources(dir = 'src/app'): { path: string; source: string }[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === '__tests__' ? [] : appSources(full);
    if (!/\.(ts|tsx)$/.test(name) || /\.test\.tsx?$/.test(name)) return [];
    return [{ path: relative('.', full), source: readFileSync(full, 'utf8') }];
  });
}

const one = (path: string, source: string) => checkImports([{ path, source }]);

describe('app import boundaries', () => {
  it('the real app has no violations', () => {
    expect(checkImports(appSources())).toEqual([]);
  });

  it('rejects a static import from shared into desktop', () => {
    expect(one('src/app/shared/logic/x.ts', "import D from '../../desktop/DesktopApp';")).toHaveLength(1);
  });

  it('rejects a type-only import from desktop into mobile', () => {
    expect(one('src/app/desktop/components/x.tsx', "import type { M } from '@/src/app/mobile/MobileApp';")).toHaveLength(1);
  });

  it('rejects a dynamic import of a non-root mobile module from the shell', () => {
    const src = "import React from 'react';\nconst Map = React.lazy(() => import('../mobile/screens/Map'));";
    expect(one('src/app/shell/ShellRoot.tsx', src)).toHaveLength(1);
  });

  it('rejects an eager dynamic import of a root', () => {
    expect(one('src/app/shell/ShellRoot.tsx', "const p = import('../desktop/DesktopApp');")).toHaveLength(1);
  });

  it('allows the two lazy roots in ShellRoot', () => {
    const src = [
      "import React from 'react';",
      "const DesktopApp = React.lazy(() => import('../desktop/DesktopApp'));",
      "const MobileApp = React.lazy(() => import('../mobile/MobileApp'));",
    ].join('\n');
    expect(one('src/app/shell/ShellRoot.tsx', src)).toEqual([]);
  });

  it('rejects a lazy root outside ShellRoot', () => {
    const src = "import React from 'react';\nconst D = React.lazy(() => import('../desktop/DesktopApp'));";
    expect(one('src/app/shell/Other.tsx', src)).toHaveLength(1);
  });
});

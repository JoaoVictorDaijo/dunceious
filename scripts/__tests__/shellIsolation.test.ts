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
import { checkShellIsolation } from '../shellIsolation.mjs';

const ROOT = '/repo/';
const chunk = (moduleIds: string[], extra: Record<string, unknown> = {}) => ({
  type: 'chunk' as const,
  moduleIds: moduleIds.map(m => ROOT + m),
  imports: [] as string[],
  ...extra,
});

describe('checkShellIsolation', () => {
  it('passes a clean bundle', () => {
    const bundle = {
      'index.js': chunk(['src/app/main.tsx', 'src/app/shell/ShellRoot.tsx'], { isEntry: true }),
      'DesktopApp.js': chunk(['src/app/desktop/DesktopApp.tsx'], { facadeModuleId: ROOT + 'src/app/desktop/DesktopApp.tsx', imports: ['shared.js'] }),
      'MobileApp.js': chunk(['src/app/mobile/MobileApp.tsx'], { facadeModuleId: ROOT + 'src/app/mobile/MobileApp.tsx', imports: ['shared.js'] }),
      'shared.js': chunk(['src/app/shared/workspace/useWorkspace.ts']),
    };
    expect(checkShellIsolation(bundle)).toEqual([]);
  });

  it('flags a mobile module inside a desktop-reachable chunk', () => {
    const bundle = {
      'index.js': chunk(['src/app/main.tsx'], { isEntry: true }),
      'DesktopApp.js': chunk(['src/app/desktop/DesktopApp.tsx'], { facadeModuleId: ROOT + 'src/app/desktop/DesktopApp.tsx', imports: ['shared.js'] }),
      'shared.js': chunk(['src/app/shared/viewer/Row.tsx', 'src/app/mobile/screens/Map.tsx']),
    };
    const violations = checkShellIsolation(bundle);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('src/app/mobile/screens/Map.tsx');
  });

  it('flags a desktop module in the startup graph', () => {
    const bundle = {
      'index.js': chunk(['src/app/main.tsx', 'src/app/desktop/components/Sidebar.tsx'], { isEntry: true }),
    };
    expect(checkShellIsolation(bundle)).toHaveLength(1);
  });

  it('skips a root that does not exist yet', () => {
    const bundle = {
      'index.js': chunk(['src/app/main.tsx'], { isEntry: true }),
      'DesktopApp.js': chunk(['src/app/desktop/DesktopApp.tsx'], { facadeModuleId: ROOT + 'src/app/desktop/DesktopApp.tsx' }),
    };
    expect(checkShellIsolation(bundle)).toEqual([]);
  });
});

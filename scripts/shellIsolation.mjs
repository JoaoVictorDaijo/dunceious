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
 * Build check: proves from Rollup's output metadata (each chunk's moduleIds and
 * static imports) that the startup graph holds neither UI, and that the desktop
 * and mobile graphs never contain each other's modules. Chunks shared by both
 * graphs (from src/app/shared/) are fine. A root not built yet is skipped.
 */

const AREA = { desktop: '/src/app/desktop/', mobile: '/src/app/mobile/' };
const ROOTS = { desktop: '/src/app/desktop/DesktopApp.tsx', mobile: '/src/app/mobile/MobileApp.tsx' };

function reach(bundle, starts) {
  const seen = new Set();
  const stack = [...starts];
  while (stack.length) {
    const name = stack.pop();
    const chunk = bundle[name];
    if (seen.has(name) || !chunk || chunk.type !== 'chunk') continue;
    seen.add(name);
    stack.push(...(chunk.imports ?? []));
  }
  return seen;
}

function offenders(bundle, chunkNames, forbidden) {
  const found = [];
  for (const name of chunkNames) {
    for (const id of bundle[name].moduleIds ?? []) {
      const normalized = id.replace(/\\/g, '/');
      if (forbidden.some(area => normalized.includes(area))) found.push(`${name}: ${normalized}`);
    }
  }
  return found;
}

/** @returns {string[]} one message per misplaced module; empty when isolated */
export function checkShellIsolation(bundle) {
  const chunks = Object.entries(bundle).filter(([, c]) => c.type === 'chunk');
  const rootChunk = (suffix) => chunks.find(([, c]) => (c.facadeModuleId ?? '').replace(/\\/g, '/').endsWith(suffix))?.[0];
  const violations = [];

  const entries = chunks.filter(([, c]) => c.isEntry).map(([name]) => name);
  for (const hit of offenders(bundle, reach(bundle, entries), [AREA.desktop, AREA.mobile])) {
    violations.push(`startup graph contains a UI module: ${hit}`);
  }
  for (const [shell, other] of [['desktop', 'mobile'], ['mobile', 'desktop']]) {
    const root = rootChunk(ROOTS[shell]);
    if (!root) continue;
    for (const hit of offenders(bundle, reach(bundle, [root]), [AREA[other]])) {
      violations.push(`${shell} graph contains a ${other} module: ${hit}`);
    }
  }
  return violations;
}

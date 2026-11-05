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

// Vitest global setup. pnpm scripts and `pnpm exec` already run on
// devEngines.runtime; a run started another way (`npx vitest`, a bare
// `node_modules/.bin/vitest`) uses whatever Node is on PATH. On Node 25+ that
// Node's own localStorage shadows jsdom's and storage tests fail far from here.
import { readFileSync } from 'node:fs';

export default function assertPinnedNode() {
  const { devEngines } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const expected = `v${devEngines.runtime.version}`;
  if (process.version !== expected) {
    throw new Error(
      `Tests run on Node ${expected} (devEngines.runtime in package.json), ` +
        `but this process is ${process.version} (${process.execPath}). ` +
        'Run them through a pnpm script or `pnpm exec`, which use the pinned Node.',
    );
  }
}

#!/usr/bin/env node
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


import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const DEFAULT_COUNTS = [1, 10, 30, 50];
const cliArgs = process.argv.slice(2);

const npmArgs = (() => {
  const raw = process.env.npm_config_argv;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.remain) ? parsed.remain : [];
  } catch {
    return [];
  }
})();

const counts = [...cliArgs, ...npmArgs]
  .map(value => Number.parseInt(value, 10))
  .filter(value => Number.isFinite(value) && value > 0);

const recordCounts = counts.length > 0 ? counts : DEFAULT_COUNTS;
const vitestBin = resolve('node_modules/.bin/vitest');

const result = spawnSync(vitestBin, ['run', '--config', 'bench/vitest.config.ts'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    BENCH_RECORD_COUNTS: recordCounts.join(','),
    BENCH_REPLICATES: '30',
  },
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
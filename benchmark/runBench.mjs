#!/usr/bin/env node

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

const result = spawnSync(vitestBin, ['run', '--config', 'vitest.bench.config.ts'], {
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
/**
 * Vitest configuration for the GenBank parser 2D benchmark grid.
 *
 * Run via:  npm run bench
 *
 * This config targets only files inside `benchmark/` that match
 * `*.bench.test.ts` and is intentionally separate from vite.config.ts so
 * that `npm test` stays fast and deterministic.
 */

import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    test: {
      environment: 'node',
      // Only run files inside benchmark/ that end with .bench.test.ts.
      include: ['benchmark/**/*.bench.test.ts'],
      // Pass --expose-gc to worker processes so that global.gc() is available
      // for GC-aware memory sampling (clean baseline before each measurement).
      execArgv: ['--expose-gc'],
      // Increase timeout for full benchmark grid (168 tests = 6 seqLengths × 4 recordCounts × 30 replicates)
      testTimeout: 100000,
    },
  };
});

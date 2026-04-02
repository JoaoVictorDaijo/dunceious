/**
 * Vitest configuration for the performance / benchmark suite.
 *
 * Run via:  npm run perf
 *
 * This config targets only *.bench.ts files and is intentionally separate
 * from vite.config.ts so that `npm test` (vitest run) stays fast and
 * deterministic.
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
      // Only run benchmark files.
      include: ['**/*.bench.ts'],
      // Pass --expose-gc to worker processes so that global.gc() is available
      // for GC-aware memory sampling.  Without this, the workers are spawned
      // without the flag even when the parent process receives it.
      execArgv: ['--expose-gc'],
    },
  };
});

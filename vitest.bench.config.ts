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
 * Vitest configuration for benchmark tests.
 *
 * Run via:  npm run bench
 *
 * This config targets only files inside `bench/` that match
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
      // Only run files inside bench/ that end with .bench.test.ts.
      include: ['bench/**/*.bench.test.ts'],
      // Pass --expose-gc to worker processes so that global.gc() is available
      // for GC-aware memory sampling (clean baseline before each measurement).
      execArgv: ['--expose-gc'],
      // Increase timeout for the isolated child-process benchmark grid.
      testTimeout: 300000,
    },
  };
});

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
 * Shared Vitest configuration for the perf/ (regression guardrails) and
 * bench/ (data-collection grid) suites. Each suite's vitest.config.ts spreads
 * this and adds its own `include` (and, for the grid, a longer testTimeout).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

export const sharedBenchConfig = {
  plugins: [react()],
  resolve: {
    alias: { '@': ROOT },
  },
  test: {
    environment: 'node' as const,
    // Expose global.gc() to worker processes for GC-aware memory sampling.
    execArgv: ['--expose-gc'],
  },
};

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
 * Vitest config for the performance regression guardrails.
 * Run via:  npm run perf
 */
import { defineConfig } from 'vitest/config';
import { sharedBenchConfig } from '../vitest.shared';

export default defineConfig({
  ...sharedBenchConfig,
  test: {
    ...sharedBenchConfig.test,
    include: ['perf/**/*.perf.ts'],
  },
});

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
import { degenerateToRegex } from '../src/core/search/query';
import { bench } from './perfUtils';

describe('exact query — literal gap backtracking', () => {
  it('rejects a bounded failed gap run within a generous counted-run ratio', () => {
    const target = `A${'-'.repeat(256)}G`;
    const compiled = degenerateToRegex('A---C');
    const counted = /A-{3,}C/gi;
    expect(compiled.test(target)).toBe(false);
    expect(counted.test(target)).toBe(false);
    const reference = bench(() => counted.test(target), { warmup: 1, iterations: 3 });
    const actual = bench(() => compiled.test(target), { warmup: 1, iterations: 3 });
    console.log(JSON.stringify({ query: 'A---C', gaps: 256, reference, actual }));
    // A timer-resolution floor and a wide ratio tolerate noisy hosts while
    // rejecting combinatorial redistribution of the same alignment gaps.
    expect(actual.medianMs / Math.max(reference.medianMs, 0.01)).toBeLessThan(100);
  });
});

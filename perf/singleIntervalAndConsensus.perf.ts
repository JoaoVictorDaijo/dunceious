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
import { transposeInterval } from '../src/domain/bio/coordinate';
import { calculateConsensus } from '../src/domain/bio/consensus';
import { bench, tryGC } from './perfUtils';

describe('whole-genome work avoided for small requests', () => {
  it('maps an early interval without a genome-sized buffer within a 10 ms p95 budget', () => {
    const aligned = '--AC--GT' + 'A'.repeat(10_000_000);
    // Indexed access flattens ropes before timing so allocation measures the mapper.
    expect(aligned[aligned.length - 1]).toBe('A');
    tryGC();
    const before = process.memoryUsage().arrayBuffers;
    expect(transposeInterval(0, 4, aligned)).toEqual({ start: 2, end: 8 });
    const bufferDelta = process.memoryUsage().arrayBuffers - before;
    const timing = bench(() => transposeInterval(0, 4, aligned), { warmup: 2, iterations: 5 });
    console.log('Early single interval', { ...timing, bufferDelta });
    expect(bufferDelta).toBeLessThan(1024 * 1024);
    expect(timing.p95Ms).toBeLessThan(10);
  });

  it('returns a long singleton alignment within a 25 ms p95 budget', () => {
    const aligned = 'a-CgT'.repeat(1_000_000);
    expect(aligned[aligned.length - 1]).toBe('T');
    const records = [
      { id: 'empty', name: 'empty', sequence: '', alignedSequence: '', features: [] },
      { id: 'only', name: 'only', sequence: '', alignedSequence: aligned, features: [] },
      { id: 'unaligned', name: 'unaligned', sequence: 'AAAA', features: [] },
    ];
    expect(calculateConsensus(records)).toBe(aligned);
    const timing = bench(() => calculateConsensus(records), { warmup: 1, iterations: 3 });
    console.log('Long singleton consensus', timing);
    expect(timing.p95Ms).toBeLessThan(25);
  }, 15_000);
});

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
 * Search-logic performance benchmarks.
 *
 * ## How to run
 *
 *   npm run perf           # runs with --expose-gc (GC-aware memory sampling)
 *
 * Covers three resources from services/searchLogic.ts:
 *   - reverseComplement – O(n) string reversal + complement mapping
 *   - smithWaterman     – O(n·m) affine-gap local alignment
 *   - degenerateToRegex – IUPAC-pattern regex construction + execution
 *
 * Methodology: see src/__tests__/perfUtils.ts and parseGenBank.perf.bench.ts.
 */

import { describe, it, expect } from 'vitest';
import { reverseComplement, smithWaterman, degenerateToRegex } from '../services/searchLogic';
import { bench, GC_AVAILABLE } from './perfUtils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Pseudo-random DNA generator (deterministic, no external deps). */
function makeDna(length: number, seed = 42): string {
  const bases = ['A', 'T', 'C', 'G'] as const;
  let s = seed;
  return Array.from({ length }, () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return bases[s & 3] as string;
  }).join('');
}

/** Sequence with IUPAC degenerate codes scattered throughout. */
function makeIupacQuery(length: number): string {
  const chars = ['A', 'T', 'C', 'G', 'N', 'R', 'Y', 'S', 'W', 'K', 'M'];
  let s = 7;
  return Array.from({ length }, () => {
    // 32-bit LCG (Numerical Recipes constants), same as makeDna. Keep both
    // operands < 2^53: larger 64-bit constants lose float precision and silently
    // collapse this generator to a near-degenerate distribution (and trip the
    // no-loss-of-precision lint rule).
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return chars[s % chars.length] as string;
  }).join('');
}

/** Log a benchmark result to the console for visibility in perf runs. */
function logResult(label: string, result: ReturnType<typeof bench>): void {
  const memNote = GC_AVAILABLE
    ? `  mem peak=${(result.peakHeapDeltaBytes / 1024).toFixed(1)} KB`
    : '  mem=skipped (no --expose-gc)';
  console.log(
    `[bench] ${label.padEnd(50)} ` +
    `time median=${result.medianMs.toFixed(3)} ms  p95=${result.p95Ms.toFixed(3)} ms` +
    memNote,
  );
}

// ---------------------------------------------------------------------------
// Suite A: reverseComplement – scaling with sequence length
// ---------------------------------------------------------------------------

describe('reverseComplement – scaling with sequence length', () => {
  const SEQ_LENGTHS = [100, 1_000, 10_000, 100_000] as const;

  // Pre-build inputs outside timed blocks.
  const inputs = new Map(SEQ_LENGTHS.map(len => [len, makeDna(len)]));

  // Collect results for relative comparisons.
  const results = new Map<number, ReturnType<typeof bench>>();

  for (const len of SEQ_LENGTHS) {
    it(`reverse-complements a ${len.toLocaleString()} bp sequence correctly and within time budget`, () => {
      const seq = inputs.get(len)!;

      // Correctness: applying RC twice should return the original sequence.
      const rc = reverseComplement(seq);
      expect(rc).toHaveLength(len);
      expect(reverseComplement(rc)).toBe(seq);

      // Benchmark: 50 warmup + 100 measured iterations.
      const result = bench(() => reverseComplement(seq), { warmup: 50, iterations: 100 });
      results.set(len, result);
      logResult(`reverseComplement len=${len.toLocaleString()} bp`, result);

      // Time budget: p95 must be < 2000 ms.
      expect(result.p95Ms).toBeLessThan(2000);
    });
  }

  it('reverseComplement time scales sub-quadratically with sequence length', () => {
    const r1k = results.get(1_000);
    const r100k = results.get(100_000);
    if (!r1k || !r100k) return;

    // 1 k → 100 k is a 100× input increase; allow up to 10 000× slowdown.
    const ratio = r100k.medianMs / Math.max(r1k.medianMs, 0.001);
    expect(ratio).toBeLessThan(10_000);
  });

  it('reverseComplement memory usage scales sub-linearly or linearly (GC-aware only)', () => {
    if (!GC_AVAILABLE) {
      console.log('[bench] Skipping memory scaling test — run with --expose-gc for this check.');
      return;
    }
    const r1k = results.get(1_000);
    const r100k = results.get(100_000);
    if (!r1k || !r100k) return;

    const memRatio = r100k.peakHeapDeltaBytes / Math.max(r1k.peakHeapDeltaBytes, 1);
    expect(memRatio).toBeLessThan(1_000);
  });
});

// ---------------------------------------------------------------------------
// Suite B: smithWaterman – scaling with target length
// ---------------------------------------------------------------------------

describe('smithWaterman – scaling with target length', () => {
  // A short, fixed query is aligned against increasingly long targets.
  // Smith-Waterman is O(query × target), so a fixed-length query makes the
  // complexity linear in target length for this suite.
  const QUERY = 'ATCGATCGTTAA'; // 12 bp
  const TARGET_LENGTHS = [100, 500, 2_000, 5_000] as const;

  // Pre-build target sequences outside timed blocks.
  const targets = new Map(TARGET_LENGTHS.map(len => [len, makeDna(len, 99)]));

  const results = new Map<number, ReturnType<typeof bench>>();

  for (const len of TARGET_LENGTHS) {
    it(`aligns a 12 bp query against a ${len.toLocaleString()} bp target within time budget`, () => {
      const target = targets.get(len)!;

      // Correctness: result must be an array (possibly empty).
      const hits = smithWaterman(QUERY, target);
      expect(Array.isArray(hits)).toBe(true);

      // Benchmark.
      const result = bench(() => smithWaterman(QUERY, target), { warmup: 20, iterations: 50 });
      results.set(len, result);
      logResult(`smithWaterman target_len=${len.toLocaleString()} bp`, result);

      // Loose time budget – SW on 5 k target should be well within 2 s.
      expect(result.p95Ms).toBeLessThan(2000);
    });
  }

  it('smithWaterman time scales sub-quadratically with target length', () => {
    const r100 = results.get(100);
    const r5k = results.get(5_000);
    if (!r100 || !r5k) return;

    // 100 → 5 000 bp is a 50× increase; allow up to 10 000× slowdown.
    const ratio = r5k.medianMs / Math.max(r100.medianMs, 0.001);
    expect(ratio).toBeLessThan(10_000);
  });
});

// ---------------------------------------------------------------------------
// Suite C: degenerateToRegex – IUPAC pattern matching against long targets
// ---------------------------------------------------------------------------

describe('degenerateToRegex – scaling with target length', () => {
  // A short IUPAC degenerate query matched against increasingly long targets.
  const IUPAC_QUERY = makeIupacQuery(10); // 10-character mixed IUPAC query
  const TARGET_LENGTHS = [1_000, 10_000, 100_000] as const;

  const targets = new Map(TARGET_LENGTHS.map(len => [len, makeDna(len, 13)]));

  const results = new Map<number, ReturnType<typeof bench>>();

  for (const len of TARGET_LENGTHS) {
    it(`matches a 10-char IUPAC query against a ${len.toLocaleString()} bp target within time budget`, () => {
      const target = targets.get(len)!;

      // Correctness: degenerateToRegex must return a RegExp.
      const re = degenerateToRegex(IUPAC_QUERY);
      expect(re).toBeInstanceOf(RegExp);

      // Benchmark: includes both regex construction and execution.
      const result = bench(() => {
        const pattern = degenerateToRegex(IUPAC_QUERY);
        target.match(pattern);
      }, { warmup: 50, iterations: 100 });
      results.set(len, result);
      logResult(`degenerateToRegex target_len=${len.toLocaleString()} bp`, result);

      expect(result.p95Ms).toBeLessThan(2000);
    });
  }

  it('degenerateToRegex time scales sub-quadratically with target length', () => {
    const r1k = results.get(1_000);
    const r100k = results.get(100_000);
    if (!r1k || !r100k) return;

    // 1 k → 100 k is a 100× increase; allow up to 10 000× slowdown.
    const ratio = r100k.medianMs / Math.max(r1k.medianMs, 0.001);
    expect(ratio).toBeLessThan(10_000);
  });
});

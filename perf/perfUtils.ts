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
 * Lightweight benchmark utility for Vitest-based performance tests.
 *
 * ## Why memory measurement is tricky in Node/V8
 *
 * `process.memoryUsage().heapUsed` reports the live heap *after* V8's last
 * mark phase, but a GC can fire at any moment — including between our "before"
 * and "after" samples.  This produces:
 *   - Negative heap deltas (GC ran near the end, heap shrank).
 *   - Super-large positive deltas (no GC, many allocations accumulated).
 *
 * Mitigation strategy used here:
 *   1. If `global.gc` is available (Node started with `--expose-gc`) call it
 *      before taking the "before" snapshot to drain transient garbage first.
 *   2. Run warmup iterations so JIT/inline-caches are hot before measuring.
 *   3. Repeat the measurement N times and report the median and p95 —
 *      a single-run number is almost always noise.
 *   4. Assert *relative* thresholds (e.g. "500 k-bp parse should not allocate
 *      more than K× a 100 bp parse") rather than absolute byte counts.
 *
 * Even with all these measures, heap-delta measurements remain an
 * approximation.  Treat them as regression guardrails, not precise accounting.
 */

/** Whether `--expose-gc` was passed to the Node process. */
export const GC_AVAILABLE = typeof (globalThis as Record<string, unknown>).gc === 'function';

/** Call `global.gc()` if available, otherwise no-op. */
export function tryGC(): void {
  if (GC_AVAILABLE) {
    (globalThis as unknown as { gc(): void }).gc();
  }
}

export interface BenchResult {
  /** Median wall-clock duration in milliseconds across measured iterations. */
  medianMs: number;
  /** 95th-percentile wall-clock duration in milliseconds. */
  p95Ms: number;
  /**
   * Peak heap-used delta in bytes: the maximum `heapUsed` observed after any
   * iteration minus the GC-cleaned baseline taken before the measurement loop.
   * Only meaningful when GC_AVAILABLE — noted in individual test assertions.
   */
  peakHeapDeltaBytes: number;
  /** Number of measured iterations actually used for statistics. */
  iterations: number;
}

export interface BenchOptions {
  /** Unmeasured warm-up iterations (default 50). */
  warmup?: number;
  /** Measured iterations to collect statistics over (default 100). */
  iterations?: number;
}

/**
 * Run `fn` with warmup and repeated measurements, returning timing/memory
 * statistics.
 *
 * @param fn     The function under test.  It must be synchronous.
 * @param opts   Warmup/iteration counts.
 */
export function bench(fn: () => unknown, opts: BenchOptions = {}): BenchResult {
  const warmup = opts.warmup ?? 50;
  const iters = opts.iterations ?? 100;

  // --- Warmup (unmeasured) ---
  for (let i = 0; i < warmup; i++) {
    fn();
  }

  // --- Establish a GC-cleaned baseline before measuring ---
  tryGC();
  const baselineHeap = process.memoryUsage().heapUsed;

  // --- Measured iterations ---
  const durations: number[] = [];
  let maxHeapUsed = 0;

  for (let i = 0; i < iters; i++) {
    // Attempt to reduce GC noise before each sample.  When GC is not exposed
    // the tryGC() call is a no-op, so we still measure — just with more noise.
    tryGC();

    const t0 = performance.now();
    fn();
    const t1 = performance.now();
    const heapAfter = process.memoryUsage().heapUsed;

    durations.push(t1 - t0);
    maxHeapUsed = Math.max(maxHeapUsed, heapAfter);
  }

  return {
    medianMs: median(durations),
    p95Ms: percentile(durations, 95),
    peakHeapDeltaBytes: maxHeapUsed - baselineHeap,
    iterations: iters,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)] as number;
}

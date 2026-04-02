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
   * Median heap-used delta in bytes.
   * Only meaningful when GC_AVAILABLE — noted in individual test assertions.
   */
  medianHeapBytes: number;
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

  // --- Measured iterations ---
  const durations: number[] = [];
  const heapDeltas: number[] = [];

  for (let i = 0; i < iters; i++) {
    // Attempt to reduce GC noise before each sample.  When GC is not exposed
    // the tryGC() call is a no-op, so we still measure — just with more noise.
    tryGC();

    const heapBefore = process.memoryUsage().heapUsed;
    const t0 = performance.now();
    fn();
    const t1 = performance.now();
    const heapAfter = process.memoryUsage().heapUsed;

    durations.push(t1 - t0);
    heapDeltas.push(heapAfter - heapBefore);
  }

  return {
    medianMs: median(durations),
    p95Ms: percentile(durations, 95),
    medianHeapBytes: median(heapDeltas),
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

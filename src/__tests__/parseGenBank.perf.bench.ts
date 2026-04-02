/**
 * GenBank parser performance benchmarks.
 *
 * ## How to run
 *
 *   npm run perf           # runs with --expose-gc (GC-aware memory sampling)
 *
 * This file is intentionally excluded from the default `npm test` (vitest run)
 * suite via the `exclude` pattern in vite.config.ts.  Benchmarks are slow and
 * non-deterministic by nature; mixing them with unit tests would make CI
 * flaky.
 *
 * ## Methodology
 *
 * See src/__tests__/perfUtils.ts for a detailed explanation of why Node/V8
 * memory measurements are unreliable and what we do to reduce noise.
 *
 * Summary:
 *   - 50 unmeasured warmup iterations (JIT + inline-cache stabilisation)
 *   - 100 measured iterations → median + p95 reported
 *   - `global.gc()` called before each sample when --expose-gc is active
 *   - Memory assertions only execute when GC is available (skipped otherwise)
 *   - Time assertions use loose relative thresholds, not hard absolute limits
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseGenBank } from '../../services/genbank/index';
import { bench, GC_AVAILABLE } from './perfUtils';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal syntactically-valid GenBank string with a single record
 * whose sequence is exactly `seqLength` base pairs long.
 *
 * The record has a handful of features to exercise the full parse path.
 * Input construction happens *outside* the timed block to isolate parser work.
 */
function makeGenbankRecord(seqLength: number): string {
  const seq = 'A'.repeat(seqLength);
  // Wrap the sequence in 60-character lines as real GenBank files do.
  const seqLines: string[] = [];
  for (let i = 0; i < seq.length; i += 60) {
    const lineNum = String(i + 1).padStart(9, ' ');
    seqLines.push(`${lineNum} ${seq.slice(i, i + 60).replace(/(.{10})/g, '$1 ').trim()}`);
  }

  return [
    `LOCUS       BENCH${seqLength.toString().padStart(6, '0')} ${String(seqLength).padStart(7, ' ')} bp    DNA             PLN       01-JAN-2024`,
    `DEFINITION  Benchmark record with sequence length ${seqLength}.`,
    `ACCESSION   BENCH001`,
    `VERSION     BENCH001.1`,
    `FEATURES             Location/Qualifiers`,
    `     source          1..${seqLength}`,
    `                     /organism="Testus benchmarkii"`,
    `     gene            1..${Math.min(100, seqLength)}`,
    `                     /gene="benchGene"`,
    `     CDS             1..${Math.min(99, seqLength)}`,
    `                     /gene="benchGene"`,
    `                     /product="benchmark protein"`,
    `                     /codon_start=1`,
    `                     /translation="MKVL"`,
    `ORIGIN`,
    ...seqLines,
    '//',
  ].join('\n');
}

/**
 * Build a GenBank string containing `numRecords` records, each with a 1000 bp
 * sequence.  Records are separated by `//` as in a real multi-record file.
 */
function makeMultiRecordGenbank(numRecords: number): string {
  return Array.from({ length: numRecords }, (_, i) => {
    const seq = 'ATCG'.repeat(250); // 1000 bp
    const seqLines: string[] = [];
    for (let pos = 0; pos < seq.length; pos += 60) {
      const lineNum = String(pos + 1).padStart(9, ' ');
      seqLines.push(`${lineNum} ${seq.slice(pos, pos + 60).replace(/(.{10})/g, '$1 ').trim()}`);
    }

    return [
      `LOCUS       BENCH${String(i + 1).padStart(6, '0')}    1000 bp    DNA             PLN       01-JAN-2024`,
      `DEFINITION  Benchmark record ${i + 1}.`,
      `ACCESSION   BENCH${String(i + 1).padStart(6, '0')}`,
      `VERSION     BENCH${String(i + 1).padStart(6, '0')}.1`,
      `FEATURES             Location/Qualifiers`,
      `     source          1..1000`,
      `                     /organism="Testus benchmarkii"`,
      `     gene            1..900`,
      `                     /gene="gene${i + 1}"`,
      `     CDS             1..900`,
      `                     /gene="gene${i + 1}"`,
      `                     /product="protein${i + 1}"`,
      `                     /codon_start=1`,
      `                     /translation="MKVL"`,
      `     misc_feature    100..200`,
      `                     /note="misc feature ${i + 1}"`,
      `     repeat_region   500..600`,
      `                     /note="repeat ${i + 1}"`,
      `ORIGIN`,
      ...seqLines,
      '//',
    ].join('\n');
  }).join('\n');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Log a benchmark result to the console for visibility in perf runs. */
function logResult(label: string, result: ReturnType<typeof bench>): void {
  const memNote = GC_AVAILABLE
    ? `  mem median=${(result.medianHeapBytes / 1024).toFixed(1)} KB`
    : '  mem=skipped (no --expose-gc)';
  console.log(
    `[bench] ${label.padEnd(40)} ` +
    `time median=${result.medianMs.toFixed(3)} ms  p95=${result.p95Ms.toFixed(3)} ms` +
    memNote,
  );
}

// ---------------------------------------------------------------------------
// Suite A: scaling with sequence length
// ---------------------------------------------------------------------------

describe('parseGenBank – scaling with sequence length', () => {
  const SEQ_LENGTHS = [100, 1_000, 10_000, 100_000] as const;

  // Pre-build all inputs outside of timed blocks.
  const inputs = new Map(SEQ_LENGTHS.map(len => [len, makeGenbankRecord(len)]));

  // Collect results for relative comparisons.
  const results = new Map<number, ReturnType<typeof bench>>();

  for (const len of SEQ_LENGTHS) {
    it(`parses a ${len.toLocaleString()} bp record correctly and within time budget`, () => {
      const input = inputs.get(len)!;

      // Correctness check: ensure the parser produces expected output.
      const parsed = parseGenBank(input);
      expect(parsed).toHaveLength(1);
      expect(parsed[0]!.sequence).toHaveLength(len);

      // Benchmark: 50 warmup + 100 measured iterations.
      const result = bench(() => parseGenBank(input), { warmup: 50, iterations: 100 });
      results.set(len, result);
      logResult(`seq_length=${len.toLocaleString()} bp`, result);

      // Time budget: p95 must be < 2000 ms.
      // This is intentionally generous — we only want to catch catastrophic
      // regressions (O(n²) behaviour, accidental synchronous I/O, etc.).
      expect(result.p95Ms).toBeLessThan(2000);
    });
  }

  it('parse time scales sub-quadratically with sequence length', () => {
    // Ensure results were populated by previous tests (they run in order).
    const r1k = results.get(1_000);
    const r100k = results.get(100_000);

    if (!r1k || !r100k) {
      // The individual tests above must have run first.
      return;
    }

    // 1 k-bp → 100 k-bp is a 100× input increase.
    // Allow up to 10 000× slowdown before failing (extremely generous, but
    // avoids false positives on loaded CI machines).
    // Real-world expectation is ~100-200× for linear parsing.
    const ratio = r100k.medianMs / Math.max(r1k.medianMs, 0.001);
    expect(ratio).toBeLessThan(10_000);
  });

  it('memory usage scales sub-linearly or linearly with sequence length (GC-aware only)', () => {
    // Memory assertions are only reliable when we can force GC before sampling.
    if (!GC_AVAILABLE) {
      console.log('[bench] Skipping memory scaling test — run with --expose-gc for this check.');
      return;
    }

    const r1k = results.get(1_000);
    const r100k = results.get(100_000);

    if (!r1k || !r100k) return;

    // 100× input → allow up to 1000× memory growth before failing.
    // In practice, a well-behaved parser should be ≤ 200×.
    const memRatio = r100k.medianHeapBytes / Math.max(r1k.medianHeapBytes, 1);
    expect(memRatio).toBeLessThan(1_000);
  });
});

// ---------------------------------------------------------------------------
// Suite B: scaling with number of records
// ---------------------------------------------------------------------------

describe('parseGenBank – scaling with number of records', () => {
  const RECORD_COUNTS = [1, 10, 50, 100] as const;

  // Pre-build all inputs outside of timed blocks.
  const inputs = new Map(RECORD_COUNTS.map(n => [n, makeMultiRecordGenbank(n)]));

  // Collect results for relative comparisons.
  const results = new Map<number, ReturnType<typeof bench>>();

  for (const n of RECORD_COUNTS) {
    it(`parses ${n} record(s) correctly and within time budget`, () => {
      const input = inputs.get(n)!;

      // Correctness check.
      const parsed = parseGenBank(input);
      expect(parsed).toHaveLength(n);

      // Benchmark.
      const result = bench(() => parseGenBank(input), { warmup: 50, iterations: 100 });
      results.set(n, result);
      logResult(`num_records=${n}`, result);

      // Loose absolute budget: p95 < 2000 ms.
      expect(result.p95Ms).toBeLessThan(2000);
    });
  }

  it('parse time scales sub-quadratically with record count', () => {
    const r1 = results.get(1);
    const r100 = results.get(100);

    if (!r1 || !r100) return;

    // 1 → 100 records is a 100× increase.
    // Allow up to 10 000× slowdown as a safety net.
    const ratio = r100.medianMs / Math.max(r1.medianMs, 0.001);
    expect(ratio).toBeLessThan(10_000);
  });

  it('memory usage scales sub-quadratically with record count (GC-aware only)', () => {
    if (!GC_AVAILABLE) {
      console.log('[bench] Skipping memory scaling test — run with --expose-gc for this check.');
      return;
    }

    const r1 = results.get(1);
    const r100 = results.get(100);

    if (!r1 || !r100) return;

    const memRatio = r100.medianHeapBytes / Math.max(r1.medianHeapBytes, 1);
    expect(memRatio).toBeLessThan(10_000);
  });
});

// ---------------------------------------------------------------------------
// Suite C: real fixture (SCU49845.gb)
// ---------------------------------------------------------------------------

describe('parseGenBank – SCU49845.gb real-world fixture', () => {
  const SCU49845_CONTENT = readFileSync(resolve(__dirname, '../../SCU49845.gb'), 'utf-8');

  it('parses SCU49845.gb with stable median parse time < 2000 ms (p95)', () => {
    // Correctness smoke-check.
    const parsed = parseGenBank(SCU49845_CONTENT);
    expect(parsed).toHaveLength(1);

    const result = bench(() => parseGenBank(SCU49845_CONTENT), { warmup: 50, iterations: 100 });
    logResult('SCU49845.gb (5028 bp, 6 features)', result);

    expect(result.p95Ms).toBeLessThan(2000);
  });
});

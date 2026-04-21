/**
 * GenBank parser benchmarks.
 *
 * Measures wall-clock time and memory usage of `parseGenBank` across a 2D
 * grid of inputs:
 *
 *   - seqLength_bp ∈ [5 000, 10 000, 50 000, 100 000, 200 000, 300 000]
 *   - numRecords   ∈ [1, 10, 30, 50]
 *
 * Each cell is run `ITERATIONS` times and reduced to:
 *   - `durationMs`      – median wall-clock across iterations.
 *   - `heapDeltaBytes`  – peak `heapUsed` observed after any iteration minus
 *                         a GC-cleaned baseline taken once before the loop.
 *                         GC is drained before each iteration so each sample
 *                         reflects what the parse actually allocated.
 *   - `rssDeltaBytes`   – peak `process.memoryUsage().rss` observed after any
 *                         iteration minus the same GC-cleaned baseline.
 *                         Clamped ≥ 0. Each cell is measured independently so
 *                         cells are directly comparable.
 *
 * Each test asserts basic correctness (records parsed = numRecords, features
 * parsed > 0) so the suite fails loudly if the parser breaks.  Performance
 * numbers are never compared against hard thresholds – they are written as
 * JSON to `benchmark/results/benchmark.json` at the end of the run.
 *
 * Run with:
 *   npm run bench
 */

import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { parseGenBank } from '../services/genbank/index';
import { makeMultiRecord } from './syntheticGenbank';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(__dirname, 'results');
const FIXTURES_DIR = join(__dirname, 'fixtures');
const PLOTS_DIR = join(__dirname, 'plots');

// ── Result schema ─────────────────────────────────────────────────────────────

interface BenchmarkEntry {
  modality: 'grid';

  /** Sequence length in base pairs for every record in this input. */
  seqLength_bp: number;
  /** Number of GenBank records in this input. */
  numRecords: number;

  /** Median wall-clock parse time in milliseconds across `ITERATIONS` runs. */
  durationMs: number;
  /**
   * Peak `heapUsed` observed after any iteration minus a GC-cleaned baseline
   * taken before the loop, in bytes. Bounded ≥ 0 in practice since GC runs
   * before each iteration establish a consistent low-water reference.
   */
  heapDeltaBytes: number;
  /**
   * Peak `process.memoryUsage().rss` across iterations minus a GC-cleaned
   * baseline, in bytes. Clamped ≥ 0. Sampled after each parse, so transient
   * intra-call peaks released before return are not observed — acceptable
   * for the parser, where allocated records are retained until return.
   * Each cell is measured independently from its own baseline.
   */
  rssDeltaBytes: number;

  /** Number of SeqRecord objects returned by the parser. */
  recordsParsed: number;
  /** Total number of BioFeature objects across all records. */
  featuresParsed: number;
}

const entries: BenchmarkEntry[] = [];

// ── Fixtures directory ────────────────────────────────────────────────────────

beforeAll(() => {
  mkdirSync(FIXTURES_DIR, { recursive: true });
});

// ── measurement helper ────────────────────────────────────────────────────────

/** Measured iterations per cell. Median duration + peak memory across runs. */
const ITERATIONS = 5;

function tryGC(): void {
  const g = (globalThis as Record<string, unknown>).gc;
  if (typeof g === 'function') (g as () => void)();
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

function measure(content: string): Omit<BenchmarkEntry, 'modality' | 'seqLength_bp' | 'numRecords'> {
  tryGC();
  const memBaseline = process.memoryUsage();
  const baselineHeap = memBaseline.heapUsed;
  const baselineRss = memBaseline.rss;

  const durations: number[] = [];
  let peakHeap = baselineHeap;
  let peakRss = baselineRss;
  let records: ReturnType<typeof parseGenBank> = [];

  for (let i = 0; i < ITERATIONS; i++) {
    // Drain transient garbage before each sample so post-parse heap/rss
    // reflect what this iteration allocated, not cruft from the last one.
    tryGC();

    const t0 = performance.now();
    records = parseGenBank(content);
    durations.push(performance.now() - t0);

    const memAfter = process.memoryUsage();
    peakHeap = Math.max(peakHeap, memAfter.heapUsed);
    peakRss = Math.max(peakRss, memAfter.rss);
  }

  const featuresParsed = records.reduce((sum, r) => sum + r.features.length, 0);

  return {
    durationMs: median(durations),
    heapDeltaBytes: Math.max(0, peakHeap - baselineHeap),
    rssDeltaBytes: Math.max(0, peakRss - baselineRss),
    recordsParsed: records.length,
    featuresParsed,
  };
}

// ── Grid: sequence length × number of records ─────────────────────────────────

/** Sequence lengths to sweep (in base pairs). */
const SEQ_LENGTHS = [5_000, 10_000, 50_000, 100_000, 200_000, 300_000];

/** Record counts to sweep (records per input). */
const RECORD_COUNTS = [1, 10, 30, 50];

describe('benchmark – grid: seq length × number of records', () => {
  for (const seqLengthBp of SEQ_LENGTHS) {
    for (const numRecords of RECORD_COUNTS) {
      it(`parses ${numRecords} record${numRecords === 1 ? '' : 's'} of ${seqLengthBp.toLocaleString()} bp each`, () => {
        const content = makeMultiRecord(numRecords, seqLengthBp);
        writeFileSync(join(FIXTURES_DIR, `seq${seqLengthBp}_rec${numRecords}.gb`), content);
        const result = measure(content);

        entries.push({
          modality: 'grid',
          seqLength_bp: seqLengthBp,
          numRecords,
          ...result,
        });

        // Correctness assertions – the benchmark should also test the parser.
        expect(result.recordsParsed).toBe(numRecords);
        expect(result.featuresParsed).toBeGreaterThan(0);
      });
    }
  }
});

// ── Write results ─────────────────────────────────────────────────────────────

afterAll(async () => {
  mkdirSync(RESULTS_DIR, { recursive: true });

  const output = {
    generatedAt: new Date().toISOString(),
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    modalities: {
      grid: {
        description: 'Parse time / memory vs. (seqLength_bp, numRecords)',
        seqLength_bp: SEQ_LENGTHS,
        numRecords: RECORD_COUNTS,
      },
    },
    results: entries,
  };

  const resultsPath = join(RESULTS_DIR, 'benchmark.json');
  writeFileSync(resultsPath, JSON.stringify(output, null, 2));

  // Refresh SVG tables & charts in benchmark/plots/. Failures here must not
  // break the bench run – the JSON above is the source of truth.
  try {
    const { generatePlots } = (await import('./visualize.mjs')) as {
      generatePlots: (opts?: { resultsPath?: string; outDir?: string }) => void;
    };
    generatePlots({ resultsPath, outDir: PLOTS_DIR });
  } catch (err) {
    console.error('benchmark: failed to generate plots:', err);
  }
});

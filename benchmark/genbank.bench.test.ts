/**
 * GenBank parser benchmarks.
 *
 * Measures wall-clock time and memory usage of `parseGenBank` across a 2D
 * grid of inputs:
 *
 *   - seqLength_bp ∈ [1 000, 3 000, 5 000, 10 000, 200 000]
 *   - numRecords   ∈ [1, 10, 30, 50]
 *
 * Two memory metrics are collected per cell:
 *   - `heapDeltaBytes`  – JS heap delta (noisy when GC runs between samples).
 *   - `rssDeltaBytes`   – Resident-set-size delta; includes heap + native
 *                         overhead and is closer to "hardware RAM used".
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

  /** Wall-clock parse time in milliseconds. */
  durationMs: number;
  /**
   * Approximate heap growth during parsing in bytes.
   * May be negative when GC runs between measurements – treat as indicative.
   */
  heapDeltaBytes: number;
  /**
   * RSS (resident set size) delta during parsing in bytes.
   * Includes heap + native overhead; closer to "hardware RAM used by process"
   * than heapUsed alone.
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

function measure(content: string): Omit<BenchmarkEntry, 'modality' | 'seqLength_bp' | 'numRecords'> {
  // Force GC to establish a clean baseline (available via --expose-gc).
  if (typeof (globalThis as Record<string, unknown>).gc === 'function') {
    (globalThis as unknown as { gc(): void }).gc();
  }

  const memBefore = process.memoryUsage();
  const heapBefore = memBefore.heapUsed;
  const rssBefore = memBefore.rss;

  const t0 = performance.now();
  const records = parseGenBank(content);
  const durationMs = performance.now() - t0;

  const memAfter = process.memoryUsage();
  const heapDeltaBytes = memAfter.heapUsed - heapBefore;
  const rssDeltaBytes = memAfter.rss - rssBefore;

  const featuresParsed = records.reduce((sum, r) => sum + r.features.length, 0);
  return { durationMs, heapDeltaBytes, rssDeltaBytes, recordsParsed: records.length, featuresParsed };
}

// ── Grid: sequence length × number of records ─────────────────────────────────

/** Sequence lengths to sweep (in base pairs). */
const SEQ_LENGTHS = [1_000, 3_000, 5_000, 10_000, 200_000];

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

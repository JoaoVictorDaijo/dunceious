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
 * GenBank parser benchmarks.
 *
 * Measures wall-clock time and memory usage of `parseGenBank` across a 2D
 * grid of inputs:
 *
 *   - seqLength_bp ∈ [5 000, 10 000, 50 000, 100 000, 200 000, 300 000]
 *   - numRecords   ∈ [1, 10, 30, 50] by default, or a custom list passed via
 *                   `npm run bench 1 10 30 50 100`
 *
 * Each cell is run `REPLICATES` times and reduced to mean / standard error.
 * Raw samples are also persisted so the plotter can render uncertainty.
 *
 * Each test asserts basic correctness (records parsed = numRecords, features
 * parsed > 0) so the suite fails loudly if the parser breaks.  Performance
 * numbers are never compared against hard thresholds – they are written as
 * JSON to `bench/results/benchmark.json` at the end of the run.
 *
 * Run with:
 *   npm run bench
 */

import { describe, it, afterAll, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(__dirname, 'results');
const PLOTS_DIR = join(__dirname, 'plots');
const TSX_BIN = process.platform === 'win32'
  ? resolve('node_modules/.bin/tsx.cmd')
  : resolve('node_modules/.bin/tsx');
const MEASURE_HELPER = join(__dirname, 'measureGenBank.ts');

// ── Result schema ─────────────────────────────────────────────────────────────

interface BenchmarkEntry {
  modality: 'grid';

  /** Sequence length in base pairs for every record in this input. */
  seqLength_bp: number;
  /** Number of GenBank records in this input. */
  numRecords: number;

  replicates: BenchmarkSample[];

  durationMs: MetricSummary;
  heapDeltaBytes: MetricSummary;
  rssDeltaBytes: MetricSummary;
  recordsParsed: MetricSummary;
  featuresParsed: MetricSummary;
}

interface BenchmarkSample {
  durationMs: number;
  heapDeltaBytes: number;
  rssDeltaBytes: number;
  recordsParsed: number;
  featuresParsed: number;
}

interface MetricSummary {
  mean: number;
  stderr: number;
  samples: number[];
}

const entries: BenchmarkEntry[] = [];

const DEFAULT_RECORD_COUNTS = [1, 10, 30, 50];
const RECORD_COUNTS = (() => {
  const parsed = (process.env.BENCH_RECORD_COUNTS ?? '')
    .split(',')
    .map(value => Number.parseInt(value, 10))
    .filter(value => Number.isFinite(value) && value > 0);
  return parsed.length > 0 ? parsed : DEFAULT_RECORD_COUNTS;
})();
const REPLICATES = Math.max(1, Number.parseInt(process.env.BENCH_REPLICATES ?? '30', 10) || 30);

// ── Fixtures directory ────────────────────────────────────────────────────────

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stddev(values: number[]): number {
  if (values.length <= 1) return 0;
  const avg = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function stderr(values: number[]): number {
  return stddev(values) / Math.sqrt(values.length);
}

function summarize(values: number[]): MetricSummary {
  return {
    mean: mean(values),
    stderr: stderr(values),
    samples: values,
  };
}

function measureInChildProcess(seqLengthBp: number, numRecords: number, replicateIndex: number): BenchmarkSample {
  const result = spawnSync(TSX_BIN, [MEASURE_HELPER], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --expose-gc`.trim(),
      BENCH_SEQ_LENGTH_BP: String(seqLengthBp),
      BENCH_NUM_RECORDS: String(numRecords),
      BENCH_REPLICATE_INDEX: String(replicateIndex),
    },
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`benchmark child process failed (${result.status}): ${result.stderr.trim() || result.stdout.trim() || 'no output'}`);
  }

  const payload = JSON.parse(result.stdout.trim()) as BenchmarkSample;
  if (
    typeof payload.durationMs !== 'number'
    || typeof payload.heapDeltaBytes !== 'number'
    || typeof payload.rssDeltaBytes !== 'number'
    || typeof payload.recordsParsed !== 'number'
    || typeof payload.featuresParsed !== 'number'
  ) {
    throw new Error(`benchmark child returned an invalid sample: ${result.stdout.trim()}`);
  }

  return payload;
}

// ── Grid: sequence length × number of records ─────────────────────────────────

/** Sequence lengths to sweep (in base pairs). */
const SEQ_LENGTHS = [5_000, 10_000, 50_000, 100_000, 200_000, 300_000];

/** Record counts to sweep (records per input). */
describe('benchmark – grid: seq length × number of records', () => {
  for (const seqLengthBp of SEQ_LENGTHS) {
    for (const numRecords of RECORD_COUNTS) {
      it(`parses ${numRecords} record${numRecords === 1 ? '' : 's'} of ${seqLengthBp.toLocaleString()} bp each`, () => {
        const replicates = Array.from({ length: REPLICATES }, (_, replicateIndex) => {
          const result = measureInChildProcess(seqLengthBp, numRecords, replicateIndex);

          expect(result.recordsParsed).toBe(numRecords);
          expect(result.featuresParsed).toBeGreaterThan(0);

          return result;
        });

        entries.push({
          modality: 'grid',
          seqLength_bp: seqLengthBp,
          numRecords,
          replicates,
          durationMs: summarize(replicates.map(r => r.durationMs)),
          heapDeltaBytes: summarize(replicates.map(r => r.heapDeltaBytes)),
          rssDeltaBytes: summarize(replicates.map(r => r.rssDeltaBytes)),
          recordsParsed: summarize(replicates.map(r => r.recordsParsed)),
          featuresParsed: summarize(replicates.map(r => r.featuresParsed)),
        });
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
        description: 'Mean parse time / memory vs. (seqLength_bp, numRecords) with standard error from repeated runs',
        seqLength_bp: SEQ_LENGTHS,
        numRecords: RECORD_COUNTS,
        replicates: REPLICATES,
      },
    },
    results: entries,
  };

  const resultsPath = join(RESULTS_DIR, 'benchmark.json');
  writeFileSync(resultsPath, JSON.stringify(output, null, 2));

  // Refresh SVG tables & charts in bench/plots/. Failures here must not
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

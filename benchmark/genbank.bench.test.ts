/**
 * GenBank parser benchmarks.
 *
 * Measures wall-clock time and heap-memory usage of `parseGenBank` across two
 * independent modalities:
 *
 *   1. **Sequence length**  – one record whose sequence grows from 100 bp to
 *      500 000 bp (number of records is fixed at 1).
 *   2. **Number of records** – a fixed sequence length of 1 000 bp while the
 *      number of records grows from 1 to 500.
 *
 * Each test asserts basic correctness (records parsed ≥ 1) so the suite
 * fails loudly if the parser breaks.  Performance numbers are never compared
 * against hard thresholds – they are written as JSON to
 * `benchmark/results/benchmark.json` at the end of the run.
 *
 * Run with:
 *   npm run bench
 */

import { describe, it, afterAll, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { parseGenBank } from '../services/genbank/index';
import { makeRecord, makeMultiRecord } from './syntheticGenbank';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(__dirname, 'results');

// ── result accumulator ───────────────────────────────────────────────────────

interface BenchmarkEntry {
  modality: 'sequence_length' | 'num_records';
  /** Human-readable name of the swept parameter. */
  parameter: string;
  /** Value of the swept parameter for this data point. */
  paramValue: number;
  /** Wall-clock parse time in milliseconds. */
  durationMs: number;
  /**
   * Approximate heap growth during parsing in bytes.
   * May be negative when GC runs between measurements – treat as indicative.
   */
  heapDeltaBytes: number;
  /** Number of SeqRecord objects returned by the parser. */
  recordsParsed: number;
  /** Total number of BioFeature objects across all records. */
  featuresParsed: number;
}

const entries: BenchmarkEntry[] = [];

// ── measurement helper ───────────────────────────────────────────────────────

function measure(content: string): Omit<BenchmarkEntry, 'modality' | 'parameter' | 'paramValue'> {
  const heapBefore = process.memoryUsage().heapUsed;
  const t0 = performance.now();
  const records = parseGenBank(content);
  const durationMs = performance.now() - t0;
  const heapDeltaBytes = process.memoryUsage().heapUsed - heapBefore;
  const featuresParsed = records.reduce((sum, r) => sum + r.features.length, 0);
  return { durationMs, heapDeltaBytes, recordsParsed: records.length, featuresParsed };
}

// ── Modality 1: sequence length ───────────────────────────────────────────────

/** Sequence lengths to sweep (in base pairs). */
const SEQ_LENGTHS = [100, 1_000, 10_000, 100_000, 500_000];

describe('benchmark – modality 1: sequence length', () => {
  for (const seqLength of SEQ_LENGTHS) {
    it(`parses 1 record of ${seqLength.toLocaleString()} bp`, () => {
      const content = makeRecord({ id: 'SYN00001', seqLength });
      const result = measure(content);

      entries.push({
        modality: 'sequence_length',
        parameter: 'seqLength_bp',
        paramValue: seqLength,
        ...result,
      });

      // Correctness assertions – the benchmark should also test the parser.
      expect(result.recordsParsed).toBe(1);
      expect(result.featuresParsed).toBeGreaterThan(0);
    });
  }
});

// ── Modality 2: number of records ────────────────────────────────────────────

/** Record counts to sweep (all records are 1 000 bp long). */
const RECORD_COUNTS = [1, 10, 50, 100, 500];

/** Fixed sequence length for the number-of-records modality. */
const FIXED_SEQ_LENGTH = 1_000;

describe('benchmark – modality 2: number of records', () => {
  for (const numRecords of RECORD_COUNTS) {
    it(`parses ${numRecords} record${numRecords === 1 ? '' : 's'} of ${FIXED_SEQ_LENGTH.toLocaleString()} bp each`, () => {
      const content = makeMultiRecord(numRecords, FIXED_SEQ_LENGTH);
      const result = measure(content);

      entries.push({
        modality: 'num_records',
        parameter: 'numRecords',
        paramValue: numRecords,
        ...result,
      });

      expect(result.recordsParsed).toBe(numRecords);
      expect(result.featuresParsed).toBeGreaterThan(0);
    });
  }
});

// ── Write results ─────────────────────────────────────────────────────────────

afterAll(() => {
  mkdirSync(RESULTS_DIR, { recursive: true });

  const output = {
    generatedAt: new Date().toISOString(),
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    modalities: {
      sequence_length: {
        description: 'Parse time / memory vs. sequence length (1 record, variable bp)',
        parameterName: 'seqLength_bp',
        parameterValues: SEQ_LENGTHS,
      },
      num_records: {
        description: `Parse time / memory vs. number of records (${FIXED_SEQ_LENGTH} bp each)`,
        parameterName: 'numRecords',
        parameterValues: RECORD_COUNTS,
      },
    },
    results: entries,
  };

  writeFileSync(join(RESULTS_DIR, 'benchmark.json'), JSON.stringify(output, null, 2));
});

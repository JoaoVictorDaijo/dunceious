/*
 * Benchmark replicate worker.
 *
 * This script runs a single GenBank parse in its own Node process so heap
 * measurements do not inherit state from previous replicates.
 */

import { parseGenBank } from '../services/genbank/index';
import { makeMultiRecord } from './syntheticGenbank';

type BenchmarkSample = {
  durationMs: number;
  heapDeltaBytes: number;
  rssDeltaBytes: number;
  recordsParsed: number;
  featuresParsed: number;
};

function tryGC(): void {
  const g = (globalThis as Record<string, unknown>).gc;
  if (typeof g === 'function') (g as () => void)();
}

function readInt(name: string): number {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Missing or invalid ${name}`);
  }
  return value;
}

const seqLengthBp = readInt('BENCH_SEQ_LENGTH_BP');
const numRecords = readInt('BENCH_NUM_RECORDS');
const replicateIndex = Number.parseInt(process.env.BENCH_REPLICATE_INDEX ?? '0', 10) || 0;

const content = makeMultiRecord(numRecords, seqLengthBp, replicateIndex);

tryGC();
const memBaseline = process.memoryUsage();
const baselineHeap = memBaseline.heapUsed;
const baselineRss = memBaseline.rss;

// Drain transient garbage so the sample reflects the parse we are about to
// measure, not allocation debris from any startup work in this child process.
tryGC();

const t0 = performance.now();
const records = parseGenBank(content);
const durationMs = performance.now() - t0;

const memAfter = process.memoryUsage();
const peakHeap = memAfter.heapUsed;
const peakRss = memAfter.rss;

const sample: BenchmarkSample = {
  durationMs,
  heapDeltaBytes: Math.max(0, peakHeap - baselineHeap),
  rssDeltaBytes: Math.max(0, peakRss - baselineRss),
  recordsParsed: records.length,
  featuresParsed: records.reduce((sum, record) => sum + record.features.length, 0),
};

process.stdout.write(`${JSON.stringify(sample)}\n`);

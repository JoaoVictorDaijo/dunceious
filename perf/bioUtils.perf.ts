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
 * Bio-utilities performance benchmarks.
 *
 * ## How to run
 *
 *   npm run perf           # runs with --expose-gc (GC-aware memory sampling)
 *
 * Covers three resources from services/bioUtils.ts:
 *   - translateSequence      – codon-by-codon protein translation
 *   - sliceRecordsBySelection – feature/track clipping over many records
 *   - exportToGenBank         – serialisation of SeqRecord[] to GenBank text
 *
 * Methodology: see perfUtils.ts and parseGenBank.perf.ts.
 */

import { describe, it, expect } from 'vitest';
import {
  translateSequence,
  sliceRecordsBySelection,
} from '../src/domain/bio';
import { exportToGenBank } from '../src/core/genbank/serialize';
import type { SeqRecord, BioFeature } from '../types';
import { bench, GC_AVAILABLE } from './perfUtils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Deterministic pseudo-random DNA string (no external deps). */
function makeDna(length: number, seed = 1): string {
  const bases = ['A', 'T', 'C', 'G'] as const;
  let s = seed;
  return Array.from({ length }, () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return bases[s & 3] as string;
  }).join('');
}

/** Build a minimal SeqRecord with `numFeatures` non-overlapping CDS features. */
function makeRecord(seqLength: number, numFeatures: number, id = 'REC001'): SeqRecord {
  const seq = makeDna(seqLength, seqLength + numFeatures);
  const featureSize = Math.max(3, Math.floor(seqLength / Math.max(1, numFeatures + 1)));

  const features: BioFeature[] = Array.from({ length: numFeatures }, (_, i) => {
    const start = (i + 1) * featureSize;
    const end = Math.min(start + featureSize, seqLength);
    return {
      type: 'CDS',
      name: `gene${i + 1}`,
      start,
      end,
      strand: (i % 2 === 0 ? 1 : -1) as 1 | -1,
    };
  }).filter(f => f.end > f.start);

  return { id, name: id, sequence: seq, features };
}

/** Log a benchmark result to the console for visibility in perf runs. */
function logResult(label: string, result: ReturnType<typeof bench>): void {
  const memNote = GC_AVAILABLE
    ? `  mem peak=${(result.peakHeapDeltaBytes / 1024).toFixed(1)} KB`
    : '  mem=skipped (no --expose-gc)';
  console.log(
    `[bench] ${label.padEnd(55)} ` +
    `time median=${result.medianMs.toFixed(3)} ms  p95=${result.p95Ms.toFixed(3)} ms` +
    memNote,
  );
}

// ---------------------------------------------------------------------------
// Suite A: translateSequence – scaling with coding-sequence length
// ---------------------------------------------------------------------------

describe('translateSequence – scaling with coding-sequence length', () => {
  // Lengths must be multiples of 3 so the full sequence is codon-aligned.
  const CDS_LENGTHS = [300, 3_000, 30_000, 300_000] as const;

  // Pre-build inputs outside timed blocks.
  const inputs = new Map(CDS_LENGTHS.map(len => [len, makeDna(len)]));

  const results = new Map<number, ReturnType<typeof bench>>();

  for (const len of CDS_LENGTHS) {
    it(`translates a ${len.toLocaleString()} nt CDS correctly and within time budget`, () => {
      const cds = inputs.get(len)!;

      // Correctness: protein length should be floor(len / 3).
      const protein = translateSequence(cds);
      expect(protein).toHaveLength(Math.floor(len / 3));

      // Benchmark: 50 warmup + 100 measured iterations.
      const result = bench(() => translateSequence(cds), { warmup: 50, iterations: 100 });
      results.set(len, result);
      logResult(`translateSequence len=${len.toLocaleString()} nt`, result);

      expect(result.p95Ms).toBeLessThan(2000);
    });
  }

  it('translateSequence time scales sub-quadratically with CDS length', () => {
    const r3k = results.get(3_000);
    const r300k = results.get(300_000);
    if (!r3k || !r300k) return;

    // 3 k → 300 k is a 100× increase; allow up to 10 000× slowdown.
    const ratio = r300k.medianMs / Math.max(r3k.medianMs, 0.001);
    expect(ratio).toBeLessThan(10_000);
  });

  it('translateSequence memory scales sub-linearly or linearly (GC-aware only)', () => {
    if (!GC_AVAILABLE) {
      console.log('[bench] Skipping memory scaling test — run with --expose-gc for this check.');
      return;
    }
    const r3k = results.get(3_000);
    const r300k = results.get(300_000);
    if (!r3k || !r300k) return;

    const memRatio = r300k.peakHeapDeltaBytes / Math.max(r3k.peakHeapDeltaBytes, 1);
    expect(memRatio).toBeLessThan(1_000);
  });
});

// ---------------------------------------------------------------------------
// Suite B: sliceRecordsBySelection – scaling with number of features
// ---------------------------------------------------------------------------

describe('sliceRecordsBySelection – scaling with feature count', () => {
  const FEATURE_COUNTS = [10, 100, 500, 1_000] as const;
  const SEQ_LENGTH = 100_000;
  const SEL_START = 10_000;
  const SEL_END = 90_000;

  // Pre-build records outside timed blocks.
  const inputs = new Map(
    FEATURE_COUNTS.map(n => [n, [makeRecord(SEQ_LENGTH, n, `REC_${n}`)]]),
  );

  const results = new Map<number, ReturnType<typeof bench>>();

  for (const n of FEATURE_COUNTS) {
    it(`slices a record with ${n.toLocaleString()} features correctly and within time budget`, () => {
      const records = inputs.get(n)!;

      // Correctness: sliced records have expected sequence length.
      const sliced = sliceRecordsBySelection(records, SEL_START, SEL_END);
      expect(sliced).toHaveLength(1);
      expect(sliced[0]!.sequence).toHaveLength(SEL_END - SEL_START);
      expect(sliced[0]!.features.length).toBeLessThanOrEqual(n);

      // Benchmark.
      const result = bench(
        () => sliceRecordsBySelection(records, SEL_START, SEL_END),
        { warmup: 50, iterations: 100 },
      );
      results.set(n, result);
      logResult(`sliceRecordsBySelection features=${n.toLocaleString()}`, result);

      expect(result.p95Ms).toBeLessThan(2000);
    });
  }

  it('sliceRecordsBySelection time scales sub-quadratically with feature count', () => {
    const r10 = results.get(10);
    const r1k = results.get(1_000);
    if (!r10 || !r1k) return;

    // 10 → 1 000 features is a 100× increase; allow up to 10 000× slowdown.
    const ratio = r1k.medianMs / Math.max(r10.medianMs, 0.001);
    expect(ratio).toBeLessThan(10_000);
  });
});

// ---------------------------------------------------------------------------
// Suite C: exportToGenBank – scaling with sequence length
// ---------------------------------------------------------------------------

describe('exportToGenBank – scaling with sequence length', () => {
  const SEQ_LENGTHS = [1_000, 10_000, 50_000] as const;
  const FEATURES_PER_RECORD = 20;

  // Pre-build records outside timed blocks.
  const inputs = new Map(
    SEQ_LENGTHS.map(len => [len, [makeRecord(len, FEATURES_PER_RECORD, `REC${len}`)]]),
  );

  const results = new Map<number, ReturnType<typeof bench>>();

  for (const len of SEQ_LENGTHS) {
    it(`exports a ${len.toLocaleString()} bp record to GenBank format correctly and within time budget`, () => {
      const records = inputs.get(len)!;

      // Correctness: output must contain the LOCUS and ORIGIN keywords.
      const output = exportToGenBank(records);
      expect(typeof output).toBe('string');
      expect(output).toContain('LOCUS');
      expect(output).toContain('ORIGIN');
      expect(output).toContain('//');

      // Benchmark.
      const result = bench(() => exportToGenBank(records), { warmup: 50, iterations: 100 });
      results.set(len, result);
      logResult(`exportToGenBank seq_len=${len.toLocaleString()} bp`, result);

      expect(result.p95Ms).toBeLessThan(2000);
    });
  }

  it('exportToGenBank time scales sub-quadratically with sequence length', () => {
    const r1k = results.get(1_000);
    const r50k = results.get(50_000);
    if (!r1k || !r50k) return;

    // 1 k → 50 k is a 50× increase; allow up to 10 000× slowdown.
    const ratio = r50k.medianMs / Math.max(r1k.medianMs, 0.001);
    expect(ratio).toBeLessThan(10_000);
  });

  it('exportToGenBank memory scales sub-linearly or linearly (GC-aware only)', () => {
    if (!GC_AVAILABLE) {
      console.log('[bench] Skipping memory scaling test — run with --expose-gc for this check.');
      return;
    }
    const r1k = results.get(1_000);
    const r50k = results.get(50_000);
    if (!r1k || !r50k) return;

    const memRatio = r50k.peakHeapDeltaBytes / Math.max(r1k.peakHeapDeltaBytes, 1);
    expect(memRatio).toBeLessThan(1_000);
  });
});

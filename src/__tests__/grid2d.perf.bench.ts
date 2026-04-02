/**
 * 2-D grid performance benchmarks.
 *
 * ## How to run
 *
 *   npm run perf           # runs with --expose-gc (GC-aware memory sampling)
 *
 * The "2-D grid" here is the aligned genomic sequence viewer where
 *   columns = aligned nucleotide positions (up to the full alignment length)
 *   rows    = records / annotation tracks (one per loaded sequence)
 *
 * Covers four domain functions from src/domain/bio/:
 *   - transposeCoordinates  – raw → aligned coordinate mapping (O(n) per call)
 *   - buildAlignedSegments  – gap-aware segment extraction from an aligned window
 *   - processTransposition  – full grid transposition (rows × features × columns)
 *   - clipSegments          – per-frame viewport clipping (O(segments) per call)
 *   - calculateConsensus    – majority-vote consensus (O(rows × columns))
 *
 * Methodology: see src/__tests__/perfUtils.ts and parseGenBank.perf.bench.ts.
 */

import { describe, it, expect } from 'vitest';
import {
  transposeCoordinates,
  buildAlignedSegments,
  processTransposition,
  clipSegments,
  calculateConsensus,
} from '../domain/bio/index';
import type { SeqRecord, BioFeature, FeatureSegment } from '../../types';
import { bench, GC_AVAILABLE } from './perfUtils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Deterministic pseudo-random DNA string (no external deps). */
function makeDna(length: number, seed = 3): string {
  const bases = ['A', 'T', 'C', 'G'] as const;
  let s = seed;
  return Array.from({ length }, () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return bases[s & 3] as string;
  }).join('');
}

/**
 * Build an aligned sequence of `length` characters by scattering gap characters
 * at a given density.  The resulting string has `length` characters total;
 * the non-gap characters form a raw sequence of length `length * (1 - gapFrac)`.
 */
function makeAlignedSeq(length: number, gapFrac = 0.2, seed = 5): string {
  const bases = ['A', 'T', 'C', 'G', '-'] as const;
  let s = seed;
  return Array.from({ length }, () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    // Use gapFrac to decide whether to emit a gap.
    const isGap = (s & 0xff) / 256 < gapFrac;
    if (isGap) return '-';
    return bases[s & 3] as string;
  }).join('');
}

/**
 * Build a SeqRecord whose features are evenly distributed along the sequence
 * and whose `alignedSequence` contains `gapFrac` gap characters.
 */
function makeGridRecord(
  seqLength: number,
  numFeatures: number,
  gapFrac = 0.2,
  id = 'REC',
): SeqRecord {
  const seq = makeDna(seqLength, seqLength + numFeatures);
  // Aligned sequence is longer by the inserted gaps.
  const alignedLength = Math.round(seqLength / (1 - gapFrac));
  const alignedSequence = makeAlignedSeq(alignedLength, gapFrac, seqLength);

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

  return { id, name: id, sequence: seq, alignedSequence, features };
}

/** Build a list of feature segments covering a range of positions. */
function makeSegments(count: number, rangeEnd: number): FeatureSegment[] {
  const segLen = Math.max(1, Math.floor(rangeEnd / (count + 1)));
  return Array.from({ length: count }, (_, i) => ({
    start: (i + 1) * segLen,
    end: Math.min((i + 1) * segLen + segLen, rangeEnd),
  }));
}

/** Log a benchmark result to the console for visibility in perf runs. */
function logResult(label: string, result: ReturnType<typeof bench>): void {
  const memNote = GC_AVAILABLE
    ? `  mem median=${(result.medianHeapBytes / 1024).toFixed(1)} KB`
    : '  mem=skipped (no --expose-gc)';
  console.log(
    `[bench] ${label.padEnd(60)} ` +
    `time median=${result.medianMs.toFixed(3)} ms  p95=${result.p95Ms.toFixed(3)} ms` +
    memNote,
  );
}

// ---------------------------------------------------------------------------
// Suite A: transposeCoordinates + buildAlignedSegments – grid columns scaling
// ---------------------------------------------------------------------------

describe('transposeCoordinates – scaling with aligned sequence length (grid columns)', () => {
  // Aligned lengths represent increasingly wide grids.
  const ALIGNED_LENGTHS = [500, 5_000, 50_000, 500_000] as const;

  // Pre-build aligned sequences outside timed blocks.
  const inputs = new Map(ALIGNED_LENGTHS.map(len => [len, makeAlignedSeq(len, 0.2, len)]));

  const results = new Map<number, ReturnType<typeof bench>>();

  for (const len of ALIGNED_LENGTHS) {
    it(`transposes a raw position in a ${len.toLocaleString()}-column grid within time budget`, () => {
      const aligned = inputs.get(len)!;
      // Target position at roughly the middle of the raw sequence.
      const rawPos = Math.floor((len * 0.8) / 2); // 40% of non-gap chars

      // Correctness: result must be a valid index within the aligned string.
      const pos = transposeCoordinates(rawPos, aligned);
      expect(pos).toBeGreaterThanOrEqual(0);
      expect(pos).toBeLessThanOrEqual(aligned.length);

      // Benchmark: 50 warmup + 100 measured iterations.
      const result = bench(() => transposeCoordinates(rawPos, aligned), {
        warmup: 50,
        iterations: 100,
      });
      results.set(len, result);
      logResult(`transposeCoordinates aligned_len=${len.toLocaleString()}`, result);

      expect(result.p95Ms).toBeLessThan(2000);
    });
  }

  it('transposeCoordinates time scales sub-quadratically with aligned length', () => {
    const r5k = results.get(5_000);
    const r500k = results.get(500_000);
    if (!r5k || !r500k) return;

    // 5 k → 500 k is a 100× increase; allow up to 10 000× slowdown.
    const ratio = r500k.medianMs / Math.max(r5k.medianMs, 0.001);
    expect(ratio).toBeLessThan(10_000);
  });
});

describe('buildAlignedSegments – scaling with viewport width (grid columns)', () => {
  const VIEWPORT_WIDTHS = [200, 2_000, 20_000, 200_000] as const;
  // Use a single long aligned sequence shared across sub-tests.
  const MAX_LEN = 400_000;
  const ALIGNED_SEQ = makeAlignedSeq(MAX_LEN, 0.25, 77);

  const results = new Map<number, ReturnType<typeof bench>>();

  for (const width of VIEWPORT_WIDTHS) {
    it(`builds aligned segments over a ${width.toLocaleString()}-column viewport within time budget`, () => {
      const vStart = Math.floor((MAX_LEN - width) / 2); // centred viewport
      const vEnd = vStart + width;

      // Correctness: returns an array of segments.
      const segs = buildAlignedSegments(ALIGNED_SEQ, vStart, vEnd);
      expect(Array.isArray(segs)).toBe(true);
      // All returned segments must lie within [vStart, vEnd).
      for (const s of segs) {
        expect(s.start).toBeGreaterThanOrEqual(vStart);
        expect(s.end).toBeLessThanOrEqual(vEnd);
      }

      const result = bench(() => buildAlignedSegments(ALIGNED_SEQ, vStart, vEnd), {
        warmup: 50,
        iterations: 100,
      });
      results.set(width, result);
      logResult(`buildAlignedSegments viewport_width=${width.toLocaleString()}`, result);

      expect(result.p95Ms).toBeLessThan(2000);
    });
  }

  it('buildAlignedSegments time scales sub-quadratically with viewport width', () => {
    const r2k = results.get(2_000);
    const r200k = results.get(200_000);
    if (!r2k || !r200k) return;

    const ratio = r200k.medianMs / Math.max(r2k.medianMs, 0.001);
    expect(ratio).toBeLessThan(10_000);
  });
});

// ---------------------------------------------------------------------------
// Suite B: processTransposition – scaling with grid size (rows × features)
// ---------------------------------------------------------------------------

describe('processTransposition – scaling with grid size (rows × features per row)', () => {
  // Grid configurations: [numRecords, featuresPerRecord]
  // Keep seqLength small so warmup + measured iterations complete quickly.
  const GRID_SIZES = [
    [1, 10],
    [5, 30],
    [10, 60],
    [20, 100],
  ] as const;
  const SEQ_LENGTH = 1_000;

  // Pre-build record arrays outside timed blocks.
  const inputs = new Map(
    GRID_SIZES.map(([rows, feats]) => {
      const key = `${rows}x${feats}`;
      const records = Array.from({ length: rows }, (_, i) =>
        makeGridRecord(SEQ_LENGTH, feats, 0.2, `REC_${i}`),
      );
      return [key, records] as [string, SeqRecord[]];
    }),
  );

  const results = new Map<string, ReturnType<typeof bench>>();

  for (const [rows, feats] of GRID_SIZES) {
    it(`transposes a ${rows}-row × ${feats}-feature grid correctly and within time budget`, () => {
      const key = `${rows}x${feats}`;
      const records = inputs.get(key)!;

      // Correctness: all transposed records must have the same number of features.
      const transposed = processTransposition(records);
      expect(transposed).toHaveLength(rows);
      for (const rec of transposed) {
        expect(rec.features.length).toBeLessThanOrEqual(feats);
      }

      const result = bench(() => processTransposition(records), { warmup: 10, iterations: 20 });
      results.set(key, result);
      logResult(`processTransposition rows=${rows} feats/row=${feats}`, result);

      expect(result.p95Ms).toBeLessThan(2000);
    });
  }

  it('processTransposition time scales sub-quadratically with grid size', () => {
    const rSmall = results.get('1x10');
    const rLarge = results.get('20x100');
    if (!rSmall || !rLarge) return;

    // 10 total cells → 2 000 total cells is a 200× increase;
    // allow up to 10 000× slowdown.
    const ratio = rLarge.medianMs / Math.max(rSmall.medianMs, 0.001);
    expect(ratio).toBeLessThan(10_000);
  });

  it('processTransposition memory scales sub-linearly or linearly (GC-aware only)', () => {
    if (!GC_AVAILABLE) {
      console.log('[bench] Skipping memory scaling test — run with --expose-gc for this check.');
      return;
    }
    const rSmall = results.get('1x10');
    const rLarge = results.get('20x100');
    if (!rSmall || !rLarge) return;

    const memRatio = rLarge.medianHeapBytes / Math.max(rSmall.medianHeapBytes, 1);
    expect(memRatio).toBeLessThan(1_000);
  });
});

// ---------------------------------------------------------------------------
// Suite C: clipSegments – per-frame viewport clipping, scaling with segment count
// ---------------------------------------------------------------------------

describe('clipSegments – per-frame viewport clipping, scaling with segment count', () => {
  const SEG_COUNTS = [10, 100, 1_000, 10_000] as const;
  const RANGE_END = 1_000_000; // large coordinate space
  const VIEW_START = 200_000;
  const VIEW_END = 800_000;

  const inputs = new Map(SEG_COUNTS.map(n => [n, makeSegments(n, RANGE_END)]));

  const results = new Map<number, ReturnType<typeof bench>>();

  for (const n of SEG_COUNTS) {
    it(`clips ${n.toLocaleString()} segments to viewport correctly and within time budget`, () => {
      const segments = inputs.get(n)!;

      // Correctness: all clipped segments must be within viewport bounds.
      const clipped = clipSegments(segments, VIEW_START, VIEW_END);
      expect(Array.isArray(clipped)).toBe(true);
      for (const s of clipped) {
        expect(s.start).toBeGreaterThanOrEqual(VIEW_START);
        expect(s.end).toBeLessThanOrEqual(VIEW_END);
      }

      const result = bench(
        () => clipSegments(segments, VIEW_START, VIEW_END),
        { warmup: 50, iterations: 100 },
      );
      results.set(n, result);
      logResult(`clipSegments count=${n.toLocaleString()}`, result);

      expect(result.p95Ms).toBeLessThan(2000);
    });
  }

  it('clipSegments time scales sub-quadratically with segment count', () => {
    const r10 = results.get(10);
    const r10k = results.get(10_000);
    if (!r10 || !r10k) return;

    // 10 → 10 000 is a 1 000× increase; allow up to 10 000× slowdown.
    const ratio = r10k.medianMs / Math.max(r10.medianMs, 0.001);
    expect(ratio).toBeLessThan(10_000);
  });
});

// ---------------------------------------------------------------------------
// Suite D: calculateConsensus – scaling with grid dimensions (rows × columns)
// ---------------------------------------------------------------------------

describe('calculateConsensus – scaling with grid dimensions (rows × columns)', () => {
  // [numRecords, alignedLength] — rows × columns of the consensus grid.
  const GRID_DIMS = [
    [2, 1_000],
    [10, 5_000],
    [30, 10_000],
    [50, 20_000],
  ] as const;

  // Pre-build record arrays outside timed blocks.
  const inputs = new Map(
    GRID_DIMS.map(([rows, cols]) => {
      const key = `${rows}x${cols}`;
      const records: SeqRecord[] = Array.from({ length: rows }, (_, i) => {
        const seq = makeDna(cols, i + 1);
        const alignedSequence = makeAlignedSeq(cols, 0.15, i + cols);
        return { id: `R${i}`, name: `R${i}`, sequence: seq, alignedSequence, features: [] };
      });
      return [key, records] as [string, SeqRecord[]];
    }),
  );

  const results = new Map<string, ReturnType<typeof bench>>();

  for (const [rows, cols] of GRID_DIMS) {
    it(`computes consensus for a ${rows}-row × ${cols.toLocaleString()}-column grid within time budget`, () => {
      const key = `${rows}x${cols}`;
      const records = inputs.get(key)!;

      // Correctness: consensus length must equal the aligned sequence length.
      const consensus = calculateConsensus(records);
      expect(typeof consensus).toBe('string');
      expect(consensus.length).toBe(cols);

      const result = bench(() => calculateConsensus(records), { warmup: 10, iterations: 20 });
      results.set(key, result);
      logResult(`calculateConsensus rows=${rows} cols=${cols.toLocaleString()}`, result);

      expect(result.p95Ms).toBeLessThan(2000);
    });
  }

  it('calculateConsensus time scales sub-quadratically with grid area', () => {
    const rSmall = results.get('2x1000');
    const rLarge = results.get('50x20000');
    if (!rSmall || !rLarge) return;

    // 2 000 cells → 1 000 000 cells is a 500× increase;
    // allow up to 10 000× slowdown.
    const ratio = rLarge.medianMs / Math.max(rSmall.medianMs, 0.001);
    expect(ratio).toBeLessThan(10_000);
  });

  it('calculateConsensus memory scales sub-linearly or linearly (GC-aware only)', () => {
    if (!GC_AVAILABLE) {
      console.log('[bench] Skipping memory scaling test — run with --expose-gc for this check.');
      return;
    }
    const rSmall = results.get('2x1000');
    const rLarge = results.get('50x20000');
    if (!rSmall || !rLarge) return;

    const memRatio = rLarge.medianHeapBytes / Math.max(rSmall.medianHeapBytes, 1);
    expect(memRatio).toBeLessThan(1_000);
  });
});

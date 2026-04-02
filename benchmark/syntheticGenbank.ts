/**
 * Utilities for generating synthetic GenBank strings used in benchmarks.
 *
 * Two factory functions are exported:
 *   - makeRecord      – a single record with a given sequence length
 *   - makeMultiRecord – N records concatenated into one string
 */

/** Deterministic nucleotide alphabet (cycled). */
const NUCS = 'atgcatgcta';

/**
 * Build a deterministic nucleotide sequence of the requested length.
 * The same character pattern repeats for reproducibility.
 */
export function makeSequence(length: number): string {
  const buf: string[] = new Array(length);
  for (let i = 0; i < length; i++) {
    buf[i] = NUCS[i % NUCS.length]!;
  }
  return buf.join('');
}

/**
 * Format a raw nucleotide string into a GenBank ORIGIN block.
 * Layout: 9-char 1-based position, space, groups of 10 bp separated by spaces,
 * 60 bp per line – the standard NCBI GenBank layout.
 */
function formatOrigin(seq: string): string {
  const CHARS_PER_LINE = 60;
  const GROUP_SIZE = 10;
  const lines: string[] = ['ORIGIN      '];
  for (let pos = 0; pos < seq.length; pos += CHARS_PER_LINE) {
    const chunk = seq.slice(pos, pos + CHARS_PER_LINE);
    const groups: string[] = [];
    for (let i = 0; i < chunk.length; i += GROUP_SIZE) {
      groups.push(chunk.slice(i, i + GROUP_SIZE));
    }
    lines.push(`${String(pos + 1).padStart(9)} ${groups.join(' ')}`);
  }
  return lines.join('\n');
}

export interface MakeRecordOptions {
  /** Locus / accession identifier. */
  id: string;
  /** Desired sequence length in base pairs. */
  seqLength: number;
  /** Number of gene/CDS pairs to embed (default: 3). */
  numFeatures?: number;
  /** Whether to mark the record as circular (default: false). */
  circular?: boolean;
}

/**
 * Build a single synthetic GenBank record string.
 *
 * Features are evenly spaced across the sequence; each gene/CDS pair is
 * ~half the inter-feature gap in length.  A placeholder /translation is used
 * so the CDS qualifiers parse without errors.
 */
export function makeRecord({
  id,
  seqLength,
  numFeatures = 3,
  circular = false,
}: MakeRecordOptions): string {
  const topology = circular ? 'circular' : 'linear';
  const seq = makeSequence(seqLength);

  // FEATURES section
  const featureLines: string[] = [
    'FEATURES             Location/Qualifiers',
    `     source          1..${seqLength}`,
    `                     /organism="Synthetic"`,
  ];

  const effectiveFeatures = Math.max(0, numFeatures);
  if (effectiveFeatures > 0) {
    const step = Math.max(1, Math.floor(seqLength / (effectiveFeatures + 1)));
    for (let i = 0; i < effectiveFeatures; i++) {
      const start = step * (i + 1);
      const end = Math.min(start + Math.max(1, Math.floor(step / 2) - 1), seqLength);
      const geneName = `gene${String(i + 1).padStart(3, '0')}`;
      featureLines.push(
        `     gene            ${start}..${end}`,
        `                     /gene="${geneName}"`,
        `     CDS             ${start}..${end}`,
        `                     /gene="${geneName}"`,
        `                     /product="hypothetical protein"`,
        `                     /translation="MSSSS"`,
      );
    }
  }

  const parts = [
    `LOCUS       ${id.padEnd(16)} ${String(seqLength).padStart(6)} bp    DNA             ${topology.toUpperCase().padEnd(8)}  01-JAN-2024`,
    `DEFINITION  Synthetic sequence ${id} for benchmarking.`,
    `ACCESSION   ${id}`,
    featureLines.join('\n'),
    formatOrigin(seq),
    '//',
  ];

  return parts.join('\n');
}

/**
 * Build a multi-record GenBank string of `numRecords` records,
 * each of length `seqLength` bp.
 *
 * Record identifiers are SYN00001, SYN00002, …
 * The number of features per record scales with sequence length
 * (≈1 gene/CDS pair per 500 bp, minimum 1).
 */
export function makeMultiRecord(numRecords: number, seqLength: number = 1_000): string {
  const records: string[] = [];
  const numFeatures = Math.max(1, Math.floor(seqLength / 500));
  for (let i = 0; i < numRecords; i++) {
    records.push(
      makeRecord({
        id: `SYN${String(i + 1).padStart(5, '0')}`,
        seqLength,
        numFeatures,
      }),
    );
  }
  return records.join('\n');
}

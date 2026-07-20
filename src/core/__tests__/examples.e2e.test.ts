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
 * End-to-end parser assertions over the richer demo files in examples/.
 *
 * These vendored NCBI RefSeq snapshots (checked in, never re-downloaded at test
 * time) close the suite-wide blind spots the minimal SCU49845 fixture cannot:
 * spliced/multi-segment joins, tRNA/rRNA feature types, circular topology, a
 * real multi-record file, and an ss-RNA molecule type. Exact counts are pinned
 * to the accession versions noted per describe block.
 *
 * Scope: only behaviour the current code renders CORRECTLY is asserted. The
 * mitochondrial file (non-standard genetic code) and the mixed-strand
 * trans-splice / U-bearing translation cases are deliberately NOT asserted here
 * — asserting today's output would bake in the known defects tracked in the
 * translation/location-correctness issue. Those land with their fixes.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseGenBank } from '@/src/core/genbank/index';
import { extractCodingSequence, translateSequence, detectEarlyStop } from '@/src/domain/bio/sequence';
import type { SeqRecord, BioFeature } from '@/src/domain/bio/types';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadExample(file: string): string {
  try {
    return readFileSync(resolve(__dirname, '../../../examples/', file), 'utf-8');
  } catch {
    return '';
  }
}

function typeHistogram(records: SeqRecord[]): Record<string, number> {
  const h: Record<string, number> = {};
  for (const r of records) for (const f of r.features) h[f.type] = (h[f.type] || 0) + 1;
  return h;
}

// ---------------------------------------------------------------------------
// Arabidopsis thaliana chloroplast — NC_000932.1
// Spliced joins, tRNA/rRNA types, circular topology, standard-code translation.
// ---------------------------------------------------------------------------

describe('examples/arabidopsis-chloroplast-NC_000932.gb', () => {
  const content = loadExample('arabidopsis-chloroplast-NC_000932.gb');
  if (!content) {
    it.skip('fixture file not found', () => {});
    return;
  }

  let records: SeqRecord[];
  let record: SeqRecord;
  beforeAll(() => {
    records = parseGenBank(content);
    record = records[0];
  });

  it('parses a single circular DNA record', () => {
    expect(records).toHaveLength(1);
    expect(record.isCircular).toBe(true);
    expect(record.moleculeType).toBe('dna');
  });

  it('parses the full feature set with the expected type histogram', () => {
    expect(record.features).toHaveLength(259);
    expect(typeHistogram(records)).toEqual({
      source: 1,
      gene: 129,
      CDS: 85,
      tRNA: 37,
      rRNA: 7,
    });
  });

  it('parses spliced features into multi-segment joins', () => {
    const splicedCds = record.features.filter(
      f => f.type === 'CDS' && (f.segments?.length ?? 0) > 1,
    );
    expect(splicedCds).toHaveLength(15);
    // A spliced tRNA (intron-containing) must also survive as multi-segment.
    const splicedTrna = record.features.filter(
      f => f.type === 'tRNA' && (f.segments?.length ?? 0) > 1,
    );
    expect(splicedTrna.length).toBeGreaterThan(0);
  });

  it('translates standard-code CDS to match their stored /translation', () => {
    // transl_table=11 shares the standard internal codon table, so recomputing
    // the protein must reproduce the annotated one for the great majority of
    // CDS. (A handful use alternative starts or RNA-edited codons and are
    // legitimately allowed to differ.)
    const cds = record.features.filter(f => f.type === 'CDS');
    let matched = 0;
    for (const f of cds) {
      if (!f.translation) continue;
      const { codingSeq } = extractCodingSequence(f, record.sequence);
      const computed = translateSequence(codingSeq).replace(/_+$/, '');
      if (computed === f.translation) matched++;
    }
    expect(matched).toBeGreaterThanOrEqual(75);
  });

  it('does not flag any valid standard-code CDS as a broken protein', () => {
    // The inverse of the mitochondrial mistranslation bug: a correctly
    // annotated, in-frame CDS must never trip the early-stop detector.
    // Restricted to single-segment codon_start=1 CDS so neither the ignored
    // /codon_start offset nor the mixed-strand trans-splice defect contaminates
    // this guard (both tracked separately).
    const cds = record.features.filter(
      f =>
        f.type === 'CDS' &&
        (f.segments?.length ?? 0) <= 1 &&
        (f.metadata?.codon_start ?? '1') === '1',
    );
    expect(cds.length).toBeGreaterThanOrEqual(60);
    const broken = cds.filter(f => {
      const { codingSeq } = extractCodingSequence(f, record.sequence);
      return detectEarlyStop(codingSeq);
    });
    expect(broken).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Influenza A PR8 — NC_002016.1 .. NC_002023.1
// Multi-record file whose records each carry features; spliced CDS.
// ---------------------------------------------------------------------------

describe('examples/influenza-a-pr8-8segments.gb', () => {
  const content = loadExample('influenza-a-pr8-8segments.gb');
  if (!content) {
    it.skip('fixture file not found', () => {});
    return;
  }

  let records: SeqRecord[];
  beforeAll(() => {
    records = parseGenBank(content);
  });

  it('parses eight records, each carrying features', () => {
    expect(records).toHaveLength(8);
    for (const r of records) expect(r.features.length).toBeGreaterThan(0);
  });

  it('aggregates the Database Hub annotation count across records', () => {
    // Mirrors the hook's allFeaturesCount formula shown as "M Annotations".
    const allFeaturesCount = records.reduce((acc, r) => acc + r.features.length, 0);
    expect(allFeaturesCount).toBe(36);
  });

  it('parses spliced M2/NS2 CDS into multi-segment joins', () => {
    const spliced = records
      .flatMap(r => r.features)
      .filter(f => f.type === 'CDS' && (f.segments?.length ?? 0) > 1);
    expect(spliced).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// SARS-CoV-2 — NC_045512.2
// ss-RNA molecule type; ORF1ab -1 ribosomal-frameshift join.
// ---------------------------------------------------------------------------

describe('examples/sars-cov-2-NC_045512.gb', () => {
  const content = loadExample('sars-cov-2-NC_045512.gb');
  if (!content) {
    it.skip('fixture file not found', () => {});
    return;
  }

  let records: SeqRecord[];
  let record: SeqRecord;
  beforeAll(() => {
    records = parseGenBank(content);
    record = records[0];
  });

  it('classifies a real ss-RNA record as an RNA molecule type', () => {
    expect(records).toHaveLength(1);
    expect(record.moleculeType).toBe('rna');
    expect(record.isCircular).toBe(false);
  });

  it('parses mat_peptide and stem_loop feature types', () => {
    const h = typeHistogram(records);
    expect(h.CDS).toBe(12);
    expect(h.mat_peptide).toBe(26);
    expect(h.stem_loop).toBe(5);
    expect(h.gene).toBe(11);
  });

  it('parses the ORF1ab frameshift join with a coincident boundary base', () => {
    const orf1ab = record.features.find(
      (f: BioFeature) => f.type === 'CDS' && (f.segments?.length ?? 0) === 2,
    );
    expect(orf1ab).toBeDefined();
    const segs = orf1ab!.segments!;
    // The -1 ribosomal frameshift re-reads one base: the last base of segment 0
    // is the first base of segment 1 (half-open coords ⇒ seg0.end - 1 === seg1.start).
    expect(segs[0].end - 1).toBe(segs[1].start);
    // The re-read keeps the concatenated ORF in frame.
    const { codingSeq } = extractCodingSequence(orf1ab!, record.sequence);
    expect(codingSeq.length % 3).toBe(0);
  });
});

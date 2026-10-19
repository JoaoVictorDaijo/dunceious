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
 * real multi-record file, and a non-standard genetic code. The aligned sets
 * live in exampleSets.e2e.test.ts. Exact counts are pinned to the accession
 * versions noted per describe block.
 *
 * Scope: only behaviour the current code renders CORRECTLY is asserted. The
 * mitochondrial file (non-standard genetic code) and the mixed-strand
 * trans-splice / U-bearing translation cases are deliberately NOT asserted here
 * — asserting today's output would bake in the known defects tracked in the
 * translation/location-correctness issue. Those land with their fixes.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { parseGenBank } from '@/src/core/genbank/index';
import { extractCodingSequence, translateSequence, detectEarlyStop } from '@/src/domain/bio/sequence';
import { processTransposition } from '@/src/domain/bio';
import type { SeqRecord } from '@/src/domain/bio/types';
import { EXAMPLES, loadExample, typeHistogram } from './fixtures/examples';


// ---------------------------------------------------------------------------
// Arabidopsis thaliana chloroplast — NC_000932.1
// Spliced joins, tRNA/rRNA types, circular topology, standard-code translation.
// ---------------------------------------------------------------------------

describe(`examples/${EXAMPLES.arabidopsisChloroplast}`, () => {
  const content = loadExample(EXAMPLES.arabidopsisChloroplast);
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
    // annotated, in-frame standard-code CDS must never trip the early-stop
    // detector. Restricted to single-segment codon_start=1 CDS — a clean subset
    // free of RNA-edited internal stops; the trans-spliced and non-standard-code
    // paths have their own dedicated assertions.
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

  it('parses the trans-spliced rps12 CDS with per-segment strands and translates it correctly', () => {
    // rps12 is trans-spliced across strands: join(complement(...),...,...).
    // The forward segment must NOT be reverse-complemented with the whole feature.
    const mixed = record.features.filter(
      f =>
        f.type === 'CDS' &&
        (f.segments ?? []).some(s => s.strand === -1) &&
        (f.segments ?? []).some(s => s.strand === 1),
    );
    expect(mixed.length).toBeGreaterThan(0);
    for (const f of mixed) {
      const table = parseInt(String(f.metadata?.transl_table ?? '1'), 10);
      const { codingSeq } = extractCodingSequence(f, record.sequence);
      expect(detectEarlyStop(codingSeq, table), f.name).toBe(false);
      if (f.translation) {
        const computed = translateSequence(codingSeq, table).replace(/_+$/, '');
        expect(computed, f.name).toBe(f.translation);
      }
    }
  });

  it('keeps the trans-spliced rps12 CDS correct after alignment transposition', () => {
    // Per-segment strand must survive processTransposition (identity alignment),
    // else the aligned-view extractor takes the whole-feature revcomp path.
    const [transposed] = processTransposition([{ ...record, alignedSequence: record.sequence }]);
    const seq = transposed.alignedSequence!;
    const mixed = transposed.features.filter(
      f =>
        f.type === 'CDS' &&
        f.translation &&
        (f.segments ?? []).some(s => s.strand === -1) &&
        (f.segments ?? []).some(s => s.strand === 1),
    );
    expect(mixed.length).toBeGreaterThan(0);
    for (const f of mixed) {
      const table = parseInt(String(f.metadata?.transl_table ?? '1'), 10);
      const computed = translateSequence(extractCodingSequence(f, seq).codingSeq, table).replace(/_+$/, '');
      expect(computed, f.name).toBe(f.translation);
    }
  });

  it('gives the uniform-strand trans-spliced rps12 copy a linear envelope, not an origin wrap', () => {
    // rps12 copy 1 is annotated as complement(join(...)) with scattered parts on
    // one strand. Its descending order once tripped the origin-wrap heuristic,
    // painting an ~85 kb false wrap; the envelope must be the linear bounding box.
    const forms = [
      'complement(join(97999..98024,98562..98793,69611..69724))', // CDS
      'complement(join(97999..98793,69611..69724))',              // gene
    ];
    for (const loc of forms) {
      const f = record.features.find(feat => feat.locationString === loc);
      expect(f, loc).toBeDefined();
      expect(f!.start, loc).toBeLessThan(f!.end);
      expect(f!.start, loc).toBe(69610);
      expect(f!.end, loc).toBe(98793);
    }
  });
});

// ---------------------------------------------------------------------------
// Influenza A PR8 — NC_002016.1 .. NC_002023.1
// Multi-record file whose records each carry features; spliced CDS.
// ---------------------------------------------------------------------------

describe(`examples/${EXAMPLES.influenzaPr8}`, () => {
  const content = loadExample(EXAMPLES.influenzaPr8);
  let records: SeqRecord[];
  beforeAll(() => {
    records = parseGenBank(content);
  });

  it('parses eight records, each carrying features', () => {
    expect(records).toHaveLength(8);
    for (const r of records) expect(r.features.length).toBeGreaterThan(0);
  });

  it('aggregates the Annotation Hub annotation count across records', () => {
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
// Human mitochondrion — NC_012920.1
// Non-standard genetic code (vertebrate mitochondrial, transl_table=2).
// ---------------------------------------------------------------------------

describe(`examples/${EXAMPLES.humanMitochondrion}`, () => {
  const content = loadExample(EXAMPLES.humanMitochondrion);
  let record: SeqRecord;
  beforeAll(() => {
    record = parseGenBank(content)[0];
  });

  it('annotates all 13 CDS with the vertebrate mitochondrial code (transl_table=2)', () => {
    const cds = record.features.filter(f => f.type === 'CDS');
    expect(cds).toHaveLength(13);
    for (const f of cds) expect(f.metadata?.transl_table).toBe('2');
  });

  it('flags no CDS as broken under its own genetic code', () => {
    const cds = record.features.filter(f => f.type === 'CDS');
    // Under the STANDARD code every mitochondrial TGA (Trp) reads as a stop —
    // the pre-fix behaviour that painted these CDS with spurious early stops.
    const brokenStandard = cds.filter(
      f => detectEarlyStop(extractCodingSequence(f, record.sequence).codingSeq, 1),
    );
    expect(brokenStandard.length).toBeGreaterThan(0);
    // Under the annotated /transl_table, none are broken.
    for (const f of cds) {
      const table = parseInt(String(f.metadata?.transl_table ?? '1'), 10);
      const { codingSeq } = extractCodingSequence(f, record.sequence);
      expect(detectEarlyStop(codingSeq, table), f.name).toBe(false);
    }
  });

  it('recomputes CDS proteins with table 2 to match the stored /translation (bar alternative starts)', () => {
    const cds = record.features.filter(f => f.type === 'CDS' && f.translation);
    let matched = 0;
    for (const f of cds) {
      const table = parseInt(String(f.metadata?.transl_table ?? '1'), 10);
      const { codingSeq } = extractCodingSequence(f, record.sequence);
      const computed = translateSequence(codingSeq, table).replace(/_+$/, '');
      if (computed === f.translation) {
        matched++;
        continue;
      }
      // The only tolerated difference is the initiator residue: an alternative
      // start codon (e.g. ATT) is annotated as Met but translates literally.
      expect(computed.slice(1), f.name).toBe(f.translation!.slice(1));
    }
    expect(matched).toBeGreaterThanOrEqual(12);
  });
});

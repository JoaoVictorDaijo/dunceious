/*
 * Dunceious
 *
 * This file is part of Dunceious.
 *
 * Dunceious is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";
export default defineConfig(() => {
[72 more lines]
/**
 * End-to-end assertions over the aligned example sets in examples/. Each set is
 * three related genomes (or proteins) chosen to align meaningfully, and each
 * carries its own rendering challenge:
 *
 * - coronaviruses: RNA molecule type and the −1 ORF1ab frameshift, conserved
 *   across three genomes.
 * - t7-phages: both +1 and −1 frameshifts, a homologous frameshifted capsid
 *   gene in two genomes, stem_loop features, and an intron-split CDS.
 * - t4-phages: ~168 kb genomes with ~550 features each, reverse-strand
 *   self-splicing introns, and a translational bypass gap that is neither an
 *   intron nor a frameshift.
 * - pomc-orthologs: a protein set with nested mat_peptide cleavage products.
 *
 * Exact counts are pinned to the accession versions in the file names.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { parseGenBank } from '@/src/core/genbank/index';
import { extractCodingSequence, translateSequence, detectEarlyStop } from '@/src/domain/bio/sequence';
import { segmentFrameshifts } from '@/src/domain/bio';
import { preflightAlignment } from '@/src/core/alignment/preflight';
import type { SeqRecord, BioFeature } from '@/src/domain/bio/types';
import { EXAMPLES, EXAMPLE_SETS, EXAMPLES_DIR, loadExample, typeHistogram } from './fixtures/examples';

function loadSet(paths: readonly string[]): SeqRecord[] {
  return paths.map(path => {
    const records = parseGenBank(loadExample(path));
    expect(records, path).toHaveLength(1);
    return records[0];
  });
}

function translate(feature: BioFeature, record: SeqRecord): string {
  const table = parseInt(String(feature.metadata?.transl_table ?? '1'), 10);
  return translateSequence(extractCodingSequence(feature, record.sequence).codingSeq, table).replace(/_+$/, '');
}

function cdsOf(record: SeqRecord): BioFeature[] {
  return record.features.filter(f => f.type === 'CDS');
}

function hasEarlyStop(feature: BioFeature, record: SeqRecord): boolean {
  const table = parseInt(String(feature.metadata?.transl_table ?? '1'), 10);
  return detectEarlyStop(extractCodingSequence(feature, record.sequence).codingSeq, table);
}

function listGenBankFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) return listGenBankFiles(path);
    return entry.name.endsWith('.gb') ? [relative(EXAMPLES_DIR, path)] : [];
  });
}

describe('examples/ manifest', () => {
  it('lists every vendored example file, so none is orphaned or silently untested', () => {
    const declared = [...Object.values(EXAMPLES), ...Object.values(EXAMPLE_SETS).flat()].sort();
    expect(listGenBankFiles(EXAMPLES_DIR).sort()).toEqual(declared);
  });
});

// ---------------------------------------------------------------------------
// Coronaviruses — NC_045512.2, NC_004718.3, NC_019843.3
// ---------------------------------------------------------------------------

describe('examples/nucleotide/coronaviruses', () => {
  let records: SeqRecord[];
  beforeAll(() => {
    records = loadSet(EXAMPLE_SETS.coronaviruses);
  });

  it('classifies all three genomes as linear RNA', () => {
    expect(records.map(r => r.sequence.length)).toEqual([29903, 29751, 30119]);
    for (const r of records) {
      expect(r.moleculeType, r.id).toBe('rna');
      expect(r.isCircular, r.id).toBe(false);
    }
  });

  it('parses the SARS-CoV-2 mat_peptide and stem_loop feature types', () => {
    const h = typeHistogram([records[0]]);
    expect(h.CDS).toBe(12);
    expect(h.mat_peptide).toBe(26);
    expect(h.stem_loop).toBe(5);
    expect(h.gene).toBe(11);
  });

  it('finds the −1 ORF1ab frameshift in each genome, re-reading one shared base', () => {
    const slips = records.map(r =>
      cdsOf(r).flatMap(f => segmentFrameshifts(f).map(s => ({ ...s, feature: f }))),
    );
    expect(slips.map(s => s.map(({ position, shift }) => ({ position, shift })))).toEqual([
      [{ position: 13467, shift: -1 }],
      [{ position: 13391, shift: -1 }],
      [{ position: 13432, shift: -1 }],
    ]);
    for (const [i, [slip]] of slips.entries()) {
      const segs = slip.feature.segments!;
      expect(segs[0].end - 1).toBe(segs[1].start);
      expect(extractCodingSequence(slip.feature, records[i].sequence).codingSeq.length % 3).toBe(0);
    }
  });

  it('keeps the polymerase mat_peptide on the same slip base as its polyprotein', () => {
    for (const r of records) {
      const cdsSlip = cdsOf(r).flatMap(segmentFrameshifts)[0];
      const peptideSlips = r.features.filter(f => f.type === 'mat_peptide').flatMap(segmentFrameshifts);
      expect(peptideSlips, r.id).toEqual([cdsSlip]);
    }
  });

  it('translates every CDS, frameshifted ORF1ab included, to its stored /translation', () => {
    for (const r of records) {
      for (const f of cdsOf(r).filter(f => f.translation)) expect(translate(f, r), `${r.id} ${f.name}`).toBe(f.translation);
    }
  });

  it('passes alignment preflight as a nucleotide set', () => {
    expect(preflightAlignment(records, 'mafft').ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T7-like phages — NC_001604.1 (T7), NC_011045.1 (13a), NC_003298.1 (T3)
// ---------------------------------------------------------------------------

describe('examples/nucleotide/t7-phages', () => {
  let records: SeqRecord[];
  let t7: SeqRecord, phage13a: SeqRecord, t3: SeqRecord;
  beforeAll(() => {
    records = loadSet(EXAMPLE_SETS.t7Phages);
    [t7, phage13a, t3] = records;
  });

  it('parses three linear DNA genomes with their regulatory annotation', () => {
    expect(records.map(r => r.sequence.length)).toEqual([39937, 38841, 38208]);
    expect(records.map(r => r.features.length)).toEqual([162, 146, 155]);
    for (const r of records) {
      expect(r.moleculeType, r.id).toBe('dna');
      expect(r.isCircular, r.id).toBe(false);
    }
    expect(typeHistogram([t7])).toEqual({ source: 1, gene: 60, CDS: 60, mRNA: 5, regulatory: 26, misc_structure: 10 });
  });

  it('reads both a +1 and two −1 frameshifts from the T7 coordinates', () => {
    const slips = cdsOf(t7).flatMap(segmentFrameshifts);
    expect(slips).toEqual([
      { position: 1795, shift: 1 },
      { position: 17146, shift: -1 },
      { position: 23988, shift: -1 },
    ]);
  });

  it('finds the homologous −1 capsid frameshift (gene 10A/10B) in T7 and T3', () => {
    for (const r of [t7, t3]) {
      const capsid = cdsOf(r).find(f => f.name === 'major head protein' && (f.segments?.length ?? 0) === 2);
      expect(capsid, r.id).toBeDefined();
      expect(segmentFrameshifts(capsid!).map(s => s.shift), r.id).toEqual([-1]);
    }
  });

  it('treats the 13a DNA polymerase join as an intron, not a frameshift', () => {
    const split = cdsOf(phage13a).filter(f => (f.segments?.length ?? 0) > 1);
    expect(split).toHaveLength(1);
    const [a, b] = split[0].segments!;
    expect(b.start - a.end).toBe(601);
    expect(segmentFrameshifts(split[0])).toEqual([]);
  });

  it('parses the T3 stem_loop features', () => {
    expect(typeHistogram([t3]).stem_loop).toBe(10);
  });

  it('flags no CDS as broken in any of the three genomes', () => {
    for (const r of records) expect(cdsOf(r).filter(f => hasEarlyStop(f, r)).map(f => f.name), r.id).toEqual([]);
  });

  it('passes alignment preflight as a nucleotide set', () => {
    expect(preflightAlignment(records, 'mafft').ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T4-like phages — NC_000866.4 (T4), NC_054907.1 (T6), NC_054905.1 (Kha5h)
// ---------------------------------------------------------------------------

describe('examples/nucleotide/t4-phages', () => {
  let records: SeqRecord[];
  let t4: SeqRecord;
  beforeAll(() => {
    records = loadSet(EXAMPLE_SETS.t4Phages);
    [t4] = records;
  });

  it('parses three ~168 kb genomes with several hundred features each', () => {
    expect(records.map(r => r.sequence.length)).toEqual([168903, 168697, 167318]);
    expect(records.map(r => r.features.length)).toEqual([591, 547, 553]);
    expect(records.map(r => typeHistogram([r]).tRNA)).toEqual([8, 7, 10]);
  });

  it('places each T4 self-splicing intron exactly in the gap of its split CDS', () => {
    const introns = t4.features.filter(f => f.type === 'intron');
    expect(introns).toHaveLength(3);
    const split = cdsOf(t4).filter(f => (f.segments?.length ?? 0) === 2);
    for (const intron of introns) {
      const host = split.find(f => f.segments![0].end === intron.start && f.segments![1].start === intron.end);
      expect(host, intron.locationString).toBeDefined();
      expect(host!.strand).toBe(-1);
      expect(segmentFrameshifts(host!)).toEqual([]);
    }
  });

  it('keeps the gene 60 translational bypass as a 50-nt gap with no intron', () => {
    const gene60 = cdsOf(t4).find(f => f.locationString === 'complement(join(2458..2802,2853..2990))');
    expect(gene60).toBeDefined();
    const [a, b] = gene60!.segments!;
    expect(b.start - a.end).toBe(50);
    expect(t4.features.some(f => f.type === 'intron' && f.start < b.start && f.end > a.end)).toBe(false);
    expect(segmentFrameshifts(gene60!)).toEqual([]);
  });

  it('translates every reverse-strand split CDS to its stored /translation', () => {
    const split = cdsOf(t4).filter(f => (f.segments?.length ?? 0) > 1);
    expect(split).toHaveLength(4);
    for (const f of split) expect(translate(f, t4), f.name).toBe(f.translation);
  });

  it('flags no CDS as broken across all three genomes', () => {
    for (const r of records) expect(cdsOf(r).filter(f => hasEarlyStop(f, r)).map(f => f.name), r.id).toEqual([]);
  });

  it('fits the ~0.5 MB set inside the MAFFT payload limit', () => {
    const preflight = preflightAlignment(records, 'mafft');
    expect(preflight.ok).toBe(true);
    if (preflight.ok) expect(preflight.submission.bytes).toBeGreaterThan(500_000);
  });
});

// ---------------------------------------------------------------------------
// POMC orthologs — NP_000930.1 (human), NP_032921.1 (mouse), NP_776576.1 (cow)
// ---------------------------------------------------------------------------

describe('examples/peptide/pomc-orthologs', () => {
  let records: SeqRecord[];
  beforeAll(() => {
    records = loadSet(EXAMPLE_SETS.pomcOrthologs);
  });

  it('classifies all three precursors as protein', () => {
    expect(records.map(r => r.sequence.length)).toEqual([267, 235, 265]);
    for (const r of records) expect(r.moleculeType, r.id).toBe('protein');
  });

  it('opens each precursor with its signal peptide', () => {
    for (const r of records) {
      const signal = r.features.filter(f => f.type === 'sig_peptide');
      expect(signal, r.id).toHaveLength(1);
      expect(signal[0].start, r.id).toBe(0);
    }
  });

  it('nests mat_peptide cleavage products inside their parent hormones', () => {
    expect(records.map(r => typeHistogram([r]).mat_peptide)).toEqual([11, 10, 5]);
    for (const r of records) {
      const peptides = r.features.filter(f => f.type === 'mat_peptide');
      const nested = peptides.filter(inner =>
        peptides.some(outer => outer !== inner && outer.start <= inner.start && outer.end >= inner.end),
      );
      expect(nested.length, r.id).toBeGreaterThan(0);
    }
  });

  it('passes alignment preflight as a protein set', () => {
    expect(preflightAlignment(records, 'mafft').ok).toBe(true);
  });
});

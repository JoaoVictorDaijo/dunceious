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
 * End-to-end parser assertions over the protein (peptide-session) demo files.
 *
 * The nucleotide suite (examples.e2e.test.ts) never exercises the *protein*
 * session type: molecule-type classification from a LOCUS `aa` unit, the
 * peptide feature vocabulary (Protein / Region / Site / mat_peptide /
 * sig_peptide / proprotein), and `order(...)` discontiguous-residue locations
 * that only appear on protein Sites. These vendored NCBI RefSeq GenPept
 * snapshots (checked in, never re-downloaded at test time) close that blind
 * spot. Exact counts are pinned to the accession versions noted per describe
 * block.
 *
 * Scope mirrors the nucleotide suite: only behaviour the current code renders
 * CORRECTLY is asserted.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseGenBank } from '@/src/core/genbank/index';
import { detectMoleculeType, isProteinSession } from '@/src/domain/bio';
import type { SeqRecord } from '@/src/domain/bio/types';

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
// SARS-CoV-2 ORF1ab polyprotein — YP_009724389.1
// The densest peptide record: 15 mat_peptide cleavage products (nsp1..nsp16,
// minus the frameshift-only nsp11), plus Region/Site annotations whose Sites
// use order(...) discontiguous locations.
// ---------------------------------------------------------------------------

describe('examples/sars-cov-2-orf1ab-polyprotein-YP_009724389.gb', () => {
  const content = loadExample('sars-cov-2-orf1ab-polyprotein-YP_009724389.gb');
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

  it('classifies the LOCUS `aa` record as a protein session', () => {
    expect(records).toHaveLength(1);
    expect(record.moleculeType).toBe('protein');
    expect(record.isCircular).toBe(false);
    expect(record.sequence).toHaveLength(7096);
    // The whole session (this one record) is a peptide session, and the raw
    // residues alone classify as protein.
    expect(isProteinSession(records)).toBe(true);
    expect(detectMoleculeType(record.sequence)).toBe('protein');
  });

  it('parses the peptide feature set with the expected type histogram', () => {
    expect(record.features).toHaveLength(95);
    expect(typeHistogram(records)).toEqual({
      source: 1,
      Protein: 1,
      mat_peptide: 15,
      Region: 36,
      Site: 41,
      CDS: 1,
    });
  });

  it('tiles the polyprotein into contiguous mat_peptide cleavage products', () => {
    const mats = record.features.filter(f => f.type === 'mat_peptide');
    expect(mats).toHaveLength(15);
    // The nsps partition the polyprotein end-to-end: first starts at the N
    // terminus, last ends at the C terminus, and each abuts the next.
    const ordered = [...mats].sort((a, b) => a.start - b.start);
    expect(ordered[0].start).toBe(0);
    expect(ordered[ordered.length - 1].end).toBe(7096);
    for (let i = 1; i < ordered.length; i++) {
      expect(ordered[i].start, ordered[i].name).toBe(ordered[i - 1].end);
    }
    // Named products the viewer surfaces in the feature list.
    const names = new Set(mats.map(f => f.name));
    expect(names.has('leader protein')).toBe(true);
    expect(names.has('3C-like proteinase')).toBe(true);
    expect(names.has('RNA-dependent RNA polymerase')).toBe(true);
  });

  it('parses order(...) Site locations into discontiguous multi-segment features', () => {
    const multiSite = record.features.filter(
      f => f.type === 'Site' && (f.segments?.length ?? 0) > 1,
    );
    expect(multiSite.length).toBeGreaterThan(0);
    // The envelope brackets every segment: start ≤ min(seg.start), end ≥ max(seg.end).
    for (const f of multiSite) {
      const segs = f.segments!;
      expect(f.start).toBeLessThanOrEqual(Math.min(...segs.map(s => s.start)));
      expect(f.end).toBeGreaterThanOrEqual(Math.max(...segs.map(s => s.end)));
    }
  });
});

// ---------------------------------------------------------------------------
// SARS-CoV-2 spike glycoprotein — YP_009724390.1
// A signal-peptide-bearing surface protein; Region subunits + order(...) Sites.
// ---------------------------------------------------------------------------

describe('examples/sars-cov-2-spike-YP_009724390.gb', () => {
  const content = loadExample('sars-cov-2-spike-YP_009724390.gb');
  if (!content) {
    it.skip('fixture file not found', () => {});
    return;
  }

  let record: SeqRecord;
  beforeAll(() => {
    record = parseGenBank(content)[0];
  });

  it('classifies the record as a protein session with the spike sequence', () => {
    expect(record.moleculeType).toBe('protein');
    expect(record.sequence).toHaveLength(1273);
    // Spike opens with its cleaved signal peptide (MFVFLVLLPL…).
    expect(record.sequence.startsWith('MFVFLVLLPL')).toBe(true);
    expect(isProteinSession([record])).toBe(true);
  });

  it('parses the peptide feature set with the expected type histogram', () => {
    expect(record.features).toHaveLength(17);
    expect(typeHistogram([record])).toEqual({
      source: 1,
      Protein: 1,
      Region: 5,
      Site: 9,
      CDS: 1,
    });
  });

  it('parses multi-line order(...) Site locations spanning continuation lines', () => {
    const multiSite = record.features.filter(
      f => f.type === 'Site' && (f.segments?.length ?? 0) > 1,
    );
    expect(multiSite).toHaveLength(6);
  });
});

// ---------------------------------------------------------------------------
// Human insulin preproprotein — NP_000198.1
// The textbook processing cascade: sig_peptide → proprotein → mat_peptide
// chains, exercising the full peptide feature vocabulary in one tiny record.
// ---------------------------------------------------------------------------

describe('examples/human-insulin-NP_000198.gb', () => {
  const content = loadExample('human-insulin-NP_000198.gb');
  if (!content) {
    it.skip('fixture file not found', () => {});
    return;
  }

  let record: SeqRecord;
  beforeAll(() => {
    record = parseGenBank(content)[0];
  });

  it('classifies the 110 aa preproinsulin as a protein session', () => {
    expect(record.moleculeType).toBe('protein');
    expect(record.sequence).toHaveLength(110);
    expect(isProteinSession([record])).toBe(true);
  });

  it('parses the full processing-cascade feature vocabulary', () => {
    expect(record.features).toHaveLength(10);
    expect(typeHistogram([record])).toEqual({
      source: 1,
      Protein: 1,
      sig_peptide: 1,
      proprotein: 1,
      mat_peptide: 3,
      Region: 1,
      Site: 1,
      CDS: 1,
    });
  });

  it('places the signal peptide and the three insulin chains at the right residues', () => {
    const sig = record.features.find(f => f.type === 'sig_peptide')!;
    expect([sig.start, sig.end]).toEqual([0, 24]); // residues 1..24

    const chains = record.features
      .filter(f => f.type === 'mat_peptide')
      .sort((a, b) => a.start - b.start);
    expect(chains.map(f => [f.start, f.end])).toEqual([
      [24, 54], // B chain, residues 25..54
      [56, 87], // C-peptide, residues 57..87
      [89, 110], // A chain, residues 90..110
    ]);
    // The mature B chain begins with FVNQHL, immediately after the signal peptide.
    expect(record.sequence.slice(chains[0].start, chains[0].end).startsWith('FVNQHL')).toBe(true);
  });
});

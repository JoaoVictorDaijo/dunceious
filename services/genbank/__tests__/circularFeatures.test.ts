/**
 * Integration tests for circular GenBank data — focusing on wrap-around
 * features that cross the genome origin (start > end).
 *
 * These tests use a synthetic circular GenBank record that mimics a real
 * bacterial plasmid with a feature spanning the origin.
 */

import { describe, it, expect } from 'vitest';
import { parseGenBank } from '../index';

// ---------------------------------------------------------------------------
// Synthetic circular record – 6000 bp plasmid, feature crosses origin
// ---------------------------------------------------------------------------

const CIRCULAR_GB = `LOCUS       PLASMID1        6000 bp    DNA    circular   01-JAN-2024
DEFINITION  Synthetic circular plasmid with origin-crossing gene.
ACCESSION   PLASMID1
FEATURES             Location/Qualifiers
     source          1..6000
                     /organism="synthetic"
                     /mol_type="genomic DNA"
     gene            join(5500..6000,1..300)
                     /gene="wrapGene"
                     /note="crosses the origin"
     CDS             join(5500..6000,1..300)
                     /gene="wrapGene"
                     /product="WrapProtein"
                     /translation="MWRAP"
     gene            1000..2000
                     /gene="innerGene"
     CDS             complement(join(4700..5000,1..100))
                     /gene="compWrap"
                     /product="CompWrapProtein"
                     /translation="MCWRAP"
ORIGIN
        1 atgcatgcat gcatgcatgc atgcatgcat gcatgcatgc atgcatgcat
       61 gcatgcatgc atgcatgcat gcatgcatgc atgcatgcat gcatgcatgc
//
`;

describe('Circular GenBank – record-level properties', () => {
  it('parses successfully', () => {
    expect(() => parseGenBank(CIRCULAR_GB)).not.toThrow();
  });

  it('sets isCircular = true', () => {
    const [record] = parseGenBank(CIRCULAR_GB);
    expect(record.isCircular).toBe(true);
  });

  it('parses 5 features', () => {
    const [record] = parseGenBank(CIRCULAR_GB);
    expect(record.features).toHaveLength(5);
  });
});

describe('Circular GenBank – wrap-around gene (forward strand)', () => {
  it('wrapGene gene has start > end (signals wrap-around)', () => {
    const [record] = parseGenBank(CIRCULAR_GB);
    const gene = record.features.find(f => f.type === 'gene' && f.name === 'wrapGene');
    expect(gene).toBeDefined();
    expect(gene!.start).toBeGreaterThan(gene!.end);
  });

  it('wrapGene gene has exactly 2 segments', () => {
    const [record] = parseGenBank(CIRCULAR_GB);
    const gene = record.features.find(f => f.type === 'gene' && f.name === 'wrapGene');
    expect(gene!.segments).toHaveLength(2);
  });

  it('wrapGene first segment covers the end of the sequence', () => {
    const [record] = parseGenBank(CIRCULAR_GB);
    const gene = record.features.find(f => f.type === 'gene' && f.name === 'wrapGene');
    // join(5500..6000,…) → first segment: [5499, 6000)
    expect(gene!.segments![0].start).toBe(5499);
    expect(gene!.segments![0].end).toBe(6000);
  });

  it('wrapGene second segment covers the beginning of the sequence', () => {
    const [record] = parseGenBank(CIRCULAR_GB);
    const gene = record.features.find(f => f.type === 'gene' && f.name === 'wrapGene');
    // join(…,1..300) → second segment: [0, 300)
    expect(gene!.segments![1].start).toBe(0);
    expect(gene!.segments![1].end).toBe(300);
  });

  it('wrapGene CDS has /translation', () => {
    const [record] = parseGenBank(CIRCULAR_GB);
    const cds = record.features.find(f => f.type === 'CDS' && f.name === 'WrapProtein');
    expect(cds).toBeDefined();
    expect(cds!.translation).toBe('MWRAP');
  });

  it('wrapGene CDS strand is +1', () => {
    const [record] = parseGenBank(CIRCULAR_GB);
    const cds = record.features.find(f => f.type === 'CDS' && f.name === 'WrapProtein');
    expect(cds!.strand).toBe(1);
  });
});

describe('Circular GenBank – wrap-around gene (complement strand)', () => {
  it('compWrap CDS has strand -1', () => {
    const [record] = parseGenBank(CIRCULAR_GB);
    const cds = record.features.find(f => f.name === 'CompWrapProtein');
    expect(cds).toBeDefined();
    expect(cds!.strand).toBe(-1);
  });

  it('compWrap CDS has start > end (crosses origin)', () => {
    const [record] = parseGenBank(CIRCULAR_GB);
    const cds = record.features.find(f => f.name === 'CompWrapProtein');
    expect(cds!.start).toBeGreaterThan(cds!.end);
  });

  it('compWrap CDS has 2 segments', () => {
    const [record] = parseGenBank(CIRCULAR_GB);
    const cds = record.features.find(f => f.name === 'CompWrapProtein');
    expect(cds!.segments).toHaveLength(2);
  });
});

describe('Circular GenBank – non-wrapping inner feature', () => {
  it('innerGene has normal start < end', () => {
    const [record] = parseGenBank(CIRCULAR_GB);
    const gene = record.features.find(f => f.name === 'innerGene');
    expect(gene).toBeDefined();
    expect(gene!.start).toBeLessThan(gene!.end);
  });
});

// ---------------------------------------------------------------------------
// Round-trip: editing a wrap-around feature preserves start > end semantics
// ---------------------------------------------------------------------------

describe('Circular GenBank – wrap-around feature editing semantics', () => {
  it('modifying name does not alter start/end relationship', () => {
    const [record] = parseGenBank(CIRCULAR_GB);
    const original = record.features.find(f => f.type === 'gene' && f.name === 'wrapGene')!;
    // Simulate an in-memory edit (what FeatureEditorModal does)
    const edited = { ...original, name: 'renamedGene' };
    // The wrap-around relationship must be preserved
    expect(edited.start).toBeGreaterThan(edited.end);
  });

  it('wrap-around feature locationString is preserved', () => {
    const [record] = parseGenBank(CIRCULAR_GB);
    const gene = record.features.find(f => f.type === 'gene' && f.name === 'wrapGene')!;
    expect(gene.locationString).toBe('join(5500..6000,1..300)');
  });
});

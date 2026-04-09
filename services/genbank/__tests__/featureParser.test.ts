import { describe, it, expect } from 'vitest';
import { parseFeatures } from '../featureParser';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function wrapInRecord(featuresBlock: string): string[] {
  return [
    'LOCUS       TEST   100 bp',
    'FEATURES             Location/Qualifiers',
    ...featuresBlock.split('\n'),
    'ORIGIN',
  ];
}

// ---------------------------------------------------------------------------
// Basic parsing
// ---------------------------------------------------------------------------

describe('parseFeatures – basic', () => {
  it('returns an empty array when there is no FEATURES section', () => {
    expect(parseFeatures(['LOCUS T', 'ORIGIN'])).toHaveLength(0);
  });

  it('parses a single simple feature', () => {
    const lines = wrapInRecord(
      '     gene            1..20\n' +
      '                     /gene="testGene"',
    );
    const features = parseFeatures(lines);
    expect(features).toHaveLength(1);
    expect(features[0].type).toBe('gene');
    expect(features[0].name).toBe('testGene');
    expect(features[0].start).toBe(0);
    expect(features[0].end).toBe(20);
  });

  it('preserves locationString on the feature', () => {
    const lines = wrapInRecord('     gene            5..50\n                     /gene="g1"');
    expect(parseFeatures(lines)[0].locationString).toBe('5..50');
  });

  it('parses multiple features in order', () => {
    const block =
      '     gene            1..50\n                     /gene="A"\n' +
      '     CDS             51..100\n                     /product="B"';
    const features = parseFeatures(wrapInRecord(block));
    expect(features).toHaveLength(2);
    expect(features[0].name).toBe('A');
    expect(features[1].name).toBe('B');
  });
});

// ---------------------------------------------------------------------------
// Multi-line location
// ---------------------------------------------------------------------------

describe('parseFeatures – multi-line location', () => {
  it('joins a multi-line join() location', () => {
    const block =
      '     gene            join(1..10,\n' +
      '                     21..30)\n' +
      '                     /gene="splitGene"';
    const features = parseFeatures(wrapInRecord(block));
    expect(features).toHaveLength(1);
    expect(features[0].segments).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Qualifier edge cases
// ---------------------------------------------------------------------------

describe('parseFeatures – qualifiers', () => {
  it('stores /translation on the feature and in metadata', () => {
    const block =
      '     CDS             1..20\n' +
      '                     /translation="MTEST"';
    const [f] = parseFeatures(wrapInRecord(block));
    expect(f.translation).toBe('MTEST');
    expect(f.metadata!['translation']).toBe('MTEST');
  });

  it('last NAME_QUALIFIER wins for the display name', () => {
    // /gene is set first, then /product overwrites name
    const block =
      '     CDS             1..30\n' +
      '                     /gene="GENE1"\n' +
      '                     /product="PROD1"';
    const [f] = parseFeatures(wrapInRecord(block));
    expect(f.name).toBe('PROD1');
  });

  it('stores unknown qualifiers in metadata', () => {
    const block =
      '     misc_feature    10..20\n' +
      '                     /note="custom note"';
    const [f] = parseFeatures(wrapInRecord(block));
    expect(f.metadata!['note']).toBe('custom note');
  });
});

// ---------------------------------------------------------------------------
// Circular/wrap-around features
// ---------------------------------------------------------------------------

describe('parseFeatures – circular wrap-around', () => {
  it('parses a join crossing the origin (start > end)', () => {
    const block =
      '     gene            join(2427..3000,1..500)\n' +
      '                     /gene="wrapGene"';
    const [f] = parseFeatures(wrapInRecord(block));
    expect(f.name).toBe('wrapGene');
    expect(f.start).toBeGreaterThan(f.end);
    expect(f.segments).toHaveLength(2);
  });

  it('circular feature segments preserve order (high first)', () => {
    const block = '     gene            join(4500..5000,1..200)';
    const [f] = parseFeatures(wrapInRecord(block));
    expect(f.segments![0].start).toBe(4499);
    expect(f.segments![1].end).toBe(200);
  });

  it('complement circular join has strand -1 and start > end', () => {
    const block = '     gene            complement(join(4800..5000,1..300))';
    const [f] = parseFeatures(wrapInRecord(block));
    expect(f.strand).toBe(-1);
    expect(f.start).toBeGreaterThan(f.end);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('parseFeatures – edge cases', () => {
  it('parses non-word feature keys like 5\'UTR', () => {
    const lines = wrapInRecord(
      '     5\'UTR           1..42\n' +
      '                     /gene="utrA"',
    );
    const features = parseFeatures(lines);
    expect(features).toHaveLength(1);
    expect(features[0].type).toBe("5'UTR");
    expect(features[0].name).toBe('utrA');
    expect(features[0].start).toBe(0);
    expect(features[0].end).toBe(42);
  });

  it('handles a feature with no qualifiers', () => {
    const lines = wrapInRecord('     source          1..100');
    const features = parseFeatures(lines);
    expect(features).toHaveLength(1);
    expect(features[0].type).toBe('source');
    // name falls back to the type string
    expect(features[0].name).toBe('source');
  });

  it('stops at ORIGIN section', () => {
    // Any lines after ORIGIN should not be parsed as features
    const lines = [
      'LOCUS T',
      'FEATURES             Location/Qualifiers',
      '     gene            1..10',
      '                     /gene="early"',
      'ORIGIN',
      '     gene            100..200',  // must NOT be parsed
    ];
    const features = parseFeatures(lines);
    expect(features).toHaveLength(1);
    expect(features[0].name).toBe('early');
  });
});

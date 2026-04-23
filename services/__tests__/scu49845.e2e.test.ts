/**
 * End-to-end tests using the real SCU49845.gb fixture (Saccharomyces cerevisiae).
 *
 * Purpose: guarantee that the full parse → align → transpose pipeline works
 * correctly on a genuine GenBank file that exercises paths not covered by the
 * minimal inline fixtures used elsewhere:
 *   - multi-line DEFINITION and /translation qualifiers
 *   - partial/fuzzy location  (<1..206)
 *   - complement() strand  (REV7 at complement(3300..4037))
 *   - feature naming via /gene vs /product qualifiers
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseGenBank } from '../genbank/index';
import { exportToGenBank } from '../bioUtils';
import { processTransposition } from '../../src/domain/bio/index';
import { degenerateToRegex } from '../searchLogic';
import type { SeqRecord } from '../../types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCU49845_CONTENT = readFileSync(resolve(__dirname, '../../SCU49845.gb'), 'utf-8');

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

describe('SCU49845.gb – record structure', () => {
  let record: SeqRecord;

  beforeAll(() => {
    const records = parseGenBank(SCU49845_CONTENT);
    record = records[0];
  });

  it('parses exactly one record', () => {
    expect(parseGenBank(SCU49845_CONTENT)).toHaveLength(1);
  });

  it('sets the locus id to SCU49845', () => {
    expect(record.id).toBe('SCU49845');
  });

  it('captures the multi-line DEFINITION', () => {
    expect(record.definition).toContain('Saccharomyces cerevisiae');
    expect(record.definition).toContain('TCP1-beta');
    expect(record.definition).toContain('AXL2');
    expect(record.definition).toContain('REV7');
  });

  it('parses the full 5028 bp sequence', () => {
    expect(record.sequence).toHaveLength(5028);
  });

  it('uppercases the sequence', () => {
    expect(record.sequence).toBe(record.sequence.toUpperCase());
  });

  it('sets isCircular to false (PLN/linear record)', () => {
    expect(record.isCircular).toBe(false);
  });

  it('parses all 6 features (source, TCP1-beta CDS, AXL2 gene+CDS, REV7 gene+CDS)', () => {
    expect(record.features).toHaveLength(6);
  });
});

// ---------------------------------------------------------------------------
// Feature coordinates and strands
// ---------------------------------------------------------------------------

describe('SCU49845.gb – feature coordinates', () => {
  let record: SeqRecord;

  beforeAll(() => {
    [record] = parseGenBank(SCU49845_CONTENT);
  });

  it('source feature spans the whole record [0, 5028)', () => {
    const source = record.features.find(f => f.type === 'source');
    expect(source).toBeDefined();
    expect(source!.start).toBe(0);
    expect(source!.end).toBe(5028);
    expect(source!.strand).toBe(1);
  });

  it('TCP1-beta CDS: partial location <1..206 → 0-based [0, 206)', () => {
    const cds = record.features.find(f => f.name === 'TCP1-beta');
    expect(cds).toBeDefined();
    expect(cds!.type).toBe('CDS');
    expect(cds!.start).toBe(0);
    expect(cds!.end).toBe(206);
    expect(cds!.strand).toBe(1);
  });

  it('AXL2 gene: 687..3158 → 0-based [686, 3158)', () => {
    const gene = record.features.find(f => f.type === 'gene' && f.name === 'AXL2');
    expect(gene).toBeDefined();
    expect(gene!.start).toBe(686);
    expect(gene!.end).toBe(3158);
    expect(gene!.strand).toBe(1);
  });

  it('AXL2 CDS: same coordinates and forward strand as the gene', () => {
    // /product="Axl2p" is processed after /gene="AXL2" so name ends up as 'Axl2p'
    const cds = record.features.find(f => f.type === 'CDS' && f.start === 686);
    expect(cds).toBeDefined();
    expect(cds!.start).toBe(686);
    expect(cds!.end).toBe(3158);
    expect(cds!.strand).toBe(1);
  });

  it('REV7 gene: complement(3300..4037) → strand -1, 0-based [3299, 4037)', () => {
    const gene = record.features.find(f => f.type === 'gene' && f.name === 'REV7');
    expect(gene).toBeDefined();
    expect(gene!.start).toBe(3299);
    expect(gene!.end).toBe(4037);
    expect(gene!.strand).toBe(-1);
  });

  it('REV7 CDS: complement strand -1, same coordinates as the gene', () => {
    // /product="Rev7p" is processed after /gene="REV7" so name ends up as 'Rev7p'
    const cds = record.features.find(f => f.type === 'CDS' && f.start === 3299);
    expect(cds).toBeDefined();
    expect(cds!.start).toBe(3299);
    expect(cds!.end).toBe(4037);
    expect(cds!.strand).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// Translation qualifiers (multi-line /translation values)
// ---------------------------------------------------------------------------

describe('SCU49845.gb – /translation qualifiers', () => {
  let record: SeqRecord;

  beforeAll(() => {
    [record] = parseGenBank(SCU49845_CONTENT);
  });

  it('TCP1-beta CDS has a translation starting with SSIYN', () => {
    const cds = record.features.find(f => f.name === 'TCP1-beta');
    expect(cds!.translation).toBeDefined();
    expect(cds!.translation).toMatch(/^SSIYN/);
  });

  it('AXL2 CDS has a translation starting with MTQLQ (methionine start codon)', () => {
    const cds = record.features.find(f => f.type === 'CDS' && f.start === 686);
    expect(cds!.translation).toBeDefined();
    expect(cds!.translation).toMatch(/^MTQLQ/);
  });

  it('REV7 CDS has a translation starting with MNRWV', () => {
    const cds = record.features.find(f => f.type === 'CDS' && f.start === 3299);
    expect(cds!.translation).toBeDefined();
    expect(cds!.translation).toMatch(/^MNRWV/);
  });

  it('multi-line /translation values are joined without whitespace', () => {
    const cds = record.features.find(f => f.type === 'CDS' && f.start === 686);
    // If line-joining left spaces the translation would contain ' '
    expect(cds!.translation).not.toMatch(/\s/);
  });
});

// ---------------------------------------------------------------------------
// Full pipeline: parse → processTransposition
// ---------------------------------------------------------------------------

describe('SCU49845.gb – parse → processTransposition pipeline', () => {
  let original: SeqRecord;
  let transposed: SeqRecord;

  beforeAll(() => {
    [original] = parseGenBank(SCU49845_CONTENT);
    // Use an identity alignment (alignedSequence = sequence, no gaps introduced)
    const aligned = { ...original, alignedSequence: original.sequence };
    [transposed] = processTransposition([aligned]);
  });

  it('processTransposition preserves the number of features', () => {
    expect(transposed.features).toHaveLength(original.features.length);
  });

  it('feature strands are preserved through the pipeline', () => {
    // Use the gene features (unambiguous names) to check strand preservation
    const rev7Gene = transposed.features.find(f => f.name === 'REV7' && f.type === 'gene');
    expect(rev7Gene!.strand).toBe(-1);

    const axl2Gene = transposed.features.find(f => f.name === 'AXL2' && f.type === 'gene');
    expect(axl2Gene!.strand).toBe(1);
  });

  it('transposed AXL2 start coordinate matches original (identity alignment has no gaps)', () => {
    const origStart = original.features.find(f => f.name === 'AXL2' && f.type === 'gene')!.start;
    const transStart = transposed.features.find(f => f.name === 'AXL2' && f.type === 'gene')!.start;
    expect(transStart).toBe(origStart);
  });

  it('every transposed feature has segments set by processTransposition', () => {
    transposed.features.forEach(f => {
      expect(f.segments).toBeDefined();
      expect(f.segments!.length).toBeGreaterThan(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Search on parsed sequence
// ---------------------------------------------------------------------------

describe('SCU49845.gb – sequence search', () => {
  let record: SeqRecord;

  beforeAll(() => {
    [record] = parseGenBank(SCU49845_CONTENT);
  });

  it('finds the first 10 bases of the sequence at position 0', () => {
    const first10 = record.sequence.slice(0, 10); // 'GATCCTCCAT'
    const re = degenerateToRegex(first10);
    re.lastIndex = 0;
    const match = re.exec(record.sequence);
    expect(match).not.toBeNull();
    expect(match!.index).toBe(0);
  });

  it('AXL2 start codon ATG is present at position 686 (0-based)', () => {
    expect(record.sequence.slice(686, 689)).toBe('ATG');
  });
});

// ---------------------------------------------------------------------------
// GenBank round-trip: parse → export → parse
// ---------------------------------------------------------------------------

describe('SCU49845.gb – GenBank round-trip', () => {
  it('produces output byte-for-byte equal to the original file', () => {
    const [original] = parseGenBank(SCU49845_CONTENT);
    const exported = exportToGenBank([original]);
    expect(exported).toBe(SCU49845_CONTENT);
  });
});

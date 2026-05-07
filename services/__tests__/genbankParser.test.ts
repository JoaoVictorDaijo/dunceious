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

import { describe, it, expect } from 'vitest';
import { parseGenBank } from '../genbank/index';

// ---------------------------------------------------------------------------
// Minimal inline GenBank fixture (avoids filesystem I/O in unit tests)
// ---------------------------------------------------------------------------

const MINIMAL_GB = `LOCUS       TEST001       30 bp    DNA             LIN       01-JAN-2024
DEFINITION  Test record for smoke test.
ACCESSION   TEST001
FEATURES             Location/Qualifiers
     gene            1..20
                     /gene="testGene"
     CDS             1..20
                     /product="test protein"
                     /translation="MTEST"
ORIGIN
        1 atgcatgcat gcatgcatgc atgcatgcat
//
`;

// ---------------------------------------------------------------------------
// smoke test: parseGenBank – basic parsing
// ---------------------------------------------------------------------------

describe('parseGenBank – smoke tests', () => {
  it('parses a single record and returns an array', () => {
    const records = parseGenBank(MINIMAL_GB);
    expect(records).toHaveLength(1);
  });

  it('extracts the locus id', () => {
    const [record] = parseGenBank(MINIMAL_GB);
    expect(record.id).toBe('TEST001');
  });

  it('extracts the definition as name', () => {
    const [record] = parseGenBank(MINIMAL_GB);
    // definition is > 30 chars so name is truncated to 27 + '...'
    expect(record.definition).toContain('Test record');
  });

  it('extracts the nucleotide sequence (uppercase, digits/spaces stripped)', () => {
    const [record] = parseGenBank(MINIMAL_GB);
    expect(record.sequence).toBe('ATGCATGCATGCATGCATGCATGCATGCAT');
  });

  it('ignores non-sequence symbols in ORIGIN lines', () => {
    const noisyGb = `LOCUS       NOISY001      12 bp    DNA\nORIGIN\n        1 atgc..nnnn**\n//\n`;
    const [record] = parseGenBank(noisyGb);
    expect(record.sequence).toBe('ATGCNNNN**');
  });

  it('parses features with correct coordinates (0-based half-open)', () => {
    const [record] = parseGenBank(MINIMAL_GB);
    // gene feature: location 1..20 → 0-based [0, 20)
    const gene = record.features.find(f => f.type === 'gene');
    expect(gene).toBeDefined();
    expect(gene!.start).toBe(0);
    expect(gene!.end).toBe(20);
  });

  it('assigns /gene qualifier as feature name', () => {
    const [record] = parseGenBank(MINIMAL_GB);
    const gene = record.features.find(f => f.type === 'gene');
    expect(gene!.name).toBe('testGene');
  });

  it('stores /product qualifier in metadata', () => {
    const [record] = parseGenBank(MINIMAL_GB);
    const cds = record.features.find(f => f.type === 'CDS');
    expect(cds!.metadata!['product']).toBe('test protein');
  });

  it('stores /translation qualifier on the feature', () => {
    const [record] = parseGenBank(MINIMAL_GB);
    const cds = record.features.find(f => f.type === 'CDS');
    expect(cds!.translation).toBe('MTEST');
  });

  it('returns empty array for empty input', () => {
    expect(parseGenBank('')).toHaveLength(0);
    expect(parseGenBank('   \n  ')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// smoke test: parseGenBank – multi-record input
// ---------------------------------------------------------------------------

describe('parseGenBank – multi-record input', () => {
  const TWO_RECORDS = `LOCUS       REC1       10 bp    DNA
ORIGIN
        1 aaaaaaaaaa
//
LOCUS       REC2       10 bp    DNA
ORIGIN
        1 tttttttttt
//
`;

  it('parses two records from a multi-record file', () => {
    const records = parseGenBank(TWO_RECORDS);
    expect(records).toHaveLength(2);
    expect(records[0].id).toBe('REC1');
    expect(records[1].id).toBe('REC2');
  });

  it('parses sequence for each record independently', () => {
    const records = parseGenBank(TWO_RECORDS);
    expect(records[0].sequence).toBe('AAAAAAAAAA');
    expect(records[1].sequence).toBe('TTTTTTTTTT');
  });
});

// ---------------------------------------------------------------------------
// smoke test: parseGenBank – join / multi-segment location
// ---------------------------------------------------------------------------

describe('parseGenBank – join location', () => {
  const JOIN_GB = `LOCUS       JOIN001       30 bp    DNA
FEATURES             Location/Qualifiers
     gene            join(1..10,21..30)
                     /gene="splitGene"
ORIGIN
        1 atgcatgcat gcatgcatgc atgcatgcat
//
`;

  it('creates multiple segments for a join() location', () => {
    const [record] = parseGenBank(JOIN_GB);
    const gene = record.features.find(f => f.type === 'gene');
    expect(gene).toBeDefined();
    expect(gene!.segments).toBeDefined();
    expect(gene!.segments!.length).toBeGreaterThanOrEqual(2);
  });

  it('assigns the envelope start/end to the join feature', () => {
    const [record] = parseGenBank(JOIN_GB);
    const gene = record.features.find(f => f.type === 'gene');
    // join(1..10, 21..30) → 0-based envelope start=0, end=30
    expect(gene!.start).toBe(0);
    expect(gene!.end).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// smoke test: parseGenBank – circular flag
// ---------------------------------------------------------------------------

describe('parseGenBank – circular detection', () => {
  const CIRC_GB = `LOCUS       CIRC001       30 bp    DNA    circular
ORIGIN
        1 atgcatgcat gcatgcatgc atgcatgcat
//
`;

  it('sets isCircular = true for circular records', () => {
    const [record] = parseGenBank(CIRC_GB);
    expect(record.isCircular).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// smoke test: parseGenBank – complement() strand
// ---------------------------------------------------------------------------

describe('parseGenBank – complement strand', () => {
  const COMP_GB = `LOCUS       COMP001       30 bp    DNA
FEATURES             Location/Qualifiers
     gene            complement(10..20)
                     /gene="revGene"
     CDS             5..15
                     /gene="fwdCds"
ORIGIN
        1 atgcatgcat gcatgcatgc atgcatgcat
//
`;

  it('assigns strand -1 to a complement() feature', () => {
    const [record] = parseGenBank(COMP_GB);
    const gene = record.features.find(f => f.name === 'revGene');
    expect(gene).toBeDefined();
    expect(gene!.strand).toBe(-1);
  });

  it('assigns correct 0-based coordinates for a complement() feature', () => {
    const [record] = parseGenBank(COMP_GB);
    const gene = record.features.find(f => f.name === 'revGene');
    // complement(10..20) → 0-based [9, 20)
    expect(gene!.start).toBe(9);
    expect(gene!.end).toBe(20);
  });

  it('assigns strand +1 to a non-complement feature in the same record', () => {
    const [record] = parseGenBank(COMP_GB);
    const cds = record.features.find(f => f.name === 'fwdCds');
    expect(cds!.strand).toBe(1);
  });
});

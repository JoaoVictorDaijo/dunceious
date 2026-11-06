/*
 * Dunceious
 * Copyright (C) 2026 João Victor Daijo and Murilo Cassiano
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
import { handleBioMessage } from '@/src/workers/handlers/bio';
import { parseGenBank } from '../index';

const gb = (sequence = 'acgt', feature = '', locus = 'X 4 bp DNA') => `LOCUS       ${locus}
FEATURES             Location/Qualifiers
${feature}ORIGIN
        1 ${sequence}
//
`;

describe('GenBank validation boundary (INSDC 11.4)', () => {
  it('keeps accepted layout and determines category from the unit', () => {
    const result = parseGenBank(gb('acgt', '', 'AA 4 bp DNA'));
    expect(result.findings).toEqual([]);
    expect(result.records[0]).toMatchObject({ sequence: 'ACGT', moleculeType: 'dna' });
  });
  it.each(['ac-gt', 'ac.gt', 'ac*gt', 'ac1gt', 'ac?gt'])('refuses %s without removing characters', seq => {
    const result = parseGenBank(gb(seq));
    expect(result.findings).toEqual(expect.arrayContaining([expect.objectContaining({ tier: 'refuse', code: 'invalid-residue', message: expect.stringContaining('3') })]));
  });
  it('collects defects in later features and records after a broken quote', () => {
    const result = parseGenBank(gb('acgt', `     CDS             1..4
                     /note="abc
                     /codon_start=4
     gene            1..2x0
`) + gb('aaa'));
    expect(result.findings.map(f => f.code)).toEqual(expect.arrayContaining(['malformed-qualifier', 'malformed-location', 'length-mismatch']));
    expect(result.findings.filter(f => f.code === 'invalid-frame')).toHaveLength(0);
  });
  // order() (LOC-2), n^n+1 (LOC-5) and versioned remote intervals (LOC-8) are read since #306.
  it.each(['join(1^2,3..4)', 'order(1..2,3..4)', '2^3', 'AB123.1:1..4', 'join(1..2,AB123.1:5..9)'])('reads %s without a refusal', loc => {
    expect(parseGenBank(gb('acgt', `     gene            ${loc}
`)).findings.filter(f => f.tier === 'refuse')).toEqual([]);
  });
  it('reads 4^1 as a site only on a circular 4 bp record', () => {
    const site = (topology: string) => parseGenBank(gb('acgt', `     gene            4^1
`, `X 4 bp DNA ${topology}`)).findings.filter(f => f.tier === 'refuse');
    expect(site('circular')).toEqual([]);
    expect(site('linear')).toEqual([expect.objectContaining({ code: 'malformed-location' })]);
  });
  it.each(['2.3', 'AB123.1:2.3', 'AB123.1:2^3', 'AB123.1:10^11'])('refuses unsupported %s', loc => {
    expect(parseGenBank(gb('acgt', `     gene            ${loc}
`)).findings).toEqual(expect.arrayContaining([expect.objectContaining({ tier: 'refuse', code: 'unsupported-location' })]));
  });
  it.each(['1..2x0', '0..4', '1..5', '>1..4', '1..<4', 'join(1..2,order(3,4))', '2^4', 'join(2^3,3..2)', 'AB123:1..4', 'AB123.1:0..4', 'AB123.1:4..2', 'join(1..2,AB123.1:9..5)'])('refuses incorrect %s', loc => {
    expect(parseGenBank(gb('acgt', `     gene            ${loc}
`)).findings.some(f => f.tier === 'refuse' && f.code !== 'unsupported-location')).toBe(true);
  });
  it('makes unknown qualifiers inert while retaining label naming', () => {
    const result = parseGenBank(gb('acgt', `     CDS             1..4
                     /label="A"
                     /phase=1
                     /_gffStrand="."
`));
    expect(result.findings).toEqual([]);
    expect(result.records[0].features[0]).toMatchObject({ name: 'A', strand: 1, metadata: {}, unknownQualifiers: { label: 'A', phase: '1', _gffStrand: '.' } });
  });
  it('refuses missing mandatory nucleotide qualifiers but accepts protein source without mol_type', () => {
    expect(parseGenBank(gb('acgt', `     source          1..4
`)).findings.filter(f => f.code === 'mandatory-qualifier')).toHaveLength(2);
    expect(parseGenBank(gb('MKUX', `     source          1..4
                     /organism="human"
`, 'P 4 aa')).findings).toEqual([]);
  });
});

it.each([
  ['LOCUS X 4 bp DNA\nORIGIN\n 1 acgt\n', 'missing-terminator'],
  ['LOCUS X 4 bp DNA\nORIGIN\n 1 acgt//', 'missing-terminator'],
  ['ORIGIN\n 1 acgt\n//', 'missing-locus'],
  ['LOCUS X bp DNA\nORIGIN\n 1 acgt\n//', 'missing-length'],
  ['LOCUS X 4 bp DNA\nORIGIN\n//', 'no-sequence'],
  ['LOCUS X 4 bp DNA\nCONTIG join(AB:1..4)\n//', 'contig-only'],
  ['LOCUS X 4 bp DNA\nORIGIN\nCONTIG join(AB:1..4)\n//', 'contig-only'],
])('reports structure: %s', (text, code) => {
  expect(parseGenBank(text).findings.map(f => f.code)).toContain(code);
});
it('reports all tags and no wrong-key warning for an unknown key', () => {
  const result = parseGenBank(gb('acgt', `     my_feature      1..4
                     /gene="A"
                     /gene="B"
                     /codon_start=4
     gene            1..4
                     /codon_start=2
`));
  expect(result.findings.map(f => f.code)).toEqual(['repeated-qualifier', 'unknown-feature-key', 'wrong-key-qualifier']);
});
it('handles conditional mandatory and alternative mandatory qualifiers', () => {
  const result = parseGenBank(gb('acgt', `     assembly_gap    1..4
                     /estimated_length=4
                     /gap_type="within scaffold"
     old_sequence    1..4
                     /compare=AB123.1
`));
  expect(result.findings.filter(f => f.code === 'mandatory-qualifier').map(f => f.message)).toEqual(['assembly_gap has no /linkage_evidence.']);
});
it.each(['', '0', '4', '2junk'])('retains invalid frame %s as a warning', value => {
  const result = parseGenBank(gb('acgt', `     CDS             1..4
                     /codon_start="${value}"
`));
  expect(result.findings.map(f => f.code)).toContain('invalid-frame');
  expect(result.records[0].features[0].metadata?.codon_start).toBe(value);
});
it('detects duplicate names, mixed categories and a missing location independently', () => {
  const result = parseGenBank(gb('acgt', '     gene\n     CDS             1..4\n') + gb('MKUX', '', 'X 4 aa'));
  expect(result.findings.map(f => f.code)).toEqual(expect.arrayContaining(['missing-location', 'duplicate-locus', 'molecule-mixture']));
});
it.each(['<1..>4', 'complement(join(1..2,3..4))'])('accepts %s', loc => {
  expect(parseGenBank(gb('acgt', `     gene            ${loc}\n`)).findings).toEqual([]);
});
it('accepts a long count column and ungrouped residues', () => {
  const sequence = 'a'.repeat(120000);
  const result = parseGenBank(`LOCUS X 120000 bp DNA\nORIGIN\n        1 ${sequence.slice(0,119999)}\n   120000 a\n//`);
  expect(result.findings).toEqual([]);
  expect(result.records[0].sequence).toHaveLength(120000);
});

it('rejects a trailing empty compound element and a quote closed by another qualifier', () => {
  const result = parseGenBank(gb('acgt', `     gene            join(1..2,)
     CDS             1..4
                     /note="unfinished
                     /gene="A"
`));
  expect(result.findings.map(f => f.code)).toEqual(expect.arrayContaining(['malformed-location', 'malformed-qualifier']));
});

it('treats object-prototype names as ordinary unknown input names', () => {
  const result = parseGenBank(gb('acgt', `     constructor     1..4
                     /__proto__="inert"
`));
  expect(result.findings.map(f => f.code)).toEqual(['unknown-feature-key']);
  expect(result.records[0].features[0].unknownQualifiers?.__proto__).toBe('inert');
});

it('accepts the UniProt POMC slash-text continuation inside an open note', () => {
  const result = parseGenBank(gb('acgt', `     CDS             1..4
                     /note="O-linked (HexNAc...) threonine.
                     /evidence=ECO:0000269|PubMed:6267033; propagated from
                     UniProtKB/Swiss-Prot (P01189.2)"
`));
  expect(result.findings).toEqual([]);
  expect(result.records[0].features[0].metadata?.note).toBe('O-linked (HexNAc...) threonine. /evidence=ECO:0000269|PubMed:6267033; propagated from UniProtKB/Swiss-Prot (P01189.2)');
});

it('accepts escaped quoted qualifier text within a multiline note (INSDC §3.3.3.1)', () => {
  const result = parseGenBank(`LOCUS       Q 4 bp DNA
FEATURES             Location/Qualifiers
     gene            1..4
                     /note="example qualifier
                     /gene=""foo""
                     is literal text"
ORIGIN
        1 acgt
//
`);
  expect(result.findings).toEqual([]);
  expect(result.records[0].features[0].metadata?.note).toBe('example qualifier /gene="foo" is literal text');
});

it.each([
  'LOCUS A 4 bp DNA\nORIGIN\n 1 acgt\nCONTIG join(AB:1..4)\nLOCUS B 4 bp DNA\nORIGIN\n 1 ttt\n//\n',
  'LOCUS A 4 bp DNA\nLOCUS B 4 bp DNA\nORIGIN\n 1 ttt\n//\n',
])('refuses an unterminated entry and validates the next LOCUS independently: %s', content => {
  const response = handleBioMessage({ type: 'PARSE_GENBANK', filename: 'broken.gb', content });
  expect(response.type).toBe('PARSE_REFUSED');
  if (response.type !== 'PARSE_REFUSED') throw new Error('Expected a whole-file refusal');
  expect(response.records.map(r => r.id)).toEqual(['A', 'B']);
  expect(response.records[1].sequence).toBe('TTT');
  expect(response.findings).toEqual(expect.arrayContaining([
    expect.objectContaining({ tier: 'refuse', code: 'missing-terminator', record: { name: 'A', index: 1 }, message: 'Record A has no // before the next LOCUS.' }),
    expect.objectContaining({ tier: 'refuse', code: 'length-mismatch', record: { name: 'B', index: 2 } }),
  ]));
});

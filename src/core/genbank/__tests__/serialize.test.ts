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
import type { SeqRecord } from '@/src/domain/bio/types';
import { parseGenBank } from '../index';
import { exportToGenBank } from '../serialize';
import { sliceRecordsBySelection } from '@/src/domain/bio/intervals';
import { conceptualTranslation } from '@/src/domain/bio/translation';
import { parseLocation } from '../locationParser';
import { featureCoordPatch } from '@/src/app/logic/viewModel';
import { readFileSync } from 'node:fs';

function record(overrides: Partial<SeqRecord> = {}): SeqRecord {
  return { id: 'REC1', name: 'Record 1', sequence: 'ATGCAAATAG', features: [], ...overrides };
}

describe('exportToGenBank', () => {
  it('writes a DNA LOCUS with a de-duplicated Dunceious definition marker', () => {
    const gb = exportToGenBank([record({
      definition: 'Sample seq Exported by Dunceious.',
      features: [{
        type: 'source', name: 'source', start: 0, end: 10, strand: 1,
        metadata: { organism: 'E. coli', _internal: 'hidden', empty: '' },
      }],
    })]).text;
    expect(gb).toContain('LOCUS');
    expect(gb).toContain('bp    DNA');
    // Marker must appear exactly once (not accumulated on re-export).
    expect(gb.match(/Exported by Dunceious\./g)).toHaveLength(1);
    expect(gb).toContain('ORGANISM  E. coli');
    // '_'-prefixed and empty non-flag metadata are omitted; real qualifier is kept.
    expect(gb).toContain('/organism="E. coli"');
    expect(gb).not.toContain('_internal');
    expect(gb).not.toContain('/empty=');
    expect(gb.trimEnd().endsWith('//')).toBe(true);
  });

  it('writes INSDC flag qualifiers bare and still drops other empty values', () => {
    const gb = exportToGenBank([record({
      features: [{ type: 'CDS', name: 'pp1ab', start: 0, end: 10, strand: 1,
        metadata: { ribosomal_slippage: '', pseudo: '', note: '' } }],
    })]).text;
    expect(gb).toContain('                     /ribosomal_slippage\n');
    expect(gb).toContain('                     /pseudo\n');
    expect(gb).not.toContain('/note');
  });

  it('round-trips the /ribosomal_slippage flag through parse and export', () => {
    const gb = exportToGenBank([record({ features: [{ type: 'CDS', name: 'pp1ab', start: 0, end: 10, strand: 1,
      metadata: { ribosomal_slippage: '' } }] })]).text;
    const [rec] = parseGenBank(gb).records;
    expect(rec.features.find(f => f.type === 'CDS')?.metadata?.ribosomal_slippage).toBe('');
  });

  it('writes a protein LOCUS using "aa" units', () => {
    const gb = exportToGenBank([record({ moleculeType: 'protein', sequence: 'MKV' })]).text;
    expect(gb).toContain(' aa ');
    expect(gb).not.toContain('DNA');
  });

  it('renders the ORIGIN block and feature locations (plus, complement, passthrough)', () => {
    const gb = exportToGenBank([record({
      sequence: 'ATGCAAATAG', // 10 bp
      features: [
        { type: 'CDS', name: 'fwd', start: 0, end: 6, strand: 1 },
        { type: 'CDS', name: 'rev', start: 2, end: 8, strand: -1 },
        { type: 'gene', name: 'joined', start: 0, end: 8, strand: 1, locationString: 'join(1..3,6..8)' },
      ],
    })]).text;
    // ORIGIN: 1-based line number right-justified to width 9, then the
    // lowercased sequence in 10-base groups.
    expect(gb).toContain('        1 atgcaaatag');
    // strand +1 reconstructs '1..6'; strand -1 reconstructs 'complement(3..8)';
    // an explicit locationString is passed through verbatim.
    expect(gb).toContain('1..6');
    expect(gb).toContain('complement(3..8)');
    expect(gb).toContain('join(1..3,6..8)');
  });
});


describe('custom annotation roundtrip', () => {
  it.each([1, -1] as const)('retains a custom primer name, region and strand %s', strand => {
    const source = record({ features: [{ type: 'primer', name: 'Synthetic primer', start: 1, end: 8, strand }] });
    const snapshot = structuredClone(source);
    const parsed = parseGenBank(exportToGenBank([source]).text).records;
    expect(parsed[0].features.find(f => f.type === 'primer')).toMatchObject(source.features[0]);
    expect(parsed[0].sequence).toBe(source.sequence);
    expect(source).toEqual(snapshot);
  });
});


it.each(['.', '?'])('refuses to invent a GenBank location strand for GFF %s', raw => {
  const source = record({ features: [{ type: 'misc_feature', name: 'Unknown synthetic', start: 1, end: 8, strand: 1, metadata: { _gffStrand: raw } }] });
  expect(() => exportToGenBank([source]).text).toThrow(/Export GFF3 or project JSON/);
});

it('roundtrips a newly created reverse annotation with separate segments', () => {
  const source = record({ features: [{ type: 'misc_feature', name: 'Joined synthetic', start: 1, end: 9, strand: -1, segments: [{ start: 1, end: 3 }, { start: 6, end: 9 }] }] });
  const exported = exportToGenBank([source]).text;
  expect(exported).toContain('complement(join(2..3,7..9))');
  expect(parseGenBank(exported).records[0].features.find(f => f.type === 'misc_feature')).toMatchObject(source.features[0]);
});


describe('GenBank location writing', () => {
  it.each([
    'complement(join(complement(1..2),5..6))',
    'complement(join(complement(1..2),complement(5..6)))',
    'complement(order(complement(1..2),5..6))',
  ])('writes unedited %s verbatim after import', location => {
    const [source] = parseGenBank(`LOCUS       R 8 bp DNA circular
FEATURES             Location/Qualifiers
     misc_feature    ${location}
                     /label=nested
ORIGIN
        1 aaccggtt
//`).records;
    expect(source.sequence).toBe('AACCGGTT');
    const exported = exportToGenBank([source]).text;
    expect(exported.split('\n').filter(line => line.startsWith('     misc_feature')))
      .toEqual([`     misc_feature    ${location}`]);
  });

  it('writes explicit interval complements in evaluation order when raw text is absent', () => {
    const source = record({ features: [{ type: 'misc_feature', name: 'nested', start: 0, end: 6, strand: 1,
      segments: [{ start: 4, end: 6, strand: -1 }, { start: 0, end: 2, strand: 1 }] }] });
    expect(exportToGenBank([source]).text).toContain('     misc_feature    join(complement(5..6),1..2)\n');
  });
});

it('skips invalid geometry and linear edge sites but exports interior sites', () => {
  const result = exportToGenBank([record({ features: [
    { type: 'gene', name: 'edge', start: 0, end: 0, strand: 1 },
    { type: 'gene', name: 'invalid', start: 8, end: 2, strand: 1 },
    { type: 'gene', name: 'site', start: 5, end: 5, strand: 1 },
  ] })]);
  expect(result.text).not.toContain('standard_name="edge"');
  expect(result.text).not.toContain('standard_name="invalid"');
  expect(result.text).toContain('gene            5^6');
  expect(result.report.featuresWithoutInsdcLocation).toEqual({ linearEdgeSite: 1, invalidGeometry: 1 });
});

it('exports circular origin sites and exports wrapped explicit pieces as joins', () => {
  const result = exportToGenBank([record({ isCircular: true, features: [
    { name: 'site', type: 'gene', start: 10, end: 10, strand: 1 },
    { name: 'wrap', type: 'gene', start: 8, end: 2, strand: 1, segments: [{ start: 8, end: 2 }] },
  ] })]);
  expect(result.text).toContain('gene            10^1');
  expect(result.text).toContain('gene            join(9..10,1..2)');
  expect(result.report.featuresWithoutInsdcLocation).toEqual({ linearEdgeSite: 0, invalidGeometry: 0 });

});

// Rebuilding a location without its source text (after an edit or a selection export) must write
// the INSDC form that was read. Oracles: Biopython 1.88 writes O1 back as order(1..3,11..13) and S1
// as 10^11 (docs/standards/conformance); §3.4.2.1 permits length^1 on a circular molecule.
describe('exportToGenBank – rebuilt operators and sites', () => {
  const locationLine = (feature: Partial<SeqRecord['features'][number]>, overrides: Partial<SeqRecord> = {}) =>
    exportToGenBank([record({
      sequence: 'A'.repeat(30),
      features: [{ type: 'misc_feature', name: 'f', start: 0, end: 0, strand: 1, ...feature }],
      ...overrides,
    })]).text.split('\n').find(line => line.startsWith('     misc_feature'))?.slice(21);

  it.each([
    [{ operator: 'order' as const, start: 0, end: 13, segments: [{ start: 0, end: 3 }, { start: 10, end: 13 }] }, 'order(1..3,11..13)'],
    [{ operator: 'order' as const, strand: -1 as const, start: 0, end: 13, segments: [{ start: 0, end: 3 }, { start: 10, end: 13 }] }, 'complement(order(1..3,11..13))'],
    [{ operator: 'join' as const, start: 0, end: 13, segments: [{ start: 0, end: 3 }, { start: 10, end: 13 }] }, 'join(1..3,11..13)'],
    [{ betweenBases: true as const, start: 10, end: 10, segments: [{ start: 10, end: 10 }] }, '10^11'],
    [{ betweenBases: true as const, strand: -1 as const, start: 10, end: 10, segments: [{ start: 10, end: 10 }] }, 'complement(10^11)'],
  ])('writes %o as %s', (feature, location) => {
    expect(locationLine(feature)).toBe(location);
  });

  it('writes a site at the end of a circular record as length^1', () => {
    expect(locationLine({ betweenBases: true, start: 30, end: 30, segments: [{ start: 30, end: 30 }] }, { isCircular: true })).toBe('30^1');
  });

  it('writes a site whose edit gave it a width as the span', () => {
    expect(locationLine({ betweenBases: true, start: 10, end: 12, segments: [{ start: 10, end: 12 }] })).toBe('11..12');
  });

  it('round-trips an edited order() feature through parse and export', () => {
    const [parsed] = parseGenBank(exportToGenBank([record({ sequence: 'A'.repeat(30), features: [{
      type: 'Site', name: 's', operator: 'order', start: 31, end: 108, strand: 1,
      segments: [{ start: 1, end: 3 }, { start: 9, end: 12 }],
    }] })]).text).records;
    expect(parsed.features.find(f => f.type === 'Site')).toMatchObject({ operator: 'order', locationString: 'order(2..3,10..12)' });
  });
});

// LOC-4: an edit keeps both markers, including on the end whose number changed (owner decision 12).
// SCU49845's TCP1-beta CDS is <1..206.
describe('exportToGenBank – partial ends after an edit', () => {
  it('writes <1..180 after the end of <1..206 is edited to 180', () => {
    const [parsed] = parseGenBank(readFileSync('src/core/__tests__/fixtures/SCU49845.gb', 'utf8')).records;
    const cds = parsed.features.find(f => f.type === 'CDS' && f.locationString === '<1..206')!;
    const edited = { ...cds, ...featureCoordPatch(cds, 'end', '180'), locationString: undefined };
    const text = exportToGenBank([{ ...parsed, features: [edited] }]).text;
    expect(text.split('\n')).toContain(`${'CDS'.padStart(8).padEnd(21)}<1..180`);
  });

  it('writes the markers of a mixed-strand join back where they were read', () => {
    const parsed = parseLocation('join(<1..6,complement(10..>12))');
    const text = exportToGenBank([record({ sequence: 'A'.repeat(20), features: [{ type: 'misc_feature', name: 'f', strand: parsed.strand,
      start: parsed.start, end: parsed.end, segments: parsed.segments, operator: parsed.operator }] })]).text;
    expect(text).toContain('join(<1..6,complement(10..>12))');
  });
});

// #241: with the text cleared, the written order rebuilds the nested form that was read, so a
// re-import reads the same written order (the evaluated form of J4 would read as an origin crossing).
describe('exportToGenBank – nested locations without their text', () => {
  it.each([
    'complement(join(complement(1..2),5..6))',
    'complement(join(complement(1..2),complement(5..6)))',
    'join(1..5,complement(join(10..20,30..40)))',
  ])('writes %s back from its written order', location => {
    const parsed = parseLocation(location);
    const text = exportToGenBank([record({ sequence: 'A'.repeat(40), features: [{ type: 'misc_feature', name: 'n', strand: parsed.strand,
      start: parsed.start, end: parsed.end, segments: parsed.segments, operator: parsed.operator, writtenOrder: parsed.writtenOrder }] })]).text;
    expect(text.split('\n')).toContain(`${'misc_feature'.padStart(17).padEnd(21)}${location}`);
  });
});

// #245: with the text cleared, remote parts are written back where they were read (§3.4.3).
describe('exportToGenBank – remote parts without their text', () => {
  it.each([
    'join(1..100,J00194.1:100..202)',
    'complement(join(1..100,J00194.1:100..202))',
    'join(complement(J00194.1:100..202),1..100)',
  ])('writes %s back', location => {
    const parsed = parseLocation(location);
    const text = exportToGenBank([record({ sequence: 'A'.repeat(120), features: [{ type: 'misc_feature', name: 'r', strand: parsed.strand,
      start: parsed.start, end: parsed.end, segments: parsed.segments, operator: parsed.operator, remoteParts: parsed.remoteParts }] })]).text;
    expect(text.split('\n')).toContain(`${'misc_feature'.padStart(17).padEnd(21)}${location}`);
  });
});

it('omits damaged gap residues without shifting features and keeps a clean LOCUS at four bp', () => {
  const output = exportToGenBank([record({ id: 'bad', sequence: 'AC-GT' }), record({ id: 'dot', sequence: 'AC.GT' }), record({ id: 'clean', sequence: 'ACGT' })]);
  expect(output.report.gapRecordsOmitted).toEqual(['bad', 'dot']);
  expect(output.text).not.toContain('bad');
  expect(output.text).not.toContain('dot');
  expect(output.text).toMatch(/^LOCUS\s+clean\s+4 bp/m);
  expect(output.text).toContain('        1 acgt\n');
});

it.each([
  ['symbol', 'AC*GT', {}, 'its sequence contains non-residue characters'],
  ['punctuation', 'ACRGT?', {}, 'its sequence contains non-residue characters'],
  ['frame', 'ACRGT', { codon_start: '4' }, 'CDS bad has an invalid /codon_start'],
  ['emptyframe', 'ACRGT', { codon_start: '' }, 'CDS bad has an invalid /codon_start'],
  ['code', 'ACRGT', { transl_table: '99' }, 'CDS bad has an invalid /transl_table'],
  ['emptycode', 'ACRGT', { transl_table: '' }, 'CDS bad has an invalid /transl_table'],
])('omits and reports %s with clean LOCUS and ORIGIN untouched', (id, sequence, metadata, reason) => {
  const good: SeqRecord = { id: 'good', name: 'good', sequence: 'ACRGT', features: [] };
  const bad: SeqRecord = { id, name: id, sequence, features: [{ type: 'CDS', name: 'bad', start: 0, end: sequence.length, strand: 1, metadata }] };
  const output = exportToGenBank([bad, good]);
  expect(output.text.match(/^LOCUS.*$/gm)).toEqual([expect.stringMatching(/^LOCUS\s+good\s+5 bp/)]);
  expect(output.text).toContain('acrgt');
  expect(output.report.genBankRecordsOmitted).toEqual([{ id, reason: `${id} not exported: ${reason}` }]);
  expect(exportToGenBank([bad]).text).toBe('');
});

it('applies the protein alphabet in the real GenPept writer without dropping valid ambiguity codes', () => {
  const result = exportToGenBank([record({ id: 'stop', moleculeType: 'protein', sequence: 'MKV*' }), record({ id: 'protein', moleculeType: 'protein', sequence: 'MKUXBZJO' })]);
  expect(result.report.genBankRecordsOmitted).toEqual([{ id: 'stop', reason: 'stop not exported: its sequence contains non-residue characters' }]);
  expect(result.text.match(/^LOCUS.*$/gm)).toEqual([expect.stringMatching(/^LOCUS\s+protein\s+8 aa/)]);
  expect(result.text).toContain('mkuxbzjo');
});

it.each([
  { start: 10, end: 10, segments: [{ start: 10, end: 10 }], isCircular: false, betweenBases: true as const, location: '10^11' },
  { start: 120, end: 120, segments: [{ start: 120, end: 120 }], isCircular: true, betweenBases: true as const, location: '120^1' },
  { start: 1, end: 1, segments: [{ start: 1, end: 1 }], isCircular: true, length: 1, betweenBases: true as const, location: '1^1' },
  { start: 0, end: 20, segments: [{ start: 0, end: 3 }, { start: 10, end: 10 }, { start: 15, end: 20 }], isCircular: false, location: 'join(1..3,10^11,16..20)' },
])('round-trips site geometry through GenBank: $location', ({ start, end, segments, isCircular, length = 120, betweenBases, location }) => {
  const result = exportToGenBank([record({ sequence: 'A'.repeat(length), isCircular,
    features: [{ type: 'source', name: 'source', start: 0, end: length, strand: 1, metadata: { organism: 'Test organism', mol_type: 'genomic DNA' } }, { type: 'misc_feature', name: 'roundtrip', start, end, strand: 1, segments, betweenBases }] })]);
  expect(result.text).toContain(`misc_feature    ${location}`);
  const parsed = parseGenBank(result.text);
  expect(parsed.findings.filter(f => f.tier === 'refuse')).toEqual([]);
  const roundtrip = parsed.records[0].features.find(f => f.name === 'roundtrip');
  expect(roundtrip).toMatchObject({ start, end, segments });
  expect(roundtrip?.betweenBases).toBe(betweenBases);
});

it.each([
  [{ start: 9, end: 6, partialStart: true as const }, 1 as const, 'join(<10..12,1..6)', 'LK'],
  [{ start: 9, end: 6, partialEnd: true as const, strand: -1 as const }, -1 as const, 'join(complement(1..>6),complement(10..12))', 'LFQ'],
])('preserves wrapped partial markers through GenBank reimport: %s', (segment, strand, location, residues) => {
  const r = record({ sequence: 'AAATAACCCCTG', isCircular: true, fileDetails: { organism: 'synthetic construct' }, features: [
    { type: 'CDS', name: 'partial', start: 9, end: 6, strand, segments: [segment] },
    { type: 'source', name: 'source', start: 0, end: 12, strand: 1, metadata: { organism: 'synthetic construct', mol_type: 'genomic DNA' } },
  ] });
  expect(conceptualTranslation(r.features[0], r)).toMatchObject({ status: 'ok', residues });
  const text = exportToGenBank([r]).text;
  expect(text).toContain(location);
  const imported = parseGenBank(text);
  expect(imported.findings.filter(f => f.tier === 'refuse')).toEqual([]);
  expect(conceptualTranslation(imported.records[0].features.find(f => f.type === 'CDS')!, imported.records[0])).toMatchObject({ status: 'ok', residues });
});


it.each([
  { segment: { start: 12, end: 6, partialStart: true as const }, strand: 1 as const,
    location: '<1..6', residues: 'LK', kept: { start: 0, end: 6, partialStart: true } },
  { segment: { start: 9, end: 0, partialEnd: true as const }, strand: 1 as const,
    location: '10..>12', residues: 'M', kept: { start: 9, end: 12, partialEnd: true } },
  { segment: { start: 12, end: 6, partialStart: true as const, strand: -1 as const }, strand: -1 as const,
    location: 'complement(<1..6)', residues: 'FQ', kept: { start: 0, end: 6, partialStart: true, strand: -1 } },
  { segment: { start: 9, end: 0, partialEnd: true as const, strand: -1 as const }, strand: -1 as const,
    location: 'complement(10..>12)', residues: 'Q', kept: { start: 9, end: 12, partialEnd: true, strand: -1 } },
])('retains empty-piece partial markers at $location through selection and reimport', ({ segment, strand, location, residues, kept }) => {
  const r = record({ sequence: 'CTGAAACCCCTG', isCircular: true, features: [
    { type: 'CDS', name: 'partial', start: segment.start, end: segment.end, strand, segments: [segment], metadata: { translation: residues } },
    { type: 'source', name: 'source', start: 0, end: 12, strand: 1, metadata: { organism: 'synthetic construct', mol_type: 'genomic DNA' } },
  ] });
  expect(conceptualTranslation(r.features[0], r)).toMatchObject({ status: 'ok', residues });
  const selected = sliceRecordsBySelection([r], 0, 12);
  expect(selected.losses).toEqual([]);
  expect(selected.records[0].features[0].segments).toEqual([kept]);
  expect(selected.records[0].features[0].metadata?.translation).toBe(residues);
  expect(conceptualTranslation(selected.records[0].features[0], selected.records[0])).toMatchObject({ status: 'ok', residues });
  for (const records of [[r], selected.records]) {
    const text = exportToGenBank(records).text;
    expect(text).toContain(`CDS             ${location}`);
    const imported = parseGenBank(text);
    expect(imported.findings.filter(f => f.tier === 'refuse')).toEqual([]);
    const cds = imported.records[0].features.find(f => f.type === 'CDS')!;
    const { strand: _strand, ...bounds } = kept;
    expect(cds.segments).toEqual([bounds]);
    expect(conceptualTranslation(cds, imported.records[0])).toMatchObject({ status: 'ok', residues });
  }
});

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
import type { BioFeature, SeqRecord } from '@/src/domain/bio/types';
import { exportToGenBank } from '../serialize';
import { parseGenBank } from '../index';

const feature = (metadata: Record<string, string> = {}): BioFeature => ({ type: 'CDS', name: 'primer F3', start: 0, end: 4, strand: 1, metadata });
const record = (extra: Partial<SeqRecord> = {}): SeqRecord => ({ id: 'local', name: 'local', sequence: 'ACGT', features: [], ...extra });
const source = (metadata: Record<string, string>): BioFeature => ({ ...feature(metadata), type: 'source', name: 'source' });
const annotations = (text: string) => parseGenBank(text)[0].features.filter(f => f.type !== 'source');

describe('GenBank format contract', () => {
  it('writes exact syntax for numeric qualifiers, flags and escaped quotes', () => {
    const { text } = exportToGenBank([record({ features: [feature({ codon_start: '2', transl_table: '11', pseudo: '', note: 'isolate "A" from camel' })] })]);
    expect(text).toContain('/codon_start=2\n');
    expect(text).toContain('/transl_table=11\n');
    expect(text).toContain('/pseudo\n');
    expect(text).toContain('/note="isolate ""A"" from camel"');
  });

  it('wraps a 200-character note at word boundaries and preserves its value', () => {
    const note = 'camel isolate alpha '.repeat(10).trim() + '.';
    expect(note).toHaveLength(200);
    const { text } = exportToGenBank([record({ features: [feature({ note })] })]);
    expect(text.split('\n').filter(line => line.startsWith(' '.repeat(21))).every(line => line.length <= 79)).toBe(true);
    expect(annotations(text)[0].metadata?.note).toBe(note);
  });

  it('keeps an overlong text token unbroken and wraps translation without introducing spaces', () => {
    const note = 'A'.repeat(120);
    const translation = 'M'.repeat(200);
    const { text } = exportToGenBank([record({ features: [feature({ note, translation })] })]);
    expect(text).toContain(note);
    expect(annotations(text)[0].metadata).toMatchObject({ note, translation });
    expect(text.split('\n').filter(line => line.trim().startsWith('/translation')).every(line => line.length <= 79)).toBe(true);
  });

  it('drops non-INSDC metadata, counts each key, and silently omits internal keys', () => {
    const { text, report } = exportToGenBank([record({ features: [feature({ phase: '0', score: '5', ID: 'x', _internal: 'hidden' })] })]);
    expect(text).not.toMatch(/\/(phase|score|ID|_internal)=/);
    expect(report.droppedAttributes).toBe(3);
  });

  it('keeps GenPept qualifiers and omits mol_type for proteins', () => {
    const { text } = exportToGenBank([record({ moleculeType: 'protein', features: [source({ organism: 'virus', mol_type: 'protein' }), feature({ calculated_mol_wt: '12345', region_name: 'domain', site_type: 'active', coded_by: 'X:1..12' })] })]);
    expect(text).toContain('/calculated_mol_wt=12345');
    expect(text).toContain('/region_name="domain"');
    expect(text).toContain('/site_type="active"');
    expect(text).toContain('/coded_by="X:1..12"');
    expect(text).not.toContain('/mol_type');
  });

  it.each(['dna', 'rna'] as const)('adds required source information for unannotated %s', moleculeType => {
    const { text, report } = exportToGenBank([record({ moleculeType })]);
    expect(text).toContain('     source          1..4');
    expect(text).toContain(`/mol_type="unassigned ${moleculeType.toUpperCase()}"`);
    expect(text).toContain('SOURCE      .');
    expect(text).toContain('  ORGANISM  .');
    expect(report.missingOrganism).toBe(1);
  });

  it('omits invalid edited details and preserves unchanged submitter values', () => {
    const invalid = record({ fileDetails: { collectionDate: '2014' }, features: [source({ collection_date: 'March 2014' })] });
    const unchanged = record({ id: 'file', fileDetails: { collectionDate: '21-Mar-2014T10:30Z', location: 'USSR' }, features: [source({ collection_date: '21-Mar-2014T10:30Z', country: 'USSR' })] });
    const { text, report } = exportToGenBank([invalid, unchanged]);
    expect(text).not.toContain('March 2014');
    expect(text).toContain('/collection_date="21-Mar-2014T10:30Z"');
    expect(text).toContain('/country="USSR"');
    expect(report.invalidDetailsOmitted.collectionDate).toBe(1);
    expect(report.writtenDetails.collectionDate).toBe(1);
    expect(report.writtenDetails.location).toBe(1);
  });

  it('writes accession and version independently and never exports display labels', () => {
    const { text } = exportToGenBank([record({ accession: 'U49845', version: 'U49845.2', label: 'private display label' }), record({ id: 'other' })]);
    expect(text).toContain('ACCESSION   U49845\nVERSION     U49845.2');
    expect(text).toContain('ACCESSION   .\nKEYWORDS');
    expect(text.match(/^VERSION/gm)).toHaveLength(1);
    expect(text).not.toContain('private display label');
  });

  it('does not derive a database accession from LOCUS', () => {
    const [parsed] = parseGenBank('LOCUS       local 4 bp DNA\nORIGIN\n        1 acgt\n//');
    expect(parsed.accession).toBeUndefined();
    expect(parsed.version).toBeUndefined();
    expect(exportToGenBank([parsed]).text).toContain('ACCESSION   .');
  });

  it('preserves custom names through the valid standard_name qualifier', () => {
    const { text } = exportToGenBank([record({ features: [feature()] })]);
    expect(text).toContain('/standard_name="primer F3"');
    expect(text).not.toContain('/label=');
    expect(annotations(text)[0].name).toBe('primer F3');
  });

  it('round-trips an origin-crossing circular feature with its segments', () => {
    const f: BioFeature = { type: 'gene', name: 'wrap', start: 899, end: 100, strand: 1 };
    const { text } = exportToGenBank([record({ sequence: 'A'.repeat(1000), isCircular: true, features: [f] })]);
    expect(text).toContain('join(900..1000,1..100)');
    expect(annotations(text)[0].segments).toEqual([{ start: 899, end: 1000 }, { start: 0, end: 100 }]);
  });

  it('round-trips a quoted multi-line note to the exact joined value', () => {
    const [r] = parseGenBank(`LOCUS       X 4 bp DNA
FEATURES             Location/Qualifiers
     CDS             1..4
                     /note="isolate ""A"" from camel
                     sampled in Saudi Arabia
                     near a farm"
ORIGIN
        1 acgt
//`);
    const before = r.features[0].metadata!.note;
    expect(before).toBe('isolate "A" from camel sampled in Saudi Arabia near a farm');
    expect(annotations(exportToGenBank([r]).text)[0].metadata!.note).toBe(before);
  });
});


it('quotes organelle controlled values as in the INSDC examples', () => {
  const { text } = exportToGenBank([record({ features: [source({ organelle: 'mitochondrion:kinetoplast' })] })]);
  expect(text).toContain('/organelle="mitochondrion:kinetoplast"');
});

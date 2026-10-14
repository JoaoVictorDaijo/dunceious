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
import type { SeqRecord } from '@/src/domain/bio/types';
import { writeDetails } from '@/src/domain/bio/details';
import { exportToGenBank } from '@/src/core/genbank/serialize';
import { exportToFasta } from '@/src/core/formats/fasta';
import { initialExportSelection, describeExport, serializeExport } from '../exportPlan';

const records: SeqRecord[] = ['a', 'b', 'c'].map(id => ({ id, name: id, sequence: 'ACGT', features: [
  { type: 'gene', name: id === 'b' ? 'spike' : 'other', start: 0, end: 4, strand: 1 },
  { type: 'CDS', name: 'protein', start: 0, end: 3, strand: 1 },
] }));
const filters = { query: '', sequenceQuery: '', strand: 'all' as const, types: new Set<string>(), needsAttention: false };

it('starts from selected workspace records even with active filters and stale selection IDs', () => {
  const result = initialExportSelection({ records, selectedRecords: new Set(['a', 'c', 'gone']), filters: { ...filters, query: 'spike' } });
  expect(result).toEqual({ preset: 'selected', ids: new Set(['a', 'c']) });
});
it('starts from matching sections when annotation or sequence filters are active', () => {
  expect(initialExportSelection({ records, selectedRecords: new Set(), filters: { ...filters, query: 'spike' } })).toEqual({ preset: 'filtered', ids: new Set(['b']) });
  expect(initialExportSelection({ records, selectedRecords: new Set(), filters: { ...filters, onlyIds: new Set(['c']) } }).ids).toEqual(new Set(['c']));
});
it('keeps an empty filtered preset empty and otherwise selects all', () => {
  expect(initialExportSelection({ records, selectedRecords: new Set(), filters: { ...filters, query: 'absent' } })).toEqual({ preset: 'filtered', ids: new Set() });
  expect(initialExportSelection({ records, selectedRecords: new Set(['gone']), filters })).toEqual({ preset: 'all', ids: new Set(['a', 'b', 'c']) });
});
it('uses visible problem groups for the Features tab filtered preset', () => {
  const input = records.map((r, i) => writeDetails({ ...r, features: i === 2 ? [] : [{ type: 'gene', name: 'spike', start: 0, end: i === 0 ? 4 : 3, strand: 1 }] }, { organism: 'virus' }));
  expect(initialExportSelection({ records: input, selectedRecords: new Set(), filters, tab: 'features', onlyProblems: true })).toEqual({ preset: 'filtered', ids: new Set(['a', 'b']) });
});
describe('serializer previews', () => {
  it('reports real invalid edits and missing organisms from GenBank', () => {
    const r = writeDetails(records[0], { collectionDate: 'March 2014' });
    const result = describeExport([r], 'genbank', {});
    expect(result.report).toEqual(exportToGenBank([r]).report);
    expect(result.report.invalidDetailsOmitted.collectionDate).toBe(1);
    expect(result.summary).toContain('1 invalid edited detail left out');
    expect(result.summary).toContain('1 sequence has no organism; NCBI validation will reject this file, though most viewers open it');
  });
  it('runs the chosen FASTA options, including modifier omissions', () => {
    const r = { ...writeDetails(records[0], { host: 'camel' }), alignedSequence: 'A-CGT', fastaModifiers: { country: 'Oman', note: 'retained' } };
    const options = { residues: 'aligned' as const, header: 'details' as const };
    expect(describeExport([r], 'fasta', options).report).toEqual(exportToFasta([r], options).report);
    expect(serializeExport([r], 'fasta', options).text).toContain('A-CGT');
    expect(serializeExport([r], 'fasta', {}).text).toBe('>a\nACGT');
  });
  it.each(['genbank', 'gff3'] as const)('filters %s annotations while retaining source details and biological coordinates', format => {
    const r = writeDetails({ ...records[0], alignedSequence: '--ACGT' }, { organism: 'virus' });
    const before = structuredClone(r);
    const result = serializeExport([r], format, { types: new Set(['gene']), matchingKeys: new Set(['a:0']) });
    expect(result.report.writtenDetails.organism).toBe(1);
    expect(result.text).not.toContain('protein');
    expect(result.text).toContain(format === 'genbank' ? 'gene            1..4' : '\tgene\t1\t4\t');
    expect(r).toEqual(before);
  });
  it('keeps source and every annotation for project exports despite annotation options', () => {
    const r = { ...writeDetails(records[0], { collectionDate: 'invalid' }), label: 'local display', fileDetails: { collectionDate: '2014' } };
    const result = serializeExport([r], 'project', { types: new Set(), matchingKeys: new Set(), projectState: { featureColors: { gene: '#123' }, showAnnotations: false, showTranslation: true, showConservation: false } });
    const saved = JSON.parse(result.text);
    expect(saved.records).toEqual([r]);
    expect(saved.featureColors).toEqual({ gene: '#123' });
    expect(saved.showTranslation).toBe(true);
    expect(result.report.invalidDetailsOmitted.collectionDate).toBe(0);
  });
  it('an explicit empty type choice exports no annotations while keeping source', () => {
    const r = writeDetails(records[0], { organism: 'virus' });
    expect(serializeExport([r], 'gff3', { types: new Set() }).text).not.toContain('\tgene\t');
    expect(serializeExport([r], 'gff3', { types: new Set() }).report.writtenDetails.organism).toBe(1);
  });
});


it.each(['genbank', 'genpept', 'gff3', 'fasta'] as const)('does not leak annotation edit marks into %s', format => {
  const original = { ...records[0], moleculeType: format === 'genpept' ? 'protein' as const : 'dna' as const };
  const marked = { ...original, features: original.features.map((feature, index) => ({ ...feature, hubEdit: index ? 'added' as const : 'edited' as const })) };
  const dispatch = format === 'genpept' ? 'genbank' : format;
  expect(serializeExport([marked], dispatch).text).toBe(serializeExport([original], dispatch).text);
  expect(serializeExport([marked], dispatch).text).not.toContain('hubEdit');
});
it('stores annotation edit marks in project format 2', () => {
  const record = { ...records[0], features: [{ ...records[0].features[0], hubEdit: 'added' as const }] };
  const saved = JSON.parse(serializeExport([record], 'project').text);
  expect(saved.records[0].features[0].hubEdit).toBe('added');
});

it('reports dangling GFF3 relationships removed by annotation subset filters in the preview', () => {
  const input: SeqRecord = { id: 's', name: 's', sequence: 'ATG', features: [
    { type: 'gene', name: 'g', start: 0, end: 3, strand: 1, metadata: { ID: 'g' } },
    { type: 'CDS', name: 'c', start: 0, end: 3, strand: 1, metadata: { ID: 'c', Parent: 'g' } },
  ] };
  const preview = describeExport([input], 'gff3', { types: new Set(['CDS']) });
  expect(preview.report.droppedAttributes).toBe(1);
  expect(preview.summary).toContain('1 non-GenBank attributes left out.');
  expect(serializeExport([input], 'gff3', { types: new Set(['CDS']) }).text).not.toContain('Parent=');
});

it('does not replace an excluded local GFF3 parent with a reused ID from another record', () => {
  const input = ['a', 'b'].map((id): SeqRecord => ({ id, name: id, sequence: 'ATG', features: [
    { type: 'gene', name: 'g', start: 0, end: 3, strand: 1, metadata: { ID: 'g' } },
    { type: 'CDS', name: 'c', start: 0, end: 3, strand: 1, metadata: { ID: 'c', Parent: 'g' } },
  ] }));
  const options = { matchingKeys: new Set(['a:1', 'b:0']) };
  const { text, report } = serializeExport(input, 'gff3', options);
  expect(text).not.toContain('Parent=');
  expect(report.droppedAttributes).toBe(1);
});

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

import { createOriginCrossingRecord } from '@/src/app/testing/fixtures/originCrossing';
import { describe, it, expect } from 'vitest';
import type { SeqRecord } from '@/src/domain/bio/types';
import { writeDetails } from '@/src/domain/bio/details';
import { parseGenBank } from '@/src/core/genbank';
import { parseGFF3 } from '@/src/core/formats/gff3';
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


it.each(['genbank', 'genpept', 'fasta'] as const)('does not leak annotation edit marks into %s', format => {
  const original = { ...records[0], moleculeType: format === 'genpept' ? 'protein' as const : 'dna' as const };
  const marked = { ...original, features: original.features.map((feature, index) => ({ ...feature, hubEdit: index ? 'added' as const : 'edited' as const })) };
  const dispatch = format === 'genpept' ? 'genbank' : format;
  expect(serializeExport([marked], dispatch).text).toBe(serializeExport([original], dispatch).text);
  expect(serializeExport([marked], dispatch).text).not.toContain('hubEdit');
});
it('lets annotation edit marks change only the GFF3 source of added features', () => {
  const original = records[0];
  const marked = { ...original, features: original.features.map((feature, index) => ({ ...feature, hubEdit: index ? 'added' as const : 'edited' as const })) };
  const rows = (text: string) => text.split('\n').map(line => line.split('\t'));
  const before = rows(serializeExport([original], 'gff3').text);
  const after = rows(serializeExport([marked], 'gff3').text);
  const added = new Set(original.features.slice(1).map((_, index) => `${original.id}.${index + 2}`));
  after.forEach((row, index) => {
    const isAdded = row.length === 9 && added.has(/(?:^|;)ID=([^;]+)/.exec(row[8])?.[1] ?? '');
    expect(row).toEqual(isAdded ? [before[index][0], 'Dunceious', ...before[index].slice(2)] : before[index]);
  });
  expect(after.filter(row => row[1] === 'Dunceious')).toHaveLength(1);
  expect(after.flat().join('\t')).not.toContain('hubEdit');
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


it('preserves origin-crossing GenBank joins through export filtering and re-import', () => {
  const record = writeDetails(createOriginCrossingRecord(), { organism: 'Hepatitis B virus' });
  const before = structuredClone(record);
  const result = serializeExport([record], 'genbank', { types: new Set(['CDS']) });
  expect(result.text).toContain('join(2427..3308,1..1758)');
  expect(result.text).toContain('join(2992..3308,1..964)');
  expect(result.report.writtenDetails.organism).toBe(1);
  const parsed = parseGenBank(result.text)[0];
  expect(parsed.isCircular).toBe(true);
  expect(parsed.features.filter(feature => feature.type === 'CDS').map(feature => feature.locationString)).toEqual(['join(2427..3308,1..1758)', 'join(2992..3308,1..964)', '2021..2587']);
  expect(parsed.features.some(feature => feature.type === 'mat_peptide')).toBe(false);
  expect(record).toEqual(before);
});

it('round-trips origin-crossing GFF3 parts with valid intervals and source qualifiers', () => {
  const record = writeDetails(createOriginCrossingRecord(), { organism: 'Hepatitis B virus', host: 'human', location: 'Brazil', collectionDate: '2020' });
  const result = serializeExport([record], 'gff3');
  const rows = result.text.split('\n').filter(line => line && !line.startsWith('#')).map(line => line.split('\t'));
  expect(rows.map(row => [row[2], Number(row[3]), Number(row[4])])).toEqual([
    ['region', 1, 3308], ['CDS', 2427, 3308], ['CDS', 1, 1758],
    ['CDS', 2992, 3308], ['CDS', 1, 964], ['CDS', 2021, 2587], ['mature_protein_region', 296, 961],
  ]);
  expect(result.report.writtenDetails).toEqual({ organism: 1, host: 1, location: 1, collectionDate: 1 });
  const parsed = parseGFF3(result.text);
  expect(parsed.features.J02442).toHaveLength(4);
  expect(parsed.features.J02442.find(feature => feature.metadata?.gene === 'pol')?.segments).toEqual([{ start: 2426, end: 3308 }, { start: 0, end: 1758 }]);
  expect(parsed.features.J02442.find(feature => feature.metadata?.gene === 'env')?.segments).toEqual([{ start: 2991, end: 3308 }, { start: 0, end: 964 }]);
  expect(parsed.details.J02442).toMatchObject({ details: { organism: 'Hepatitis B virus', host: 'human', location: 'Brazil', collectionDate: '2020' } });
});

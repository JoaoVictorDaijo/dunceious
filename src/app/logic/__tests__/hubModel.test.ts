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
import { describe, expect, it } from 'vitest';
import type { BioFeature, SeqRecord } from '@/src/domain/bio/types';
import { buildSequenceSections, groupKeyOf, groupPreview, matchesAnnotation, matchesSequence, searchHits, type HubFilters, cycleRowSort, sortGroupRows } from '../hubModel';

const feature = (name: string, type = 'CDS', strand: 1 | -1 = 1): BioFeature => ({ name, type, strand, start: 0, end: 10 });
const record = (id: string, details: Record<string, string> = {}, features = [feature('spike')]): SeqRecord => ({
  id, name: id, sequence: 'A'.repeat(100), features: [ { ...feature('details', 'source'), metadata: details }, ...features ],
});
const filters = (patch: Partial<HubFilters> = {}): HubFilters => ({ query: '', types: new Set(), strand: 'all', sequenceQuery: '', needsAttention: false, ...patch });
const sections = (records: SeqRecord[], patch: Partial<HubFilters> = {}) => buildSequenceSections(records, filters(patch), { grouped: false }, 'load');

describe('hub sequence model', () => {
  it('does not use record definitions for annotation search', () => {
    expect(sections([{ ...record('a'), definition: 'camel' }], { query: 'camel' })).toEqual([]);
  });
  it('searches each annotation field case insensitively without searching arbitrary metadata', () => {
    const f = { ...feature('Spike'), metadata: { gene: 'S', product: 'surface', note: 'camel', custom: 'secret' } };
    for (const query of ['SPIKE', 's', 'surface', 'CDS', 'camel', '  spike  ']) expect(matchesAnnotation(f, query)).toBe(true);
    expect(matchesAnnotation(f, 'secret')).toBe(false);
  });
  it('searches sequence identifiers, display names, isolates, details and definitions', () => {
    const r = { ...record('local', { isolate: 'camelA', host: 'dromedary' }), accession: 'NC_123', label: 'reference', definition: 'complete genome' };
    for (const query of ['local', 'NC_123', 'reference', 'camelA', 'dromedary', 'genome']) expect(matchesSequence(r, query)).toBe(true);
    expect(matchesSequence(r, 'spike')).toBe(false);
  });
  it('groups locations by country and puts missing values last', () => {
    const records = [record('empty'), record('sa', { geo_loc_name: 'Saudi Arabia:Riyadh' }), record('om', { country: 'Oman' })];
    expect(groupKeyOf(records[1], 'location')).toBe('Saudi Arabia');
    expect(buildSequenceSections(records, filters(), { grouped: true, field: 'location' }, 'load').map(s => [s.record.id, s.group])).toEqual([
      ['om', 'Oman'], ['sa', 'Saudi Arabia'], ['empty', 'Not specified'],
    ]);
    expect(groupPreview(records, 'location')).toEqual({ groups: 2, notSpecified: 1 });
    expect(groupPreview([], 'host')).toEqual({ groups: 0, notSpecified: 0 });
  });
  it('counts named groups once and missing sequences individually in previews', () => {
    expect(groupPreview([record('a'), record('b')], 'host')).toEqual({ groups: 0, notSpecified: 2 });
    expect(groupPreview([record('a', { geo_loc_name: 'Oman:Muscat' }), record('b', { country: 'Oman' }), record('c')], 'location')).toEqual({ groups: 1, notSpecified: 1 });
  });
  it('orders collection years chronologically', () => {
    const records = [record('c', { collection_date: '2016-01' }), record('a', { collection_date: '21-Mar-2013' }), record('b', { collection_date: 'Mar-2014' })];
    expect(buildSequenceSections(records, filters(), { grouped: true, field: 'year' }, 'load').map(s => s.group)).toEqual(['2013', '2014', '2016']);
  });
  it.each(['2014T12Z', 'Mar-2014T12Z', '21-Mar-2014T12:00Z', '2014-03T12Z', '2014-03-21T12:00:30Z'])('groups the valid timestamp %s by its collection year', collection_date => {
    const records = [record('dated', { collection_date })];
    expect(groupKeyOf(records[0], 'year')).toBe('2014');
    expect(groupPreview(records, 'year')).toEqual({ groups: 1, notSpecified: 0 });
  });
  it('partitions records exactly once in every mode and excludes source counts', () => {
    const records = [record('a', { organism: 'virus', host: 'camel' }), record('b', { organism: 'virus' }), record('c')];
    for (const field of ['organism', 'host', 'location', 'year', 'file'] as const) {
      for (const mode of [{ grouped: false } as const, { grouped: true, field } as const]) {
        const result = buildSequenceSections(records, filters({ onlyIds: new Set(['a', 'c']) }), mode, 'load');
        expect(result).toHaveLength(2);
        expect(new Set(result.map(s => s.record.id)).size).toBe(2);
        expect(result.map(s => s.total)).toEqual([1, 1]);
        expect(result.flatMap(s => s.rows).map(f => f.type)).toEqual(['CDS', 'CDS']);
      }
    }
  });
  it('combines row filters and keeps original feature indexes in hit keys', () => {
    const records = [record('a', {}, [feature('other', 'gene'), feature('spike', 'CDS', -1), feature('spike', 'CDS')])];
    const result = sections(records, { query: 'spike', types: new Set(['CDS']), strand: 'rev' });
    expect(result[0].rows).toEqual([records[0].features[2]]);
    expect(result[0].total).toBe(3);
    expect(searchHits(result)).toEqual(['a:2']);
    expect(sections(records, { types: new Set(['source']) })).toEqual([]);
    expect(sections([record('unknown', {}, [{ ...feature('x'), metadata: { _gffStrand: '?' } }])], { strand: 'fwd' })).toEqual([]);
  });
  it('retains unannotated sections under sequence-only filters', () => {
    const records = [record('empty', {}, []), record('annotated')];
    expect(sections(records, { needsAttention: true }).map(s => s.record.id)).toEqual(['empty']);
    expect(sections(records, { sequenceQuery: 'empty', onlyIds: new Set(['empty']) }).map(s => s.record.id)).toEqual(['empty']);
    expect(sections(records, { query: 'spike' }).map(s => s.record.id)).toEqual(['annotated']);
  });
  it('sorts by accession and annotation count without mutating load order', () => {
    const records = [{ ...record('a'), accession: 'Z' }, { ...record('b', {}, []), accession: 'A' }];
    expect(buildSequenceSections(records, filters(), { grouped: false }, 'accession').map(s => s.key)).toEqual(['b', 'a']);
    expect(buildSequenceSections(records, filters(), { grouped: false }, 'fewest').map(s => s.key)).toEqual(['b', 'a']);
    expect(sections(records).map(s => s.key)).toEqual(['a', 'b']);
  });
});

describe('hub tracks', () => {
  it('keeps a track-only search hit without counting it as an annotation', () => {
    const r = { ...record('coverage', {}, []), tracks: [{ id: 'depth', name: 'Read depth', data: [{ start: 0, end: 100, value: 5 }] }] };
    const hits = sections([r], { query: 'depth' });
    expect(hits).toHaveLength(1); expect(hits[0].total).toBe(0); expect(hits[0].tracks?.map(t => t.id)).toEqual(['depth']);
    expect(searchHits(hits)).toEqual(['coverage:track:depth']);
    expect(sections([r], { types: new Set(['CDS']) })).toEqual([]);
  });
});


describe('sorting within groups', () => {
  it('cycles a column ascending, descending and off, and starts a new column ascending', () => {
    const ascending = cycleRowSort(null, 'name');
    expect(ascending).toEqual({ column: 'name', direction: 'ascending' });
    const descending = cycleRowSort(ascending, 'name');
    expect(descending).toEqual({ column: 'name', direction: 'descending' });
    expect(cycleRowSort(descending, 'name')).toBeNull();
    expect(cycleRowSort(descending, 'length')).toEqual({ column: 'length', direction: 'ascending' });
  });
  it('sorts each sequence independently and restores original order with stable hit keys', () => {
    const values = [record('z', {}, [feature('zebra'), feature('apple')]), record('a', {}, [feature('pear'), feature('banana')])];
    const original = sections(values);
    const sorted = original.map(section => ({ ...section, rows: sortGroupRows(section.rows.map(feature => ({ record: section.record, feature })), { column: 'name', direction: 'ascending' }).map(row => row.feature) }));
    expect(sorted.map(section => section.key)).toEqual(['z', 'a']);
    expect(searchHits(sorted)).toEqual(['z:2', 'z:1', 'a:2', 'a:1']);
    expect(searchHits(original)).toEqual(['z:1', 'z:2', 'a:1', 'a:2']);
    expect(sortGroupRows(original[0].rows.map(feature => ({ record: values[0], feature })), null).map(row => row.feature.name)).toEqual(['zebra', 'apple']);
  });
  it('sorts feature rows by accession and lengths by biological parts', () => {
    const a = record('local-a'), z = { ...record('local-z'), accession: 'AAA' };
    const rows = [{ record: a, feature: { ...feature('x'), start: 90, end: 10 } }, { record: z, feature: { ...feature('y'), start: 0, end: 40 } }];
    expect(sortGroupRows(rows, { column: 'name', direction: 'ascending' }, 'features').map(row => row.record.id)).toEqual(['local-z', 'local-a']);
    expect(sortGroupRows(rows, { column: 'length', direction: 'ascending' }).map(row => row.feature.name)).toEqual(['x', 'y']);
  });
});


it('combines the edited-only filter with type, strand and query as AND', () => {
  const input = [record('marked', {}, [
    { ...feature('edited', 'gene'), hubEdit: 'edited' as const },
    { ...feature('added', 'CDS', -1), hubEdit: 'added' as const },
    feature('file', 'CDS', -1),
  ])];
  expect(sections(input, { editedOnly: true })[0].rows.map(feature => feature.name)).toEqual(['edited', 'added']);
  expect(sections(input, { editedOnly: true, types: new Set(['CDS']), strand: 'rev', query: 'added' })[0].rows.map(feature => feature.name)).toEqual(['added']);
  expect(sections(input, { editedOnly: true, query: 'file' })).toEqual([]);
});


it('sorts origin-crossing annotations by biological start and summed length without changing load order', () => {
  const record = createOriginCrossingRecord();
  const rows = record.features.map(feature => ({ record, feature }));
  expect(sortGroupRows(rows, { column: 'location', direction: 'ascending' }).map(row => row.feature.name)).toEqual(['peptide', 'core', 'polymerase', 'envelope']);
  expect(sortGroupRows(rows, { column: 'location', direction: 'descending' }).map(row => row.feature.name)).toEqual(['envelope', 'polymerase', 'core', 'peptide']);
  expect(sortGroupRows(rows, { column: 'length', direction: 'ascending' }).map(row => row.feature.name)).toEqual(['core', 'peptide', 'envelope', 'polymerase']);
  expect(sortGroupRows(rows, { column: 'length', direction: 'descending' }).map(row => row.feature.name)).toEqual(['polymerase', 'envelope', 'peptide', 'core']);
  expect(rows.map(row => row.feature.name)).toEqual(['polymerase', 'envelope', 'core', 'peptide']);
});

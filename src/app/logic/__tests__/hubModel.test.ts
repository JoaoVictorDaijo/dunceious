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

import { describe, expect, it } from 'vitest';
import type { BioFeature, SeqRecord } from '@/src/domain/bio/types';
import { buildSequenceSections, groupKeyOf, groupPreview, matchesAnnotation, matchesSequence, searchHits, type HubFilters } from '../hubModel';

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

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
import type { HubFilters } from '../hubModel';
import { featureCoordPatch, featureLength } from '../viewModel';
import { buildFeatureGroups, countFeatureGroups, featureIdentity } from '../featureComparison';

const f = (name = 'S', type = 'CDS', length = 100, metadata: Record<string, string> = {}): BioFeature => ({ name, type, start: 10, end: 10 + length, strand: 1, metadata });
const r = (id: string, features: BioFeature[], organism = 'virus', patch: Partial<SeqRecord> = {}): SeqRecord => ({
  id, name: id, sequence: 'A'.repeat(1000), features: [{ ...f('details', 'source'), metadata: { organism } }, ...features], ...patch,
});
const filters = (patch: Partial<HubFilters> = {}): HubFilters => ({ query: '', types: new Set(), strand: 'all', sequenceQuery: '', needsAttention: false, ...patch });
const groups = (records: SeqRecord[], patch: Partial<HubFilters> = {}, onlyProblems = false) => buildFeatureGroups(records, filters(patch), onlyProblems);
const states = (records: SeqRecord[]) => groups(records)[0].cells.map(c => [c.recordId, c.state]);

describe('feature comparison', () => {
  it('counts visible groups across organisms and filters without reading comparison geometry', () => {
    let geometryReads = 0;
    const measured = { ...f('S'), get end() { geometryReads++; return 110; } };
    const records = [r('a', [measured, f('S', 'gene'), f('other')]), r('b', [f('S')]), r('c', [f('S')], 'other')];
    const cases: [Partial<HubFilters>, number][] = [
      [{}, 3], [{ query: 'S' }, 3], [{ types: new Set(['gene']) }, 1], [{ strand: 'rev' }, 0],
      [{ onlyIds: new Set(['a', 'b']) }, 2], [{ sequenceQuery: 'c' }, 1], [{ query: 'absent' }, 0],
    ];
    for (const [patch, expected] of cases) expect(countFeatureGroups(records, filters(patch))).toBe(expected);
    expect(geometryReads).toBe(0);
    for (const [patch, expected] of cases) expect(groups(records, patch)).toHaveLength(expected);
  });

  it('reuses biological comparison when annotation filters and problem visibility change', () => {
    let geometryReads = 0;
    const measured = { ...f('S', 'CDS', 104), get end() { geometryReads++; return 114; } };
    const records = [r('a', [f('S'), f('S', 'gene')]), r('b', [f('S'), f('S', 'gene')]), r('c', [measured, f('S', 'gene')])];
    expect(groups(records)[0].counts.odd).toBe(1);
    const warmedReads = geometryReads;
    expect(warmedReads).toBeGreaterThan(0);
    const filtered = groups(records, { query: 'S', types: new Set(['gene']), strand: 'fwd' }, true);
    expect(filtered[0].rows.map(row => row.feature.type)).toEqual(['gene', 'gene', 'gene']);
    expect(filtered[0].counts).toMatchObject({ present: 3, odd: 1, pool: 3 });
    expect(groups(records, { query: 'absent' })).toEqual([]);
    expect(groups(records, { strand: 'rev' })).toEqual([]);
    expect(geometryReads).toBe(warmedReads);
  });

  it('refreshes comparison for sequence pool changes and immutable annotation edits', () => {
    const records = [r('a', [f()]), r('b', [f()]), r('c', [f('S', 'CDS', 104)])]
      .map(record => ({ ...record, fileDetails: { organism: 'virus' } }));
    expect(groups(records)[0].counts).toMatchObject({ odd: 1, pool: 3 });
    expect(groups(records, { onlyIds: new Set(['c']) })[0].counts).toMatchObject({ odd: 0, pool: 1 });
    expect(groups(records, { sequenceQuery: 'a' })[0].counts).toMatchObject({ odd: 0, pool: 1 });
    expect(groups(records, { needsAttention: true })).toEqual([]);
    const edited = records.map(record => record.id === 'c' ? { ...record, features: [record.features[0], f('S', 'CDS', 100)] } : record);
    expect(groups(edited)[0].counts).toMatchObject({ odd: 0, pool: 3 });
    expect(groups(records)[0].counts).toMatchObject({ odd: 1, pool: 3 });
  });

  it('does not expose mutable cached comparison containers', () => {
    const records = [r('a', [f()]), r('b', [f()]), r('c', [f('S', 'CDS', 104)])];
    const first = groups(records)[0];
    first.cells[0].state = 'missing';
    first.cells.pop();
    first.counts.odd = 99;
    first.types.push('corrupted');
    first.rows[0].feature = f('corrupted');
    first.rows.pop();
    const next = groups(records)[0];
    expect(next.cells.map(cell => cell.state)).toEqual(['present', 'present', 'odd']);
    expect(next.counts).toMatchObject({ odd: 1, pool: 3 });
    expect(next.types).toEqual(['CDS']);
    expect(next.rows.map(row => row.feature.name)).toEqual(['S', 'S', 'S']);
  });

  it('uses product identity for each peptide type, with fallback when absent', () => {
    for (const type of ['mat_peptide', 'sig_peptide', 'transit_peptide']) {
      expect(featureIdentity(f('fallback', type, 10, { gene: 'ORF1ab', product: 'nsp1' }))).toBe('nsp1');
      expect(featureIdentity(f('fallback', type, 10, { gene: 'ORF1ab' }))).toBe('ORF1ab');
    }
    expect(groups([r('a', [f('x', 'mat_peptide', 10, { gene: 'ORF1ab', product: 'nsp1' }), f('x', 'mat_peptide', 10, { gene: 'ORF1ab', product: 'nsp2' })])]).map(g => g.identity)).toEqual(['nsp1', 'nsp2']);
    expect(featureIdentity(f('name', 'CDS', 10, { gene: 'gene', locus_tag: 'tag', product: 'product' }))).toBe('gene');
    expect(featureIdentity(f('name', 'CDS', 10, { locus_tag: 'tag' }))).toBe('tag');
  });
  it('compares each type to its own median', () => {
    const records = ['a', 'b', 'c'].map(id => r(id, [f('S', 'gene', 500), f('S', 'CDS', 100)]));
    const group = groups(records)[0];
    expect(group.types).toEqual(['CDS', 'gene']);
    expect(group.cells.map(c => c.state)).toEqual(['present', 'present', 'present']);
    expect(group.counts).toEqual({ present: 3, missing: 0, odd: 0, duplicate: 0, notDetermined: 0, pool: 3 });
  });
  it('uses biological segments and circular geometry instead of envelope or aligned lengths', () => {
    const records = [r('a', [f('S', 'CDS', 200)]), r('b', [f('S', 'CDS', 200)]), r('circle', [{ ...f(), start: 900, end: 100 }], 'virus', { isCircular: true }),
      r('join', [{ ...f(), end: 700, segments: [{ start: 10, end: 110 }, { start: 600, end: 700 }] }], 'virus', { alignedSequence: 'A-'.repeat(1000) })];
    expect(groups(records)[0].cells.every(c => c.state === 'present')).toBe(true);
  });
  it('compares protein residue lengths in amino acids', () => {
    const records = [r('a', [f('S', 'Region', 100)], 'protein', { moleculeType: 'protein' }), r('b', [f('S', 'Region', 100)], 'protein', { moleculeType: 'protein' }), r('c', [f('S', 'Region', 104)], 'protein', { moleculeType: 'protein' })];
    expect(states(records)).toEqual([['a', 'present'], ['b', 'present'], ['c', 'odd']]);
  });
  it('uses a strict greater-than-three-percent threshold', () => {
    expect(states([r('a', [f()]), r('b', [f()]), r('c', [f('S', 'CDS', 103)])])).toEqual([['a', 'present'], ['b', 'present'], ['c', 'present']]);
    expect(states([r('a', [f()]), r('b', [f()]), r('c', [f('S', 'CDS', 104)])])).toEqual([['a', 'present'], ['b', 'present'], ['c', 'odd']]);
  });
  it('does not call absent partial or unannotated sequences missing', () => {
    const records = [r('a', [f('ORF4b')]), r('b', [f('other')], 'virus', { definition: 'partial genome' }), r('c', [f('other')]), r('d', [])];
    const group = groups(records).find(g => g.identity === 'ORF4b')!;
    expect(group.cells.map(c => c.state)).toEqual(['present', 'not-determined', 'missing', 'unannotated']);
    expect(group.counts).toMatchObject({ missing: 1, notDetermined: 1, pool: 4 });
    expect(group.accessory).toBe(false);
  });
  it('does not compare unknown organisms or invent an organism', () => {
    const group = groups([r('a', [f()], ''), r('b', [f('other')], '')]).find(g => g.identity === 'S')!;
    expect(group).toMatchObject({ organism: 'No organism', compared: false, notComparedReason: 'organism unknown', accessory: false });
    expect(group.cells.map(c => c.state)).toEqual(['present', 'absent']);
    expect(group.counts).toMatchObject({ missing: 0, odd: 0 });
  });
  it('has no baseline with only partial and unannotated sequences', () => {
    const group = groups([r('a', [f()], 'virus', { definition: 'partial genome' }), r('b', [])])[0];
    expect(group).toMatchObject({ compared: false, notComparedReason: 'no complete annotated sequences', accessory: false });
    expect(group.cells.map(c => c.state)).toEqual(['present', 'unannotated']);
    expect(group.counts).toMatchObject({ missing: 0, odd: 0, pool: 2 });
  });
  it('does not flag absence of accessory features in 1 of 26 complete annotated sequences', () => {
    const records = Array.from({ length: 26 }, (_, i) => r(String(i).padStart(2, '0'), [f('common'), ...(i === 0 ? [f('primer', 'primer_bind')] : [])]));
    const group = groups(records).find(g => g.identity === 'primer')!;
    expect(group.accessory).toBe(true);
    expect(group.counts).toMatchObject({ present: 1, missing: 0, pool: 26 });
    expect(group.cells.filter(c => c.state === 'absent')).toHaveLength(25);
  });
  it('flags duplicate types before odd length without counting gene plus CDS as duplicate', () => {
    const group = groups([r('a', [f(), f('S', 'CDS', 300)]), r('b', [f()]), r('c', [f()])])[0];
    expect(group.cells.map(c => c.state)).toEqual(['duplicate', 'present', 'present']);
    expect(group.counts).toMatchObject({ duplicate: 1, odd: 0 });
  });
  it('keeps organisms separate and gives deep-equal output after record and feature shuffling', () => {
    const records = [r('z', [f('B'), f('A')]), r('a', [f('A'), f('B')]), r('q', [f('A')], 'other')];
    const before = groups(records);
    const shuffled = [...records].reverse().map(record => ({ ...record, features: [...record.features].reverse() }));
    const summary = (result: ReturnType<typeof groups>) => result.map(({ rows, ...group }) => ({
      ...group, rows: rows.map(row => ({ recordId: row.record.id, feature: row.feature })),
    }));
    expect(summary(groups(shuffled))).toEqual(summary(before));
    for (const row of before.flatMap(group => group.rows)) {
      expect(row.record).toBe(records.find(record => record.id === row.record.id));
      expect(row.record.features).toContain(row.feature);
    }
    expect(before).toHaveLength(3);
    expect(before.filter(g => g.organism === 'other')[0].counts.pool).toBe(1);
  });
  it('applies annotation filters after baselines so they cannot create false missing or odd flags', () => {
    const records = [r('a', [f('match', 'CDS', 100, { gene: 'S' })]), r('b', [f('other', 'CDS', 100, { gene: 'S' })]), r('c', [f('other', 'CDS', 104, { gene: 'S' })])];
    const group = groups(records, { query: 'match' })[0];
    expect(group.rows.map(row => row.record.id)).toEqual(['a']);
    expect(group.cells.map(c => c.state)).toEqual(['present', 'present', 'odd']);
    expect(group.counts).toMatchObject({ present: 3, missing: 0, odd: 1 });
    expect(groups(records, { onlyIds: new Set(['a', 'c']) })[0].counts.pool).toBe(2);
    expect(groups(records, { query: 'absent' })).toEqual([]);
  });
  it('uses complete single-copy baselines without partial genomes shifting the median', () => {
    const records = [r('a', [f()]), r('b', [f()]), r('c', [f('S', 'CDS', 104)]), r('partial', [f('S', 'CDS', 40)], 'virus', { definition: 'partial genome' })];
    expect(states(records)).toEqual([['a', 'present'], ['b', 'present'], ['c', 'odd'], ['partial', 'odd']]);
    const marked = groups([r('a', [f()]), r('b', [f()]), r('marked', [{ ...f('S', 'CDS', 40), locationString: '<1..40' }])])[0];
    expect(marked.cells.map(cell => cell.state)).toEqual(['present', 'present', 'present']);
    expect(groups([r('partial', [f()], 'virus', { definition: 'partial genome' }), r('complete', [f('other')])]).find(group => group.identity === 'S')?.cells).toEqual([
      { recordId: 'complete', state: 'absent' }, { recordId: 'partial', state: 'present' },
    ]);
  });
  it('shows only missing or odd groups when requested', () => {
    const records = [r('a', [f('normal'), f('odd'), f('missing')]), r('b', [f('normal'), f('odd')]), r('c', [f('normal'), f('odd', 'CDS', 104), f('missing')])];
    expect(groups(records, {}, true).map(g => g.identity)).toEqual(['missing', 'odd']);
  });
});


it('keeps unchanged circular start edits at 200 bases without biological outliers', () => {
  const feature = { ...f(), start: 900, end: 100 };
  const records = ['a', 'b', 'c'].map(id => r(id, [feature], 'virus', { isCircular: true }));
  const edited = { ...feature, ...featureCoordPatch(feature, 'start', '900') };
  records[2] = { ...records[2], features: [records[2].features[0], edited] };
  expect(states(records)).toEqual([['a', 'present'], ['b', 'present'], ['c', 'present']]);
  expect(featureLength(1000, edited.start, edited.end, edited.segments)).toBe(200);
});


it('uses the first biological start for joined feature medians and does not flag equivalent contiguous lengths', () => {
  const circular = createOriginCrossingRecord();
  const joined = r('circle', circular.features, 'virus', { sequence: circular.sequence, isCircular: true });
  const contiguous = ['a', 'b'].map(id => r(id, [
    { ...circular.features[0], start: 400, end: 3040, segments: undefined, locationString: '401..3040' },
    { ...circular.features[1], start: 500, end: 1781, segments: undefined, locationString: '501..1781' },
  ], 'virus', { sequence: circular.sequence }));
  const compared = groups([joined, ...contiguous]);
  const polymerase = compared.find(group => group.identity === 'pol')!;
  const envelope = compared.find(group => group.identity === 'env')!;
  expect(polymerase.medianStart).toBe(400);
  expect(envelope.medianStart).toBe(500);
  for (const group of [polymerase, envelope]) {
    expect(group.cells.map(cell => [cell.recordId, cell.state])).toEqual([['a', 'present'], ['b', 'present'], ['circle', 'present']]);
    expect(group.counts.odd).toBe(0);
  }
  expect(groups([joined]).find(group => group.identity === 'pol')?.medianStart).toBe(2426);
  expect(groups([joined]).find(group => group.identity === 'env')?.medianStart).toBe(2991);
});

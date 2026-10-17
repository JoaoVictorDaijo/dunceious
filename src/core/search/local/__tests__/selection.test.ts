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

import { readFileSync } from 'node:fs';
import { beforeAll, expect, it } from 'vitest';
import { instantiateLocalEngine, type LocalEngine } from '../engine';
import { encodeResidues, loadScoring } from '../scoring';
import { type LocalFilters, runLocalStream } from '../stream';
import { mergeLocalOutcomes } from '../selection';

let engine: LocalEngine;
const scoring = loadScoring('EDNAFULL');
beforeAll(async () => { engine = await instantiateLocalEngine(await WebAssembly.compile(readFileSync('public/wasm/local-align.wasm'))); });
const codes = (s: string) => (encodeResidues(s, scoring) as { codes: Uint8Array }).codes;
const run = (query: string, sequence: string, limit = 100, strand: 1 | -1 = 1, filters: LocalFilters = { minIdentity: null, minQueryCoverage: null }) => runLocalStream(engine, {
  query, queryCodes: codes(query), record: { id: 'r', sequence }, recordIndex: 0, strand, scoring, moleculeType: 'dna', limit, filters,
});
it('keeps the AA/AAA full hit and remaining record-3 singleton; hides two overlaps', () => {
  const out = run('AA', 'AAA');
  expect(out.hits.map(h => [h.start, h.end, h.local!.score])).toEqual([[0, 2, 10], [2, 3, 5]]);
  expect(out).toMatchObject({ exhausted: true, hiddenByOverlap: 2, hiddenByFilters: 0, noPositive: false });
});
it('finishes cutoff ties before choosing the leftmost forward coordinate on reverse', () => {
  const out = run('A', 'TT', 1, -1);
  expect(mergeLocalOutcomes([out], 1, []).results.map(h => [h.start, h.end])).toEqual([[0, 1]]);
  expect(out.exhausted).toBe(true);
});
it('does not let a display-filtered span release overlaps', () => {
  const out = run('AA', 'AAA', 100, 1, { minIdentity: null, minQueryCoverage: 100 });
  expect(out.hits.map(h => h.start)).toEqual([0]);
  expect(out.hiddenByFilters).toBe(1);
  expect(out.hiddenByOverlap).toBe(2);
});
it('maps gapped reverse records back to forward aligned columns', () => {
  const out = run('AA', '-T-T-', 100, -1);
  expect(out.hits[0]).toMatchObject({ start: 1, end: 4, sequence: 'T-T', cigar: '2=', segments: [{ start: 1, end: 2 }, { start: 3, end: 4 }] });
});
it('counts no positive streams separately', () => {
  expect(run('A', 'C')).toMatchObject({ noPositive: true, hits: [], exhausted: true });
});
it.each([['AC', 'ACAC'], ['ACGT', 'ACGTCCCCACGT'], ['AAA', 'AAAAA'], ['ACG', 'ACACG']])('matches exhaustive independent selection for %s/%s', (query, record) => {
  const all = [...{ [Symbol.iterator]: () => engine.enumerate(codes(query), codes(record), scoring) }];
  const kept: typeof all = [];
  let hidden = 0;
  for (const a of all) {
    if (kept.some(b => a.recordStart < b.recordEnd && b.recordStart < a.recordEnd)) hidden++;
    else kept.push(a);
  }
  const ordered = kept.sort((a, b) => b.score2 - a.score2 || a.recordStart - b.recordStart || a.recordEnd - b.recordEnd || a.queryStart - b.queryStart);
  for (const limit of [1, 2, 100]) {
    const out = run(query, record, limit);
    const merged = mergeLocalOutcomes([out], limit, []);
    expect(merged.results.map(h => [h.start, h.end, h.local!.score])).toEqual(ordered.slice(0, limit).map(a => [a.recordStart, a.recordEnd, a.score2 / 2]));
    expect(merged.counts.exact).toBe(out.exhausted);
    if (out.exhausted) expect(merged.counts).toMatchObject({ hiddenByOverlap: hidden, beyondLimit: Math.max(0, kept.length - limit) });
  }
});
it('stops only below the cutoff and labels lower bounds', () => {
  const out = run('ACGT', 'ACGTCCCCAC', 1);
  expect(out.exhausted).toBe(false);
  expect(mergeLocalOutcomes([out], 1, []).counts.exact).toBe(false);
});
it('merges independently of completion order, record order before strand', () => {
  const fwd = run('A', 'AT'); const rev = run('A', 'AT', 100, -1);
  const next = { ...fwd, recordIndex: 1, hits: fwd.hits.map(h => ({ ...h, recordId: 'next' })) };
  const expected = mergeLocalOutcomes([fwd, rev, next], 100, []);
  expect(expected.results.map(h => [h.recordId, h.strand])).toEqual([['r', 1], ['r', -1], ['next', 1]]);
  expect(mergeLocalOutcomes([next, rev, fwd], 100, [])).toEqual(expected);
});

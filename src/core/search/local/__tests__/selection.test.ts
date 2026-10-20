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
import { instantiateLocalEngine, type LocalAlignment, type LocalEngine } from '../engine';
import { encodeResidues, loadScoring } from '../scoring';
import { iterateLocalStream, scoreLocalStream, type LocalFilters, type LocalStreamInput, runLocalStream } from '../stream';
import { compareLocalHits, mergeLocalOutcomes } from '../selection';
import type { SearchResult } from '@/src/domain/bio/types';

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
  expect(out).toMatchObject({ exhausted: true, hiddenByOverlapScores: [20, 10], hiddenByFilterScores: [], noPositive: false,
    alignmentsEnumerated: 4 });
});
it('finishes cutoff ties before choosing the leftmost forward coordinate on reverse', () => {
  const out = run('A', 'TT', 1, -1);
  expect(mergeLocalOutcomes([out], 1, []).results.map(h => [h.start, h.end])).toEqual([[0, 1]]);
  expect(out.exhausted).toBe(true);
});
it('does not let a display-filtered span release overlaps', () => {
  const out = run('AA', 'AAA', 100, 1, { minIdentity: null, minQueryCoverage: 100 });
  expect(out.hits.map(h => h.start)).toEqual([0]);
  expect(out.hiddenByFilterScores).toEqual([10]);
  expect(out.hiddenByOverlapScores).toEqual([20, 10]);
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
  const hidden: number[] = [];
  for (const a of all) {
    if (kept.some(b => a.recordStart < b.recordEnd && b.recordStart < a.recordEnd)) hidden.push(a.score2);
    else kept.push(a);
  }
  const ordered = kept.sort((a, b) => b.score2 - a.score2 || a.recordStart - b.recordStart || a.recordEnd - b.recordEnd || a.queryStart - b.queryStart);
  for (const limit of [1, 2, 100]) {
    const out = run(query, record, limit);
    const merged = mergeLocalOutcomes([out], limit, []);
    expect(merged.results.map(h => [h.start, h.end, h.local!.score])).toEqual(ordered.slice(0, limit).map(a => [a.recordStart, a.recordEnd, a.score2 / 2]));
    const cutoff2 = ordered.length >= limit ? ordered[limit - 1].score2 : null;
    expect(out.exhausted).toBe(true);
    expect(merged.counts).toMatchObject({ cutoff: cutoff2 === null ? null : cutoff2 / 2,
      hiddenByOverlap: hidden.filter(score2 => cutoff2 === null || score2 >= cutoff2).length,
      beyondLimit: Math.max(0, kept.filter(a => cutoff2 === null || a.score2 >= cutoff2).length - limit) });
  }
});
it('exhausts the reference stream without applying a per-stream result limit', () => {
  const out = run('ACGT', 'ACGTCCCCAC', 1);
  expect(out.exhausted).toBe(true);
  expect(out.hits.length).toBeGreaterThan(1);
  expect(mergeLocalOutcomes([out], 1, []).counts.cutoff).toBe(20);
});
it('merges independently of completion order, record order before strand', () => {
  const fwd = run('A', 'AT'); const rev = run('A', 'AT', 100, -1);
  const next = { ...fwd, recordIndex: 1, hits: fwd.hits.map(h => ({ ...h, recordId: 'next' })) };
  const expected = mergeLocalOutcomes([fwd, rev, next], 100, []);
  expect(expected.results.map(h => [h.recordId, h.strand])).toEqual([['r', 1], ['r', -1], ['next', 1]]);
  expect(mergeLocalOutcomes([next, rev, fwd], 100, [])).toEqual(expected);
});

const inputFor = (query: string, sequence: string, limit: number, recordIndex = 0,
  strand: 1 | -1 = 1, filters: LocalFilters = { minIdentity: null, minQueryCoverage: null }): LocalStreamInput => ({
  query, queryCodes: codes(query), record: { id: `record-${recordIndex}`, sequence },
  recordIndex, strand, scoring, moleculeType: 'dna', limit, filters,
});

function observedEngine(alignments: LocalAlignment[], onNext?: (enumerated: number) => void) {
  let enumerated = 0;
  let closed = 0;
  const localEngine: LocalEngine = {
    maxScore: () => alignments[0]?.score2 ?? 0,
    peakMemoryBytes: () => 0,
    enumerate: () => {
      let index = 0;
      return {
        next() {
          if (index === alignments.length) return { done: true, value: undefined };
          enumerated++;
          onNext?.(enumerated);
          return { done: false, value: alignments[index++] };
        },
        return() { closed++; return { done: true, value: undefined }; },
      };
    },
  };
  return { engine: localEngine, enumerated: () => enumerated, closed: () => closed };
}

const alignment = (recordStart: number, length: number): LocalAlignment => ({
  score2: length * 10, queryStart: 0, queryEnd: length, recordStart,
  recordEnd: recordStart + length, cigar: `${length}=${length < 3 ? `${3 - length}S` : ''}`,
});

function consume(iterator: ReturnType<typeof iterateLocalStream>) {
  const yielded: Array<SearchResult | null> = [];
  let next = iterator.next();
  while (!next.done) { yielded.push(next.value); next = iterator.next(); }
  return { yielded, outcome: next.value };
}

it('checks the live bound after each next and keeps every equality at that bound', () => {
  const observed = observedEngine([alignment(0, 3), alignment(3, 2), alignment(5, 2), alignment(7, 1)]);
  let bound: number | null = null;
  const iterator = iterateLocalStream(observed.engine, inputFor('AAA', 'AAAAAAAA', 1), undefined, () => bound);
  expect(iterator.next().value).toMatchObject({ start: 0, local: { score: 15 } });
  bound = 20;
  const rest = consume(iterator);
  expect(rest.yielded.map(hit => hit?.start)).toEqual([3, 5]);
  expect(rest.outcome).toMatchObject({ exhausted: false, alignmentsEnumerated: 4, firstScore2: 30,
    hiddenByOverlapScores: [], hiddenByFilterScores: [] });
  expect(observed.enumerated()).toBe(4);
  expect(observed.closed()).toBe(1);
});

it('yields once per classified alignment and retains display-filtered span occupancy', () => {
  const filtered: LocalAlignment = { score2: 12, queryStart: 0, queryEnd: 3,
    recordStart: 3, recordEnd: 6, cigar: '1=1X1=' };
  const observed = observedEngine([alignment(0, 3), alignment(1, 2), filtered, alignment(5, 1), alignment(6, 1)]);
  const result = consume(iterateLocalStream(observed.engine, inputFor('AAA', 'AAAAGAA', 1, 0, 1,
    { minIdentity: 100, minQueryCoverage: null })));
  expect(result.yielded.map(hit => hit?.start ?? null)).toEqual([0, null, null, null, 6]);
  expect(result.outcome).toMatchObject({ exhausted: true, alignmentsEnumerated: 5,
    hiddenByOverlapScores: [20, 10], hiddenByFilterScores: [12], firstScore2: 30 });
  expect(observed.closed()).toBe(1);
});

it('records a positive first alignment below the bound without classifying or yielding it', () => {
  let bound: number | null = null;
  const observed = observedEngine([alignment(0, 3)], () => { bound = 40; });
  const result = consume(iterateLocalStream(observed.engine, inputFor('AAA', 'AAA', 1), undefined, () => bound));
  expect(result.yielded).toEqual([]);
  expect(result.outcome).toMatchObject({ noPositive: false, exhausted: false, firstScore2: 30,
    alignmentsEnumerated: 1, hits: [], hiddenByOverlapScores: [], hiddenByFilterScores: [] });
  expect(observed.closed()).toBe(1);
});

it('scores without reading ahead or creating an enumeration', () => {
  const observed = observedEngine([alignment(0, 3), alignment(3, 2)]);
  const outcome = scoreLocalStream(observed.engine, inputFor('AAA', 'AAAAA', 1));
  expect(outcome).toMatchObject({ exhausted: false, firstScore2: 30, alignmentsEnumerated: 0, hits: [] });
  expect(observed.enumerated()).toBe(0);
  expect(observed.closed()).toBe(0);
});

it('retains a filtered stream upper bound and distinguishes a zero-score stream', () => {
  const observed = observedEngine([alignment(0, 2), alignment(2, 1)]);
  const input = inputFor('AAA', 'AAA', 1, 0, 1, { minIdentity: null, minQueryCoverage: 100 });
  expect(scoreLocalStream(observed.engine, input)).toMatchObject({ exhausted: false, firstScore2: 20,
    hiddenByFilterScores: [], alignmentsEnumerated: 0 });
  expect(observed.enumerated()).toBe(0);
  expect(scoreLocalStream(observedEngine([]).engine, inputFor('AAA', 'CCC', 1)))
    .toMatchObject({ exhausted: true, noPositive: true, firstScore2: null, alignmentsEnumerated: 0 });
});

it('closes the underlying iterator on consumer return and on an engine failure', () => {
  const observed = observedEngine([alignment(0, 3), alignment(3, 2)]);
  const iterator = iterateLocalStream(observed.engine, inputFor('AAA', 'AAAAA', 1));
  iterator.next();
  iterator.return(undefined as never);
  iterator.return(undefined as never);
  expect(observed.closed()).toBe(1);
  expect(observed.enumerated()).toBe(1);
  let closed = 0;
  const failing: LocalEngine = { maxScore: () => 0, peakMemoryBytes: () => 0, enumerate: () => ({
    next() { throw new Error('Enumeration failed'); },
    return() { closed++; return { done: true, value: undefined }; },
  }) };
  expect(() => iterateLocalStream(failing, inputFor('AAA', 'AAA', 1)).next()).toThrow('Enumeration failed');
  expect(closed).toBe(1);
});

it('counts hidden hits only at the final cutoff and beyond-limit hits only in its tie group', () => {
  const out = run('AA', 'AAA');
  expect(mergeLocalOutcomes([out], 1, []).counts).toEqual({ cutoff: 10, streams: 1, noPositiveStreams: 0,
    skippedRecords: [], hiddenByOverlap: 1, hiddenByFilters: 0, beyondLimit: 0 });
  expect(mergeLocalOutcomes([out], 2, []).counts).toMatchObject({ cutoff: 5, hiddenByOverlap: 2, beyondLimit: 0 });
  expect(mergeLocalOutcomes([out], 3, []).counts).toMatchObject({ cutoff: null, hiddenByOverlap: 2, beyondLimit: 0 });
  expect(mergeLocalOutcomes([run('A', 'AAA')], 1, []).counts).toMatchObject({ cutoff: 5, beyondLimit: 2 });
  const filtered = run('AA', 'AAA', 100, 1, { minIdentity: null, minQueryCoverage: 100 });
  expect(mergeLocalOutcomes([filtered], 1, []).counts).toMatchObject({ cutoff: 10, hiddenByFilters: 0, hiddenByOverlap: 1 });
  expect(mergeLocalOutcomes([filtered], 2, []).counts).toMatchObject({ cutoff: null, hiddenByFilters: 1, hiddenByOverlap: 2 });
});

it('converts fractional displayed cutoffs back to doubled scores for hidden classifications', () => {
  const source = run('A', 'A');
  const outcome = { ...source, hits: source.hits.map(hit => ({ ...hit, local: { ...hit.local!, score: 4.5 } })),
    hiddenByOverlapScores: [10, 9, 8], hiddenByFilterScores: [9, 8] };
  expect(mergeLocalOutcomes([outcome], 1, []).counts).toMatchObject({ cutoff: 4.5, hiddenByOverlap: 2, hiddenByFilters: 1 });
});

it('exports the canonical comparator for every global tie-breaking key', () => {
  const base = run('AAA', 'AAA').hits[0];
  const entry = (score: number, recordIndex: number, strand: 1 | -1, start: number, end: number, queryStart: number) => ({
    recordIndex, hit: { ...base, strand, start, end, local: { ...base.local!, score, queryStart } },
  });
  const expected = [entry(15, 0, 1, 0, 1, 0), entry(15, 0, 1, 0, 1, 1), entry(15, 0, 1, 0, 2, 0),
    entry(15, 0, 1, 1, 2, 0), entry(15, 0, -1, 0, 1, 0), entry(15, 1, 1, 0, 1, 0), entry(14, 0, 1, 0, 1, 0)];
  expect([...expected].reverse().sort(compareLocalHits)).toEqual(expected);
});

function liveSelection(inputs: LocalStreamInput[], order: number[], interleaved: boolean, prepass: boolean, publishEvery = 1) {
  let bound: number | null = null;
  let processed = 0;
  const passing = new Map<string, SearchResult>();
  const outcomes: ReturnType<typeof runLocalStream>[] = [];
  const accept = (hit: SearchResult | null, index: number) => {
    if (hit) passing.set(`${index}:${hit.start}:${hit.end}:${hit.cigar}`, hit);
    if (++processed % publishEvery === 0) {
      const scores = [...passing.values()].map(value => value.local!.score * 2).sort((a, b) => b - a);
      bound = scores.length >= inputs[0].limit ? scores[inputs[0].limit - 1] : null;
    }
  };
  const drive = (index: number, iterator: ReturnType<typeof iterateLocalStream>) => {
    const next = iterator.next();
    if (next.done) { outcomes[index] = next.value; return true; }
    accept(next.value, index);
    return false;
  };
  if (prepass) {
    for (const index of order) outcomes[index] = scoreLocalStream(engine, inputs[index]);
    order = [...order].sort((a, b) => (outcomes[b].firstScore2 ?? 0) - (outcomes[a].firstScore2 ?? 0));
  }
  const active = order.filter(index => !prepass || (outcomes[index].firstScore2 !== null
    && (bound === null || outcomes[index].firstScore2! >= bound)))
    .map(index => ({ index, iterator: iterateLocalStream(engine, inputs[index], undefined, () => bound) }));
  try {
    if (interleaved) {
      while (active.length) {
        for (let position = 0; position < active.length;) {
          if (drive(active[position].index, active[position].iterator)) active.splice(position, 1);
          else position++;
        }
      }
    } else {
      for (const { index, iterator } of active) {
        if (prepass && bound !== null && outcomes[index].firstScore2! < bound) continue;
        let done = drive(index, iterator);
        while (!done) done = drive(index, iterator);
      }
    }
    return mergeLocalOutcomes(outcomes, inputs[0].limit, []);
  } finally { for (const { iterator } of active) iterator.return(undefined as never); }
}

function exhaustiveOracle(inputs: LocalStreamInput[]) {
  const hiddenOverlap: number[] = [];
  const hiddenFilters: number[] = [];
  const passing: Array<{ recordIndex: number; strand: 1 | -1; start: number; end: number; score2: number; queryStart: number }> = [];
  let noPositive = 0;
  const complement: Record<string, string> = { A: 'T', C: 'G', G: 'C', T: 'A' };
  for (const input of inputs) {
    const sequence = input.strand === 1 ? input.record.sequence
      : [...input.record.sequence].reverse().map(base => complement[base]).join('');
    const occupied: Array<{ start: number; end: number }> = [];
    const all = [...{ [Symbol.iterator]: () => engine.enumerate(codes(input.query), codes(sequence), scoring) }];
    if (!all.length) noPositive++;
    for (const a of all) {
      if (occupied.some(span => span.start < a.recordEnd && a.recordStart < span.end)) { hiddenOverlap.push(a.score2); continue; }
      occupied.push({ start: a.recordStart, end: a.recordEnd });
      let identical = 0;
      let length = 0;
      for (const match of a.cigar.matchAll(/(\d+)([=XIDS])/g)) {
        if (match[2] !== 'S') length += Number(match[1]);
        if (match[2] === '=') identical += Number(match[1]);
      }
      if ((input.filters.minIdentity !== null && 100 * identical / length < input.filters.minIdentity)
        || (input.filters.minQueryCoverage !== null && 100 * (a.queryEnd - a.queryStart) / input.query.length < input.filters.minQueryCoverage)) {
        hiddenFilters.push(a.score2);
        continue;
      }
      passing.push({ recordIndex: input.recordIndex, strand: input.strand, score2: a.score2, queryStart: a.queryStart,
        start: input.strand === 1 ? a.recordStart : sequence.length - a.recordEnd,
        end: input.strand === 1 ? a.recordEnd : sequence.length - a.recordStart });
    }
  }
  passing.sort((a, b) => b.score2 - a.score2 || a.recordIndex - b.recordIndex || b.strand - a.strand
    || a.start - b.start || a.end - b.end || a.queryStart - b.queryStart);
  const cutoff2 = passing.length >= inputs[0].limit ? passing[inputs[0].limit - 1].score2 : null;
  const inScope = (score2: number) => cutoff2 === null || score2 >= cutoff2;
  return {
    results: passing.slice(0, inputs[0].limit).map(hit => [hit.recordIndex, hit.strand, hit.start, hit.end, hit.score2 / 2, hit.queryStart]),
    counts: { cutoff: cutoff2 === null ? null : cutoff2 / 2, streams: inputs.length, noPositiveStreams: noPositive,
      skippedRecords: [], hiddenByOverlap: hiddenOverlap.filter(inScope).length, hiddenByFilters: hiddenFilters.filter(inScope).length,
      beyondLimit: Math.max(0, passing.filter(hit => inScope(hit.score2)).length - inputs[0].limit) },
  };
}

function expectOracle(inputs: LocalStreamInput[]) {
  const oracle = exhaustiveOracle(inputs);
  const order = inputs.map((_, index) => index);
  for (const prepass of [false, true]) {
    for (const interleaved of [false, true]) {
      for (const publishEvery of [1, 4]) {
        const actual = liveSelection(inputs, [...order].reverse(), interleaved, prepass, publishEvery);
        expect(actual.results.map(hit => [Number(hit.recordId.split('-')[1]), hit.strand, hit.start, hit.end,
          hit.local!.score, hit.local!.queryStart])).toEqual(oracle.results);
        expect(actual.counts).toEqual(oracle.counts);
      }
    }
  }
}

it.each([
  { query: 'AAA', sequences: ['AAAAAAAA', 'AAATAA', 'CAAAACAA'], limit: 2 },
  { query: 'ACGT', sequences: ['ACGTCCCCAC', 'ACGTACGT'], limit: 5 },
  { query: 'A', sequences: ['AAAA', 'TTTT', 'CCCC'], limit: 3 },
  { query: 'A', sequences: ['A', 'A', 'A'], limit: 2 },
  { query: 'AC', sequences: ['AC', 'CC'], limit: 10 },
])('matches the exhaustive oracle for $query and N=$limit across score-first and live schedules', ({ query, sequences, limit }) => {
  expectOracle(sequences.flatMap((sequence, index) => [inputFor(query, sequence, limit, index), inputFor(query, sequence, limit, index, -1)]));
});

it('matches exhaustive results and cutoff counts on seeded multistream inputs', () => {
  let seed = 0x519c;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
  const sequence = (length: number) => Array.from({ length }, () => 'ACGT'[(random() >>> 16) % 4]).join('');
  for (let testCase = 0; testCase < 18; testCase++) {
    const query = sequence(2 + random() % 4);
    const limit = 1 + random() % 8;
    const filters = testCase % 3 === 0 ? { minIdentity: 80, minQueryCoverage: 50 } : { minIdentity: null, minQueryCoverage: null };
    const inputs = Array.from({ length: 1 + random() % 3 }, () => sequence(5 + random() % 6))
      .flatMap((record, index) => [inputFor(query, record, limit, index, 1, filters), inputFor(query, record, limit, index, -1, filters)]);
    expectOracle(inputs);
  }
});

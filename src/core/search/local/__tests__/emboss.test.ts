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
import { beforeAll, describe, expect, it } from 'vitest';
import { formatPairAlignment } from '@/src/app/logic/hitAlignmentText';
import { hitColumns } from '../../hitColumns';
import { instantiateLocalEngine, type LocalAlignment, type LocalEngine } from '../engine';
import { localMetrics } from '../metrics';
import { encodeResidues, loadScoring, scoreOf, type LocalScoringId } from '../scoring';
import { gotoh, oracleMatrix } from './oracle/gotoh';

const root = 'src/core/search/local/__tests__/fixtures/emboss';
interface Fixture {
  name: string;
  query: string;
  record: string;
  matrix: LocalScoringId;
  matcherCount: number;
  waterQuarantine?: { reportedScore: number; pathScore: number; optimum: number };
}
interface ReferenceAlignment {
  score: number;
  queryStart: number;
  queryEnd: number;
  recordStart: number;
  recordEnd: number;
  query: string;
  record: string;
  length: number;
  identical: number;
  similar: number;
  gaps: number;
  percentages: number[];
  layout: string;
}
const fixtures = JSON.parse(readFileSync(`${root}/cases.json`, 'utf8')) as Fixture[];
function file(fixture: Fixture, name: string): string {
  return readFileSync(`${root}/${fixture.name}/${name}`, 'utf8');
}
function parse(text: string): ReferenceAlignment[] {
  return text.split('# Aligned_sequences: 2').slice(1).map(block => {
    const number = (label: string) => Number(block.match(new RegExp(`# ${label}: +(-?[\\d.]+)`))![1]);
    const rows = [...block.matchAll(/^(Query|record) +(\d+) ([A-Z-]+) +(\d+)$/gm)];
    const queryRows = rows.filter(row => row[1] === 'Query');
    const recordRows = rows.filter(row => row[1] === 'record');
    expect(queryRows.length).toBeGreaterThan(0);
    expect(queryRows.length).toBe(recordRows.length);
    const fraction = (label: string) => {
      const match = block.match(new RegExp(`# ${label}: +(\\d+)/(\\d+) \\( *([\\d.]+)%\\)`))!;
      expect(Number(match[2])).toBe(number('Length'));
      return [Number(match[1]), Number(match[3])];
    };
    const [identical, identityPercent] = fraction('Identity');
    const [similar, similarityPercent] = fraction('Similarity');
    const [gaps, gapPercent] = fraction('Gaps');
    const layout = block.slice(block.indexOf('\nQuery') + 1).split('#')[0].trimEnd() + '\n\n';
    return { score: number('Score'), queryStart: Number(queryRows[0][2]) - 1,
      queryEnd: Number(queryRows.at(-1)![4]), recordStart: Number(recordRows[0][2]) - 1,
      recordEnd: Number(recordRows.at(-1)![4]), query: queryRows.map(row => row[3]).join(''),
      record: recordRows.map(row => row[3]).join(''), length: number('Length'),
      identical, similar, gaps, percentages: [identityPercent, similarityPercent, gapPercent], layout };
  });
}
function rescore(alignment: ReferenceAlignment, score: (a: string, b: string) => number): number {
  let value = 0;
  let previousGap = '';
  for (let i = 0; i < alignment.query.length; i++) {
    const a = alignment.query[i], b = alignment.record[i];
    const gap = a === '-' ? 'query' : b === '-' ? 'record' : '';
    if (gap) value -= gap === previousGap ? 0.5 : 10;
    else value += score(a, b);
    previousGap = gap;
  }
  return value;
}
function columns(fixture: Fixture, hit: LocalAlignment) {
  const scoring = loadScoring(fixture.matrix);
  return hitColumns({ cigar: hit.cigar, query: fixture.query.toUpperCase(),
    span: fixture.record.slice(hit.recordStart, hit.recordEnd).toUpperCase(), mode: 'local',
    alphabet: fixture.matrix === 'EBLOSUM62' ? 'protein' : 'nucleotide',
    matrixScore: (a, b) => scoreOf(scoring, a, b) });
}
function comparable(reference: ReferenceAlignment) {
  const { score, queryStart, queryEnd, recordStart, recordEnd, query, record } = reference;
  return { score, queryStart, queryEnd, recordStart, recordEnd, query, record };
}
let engine: LocalEngine;
beforeAll(async () => {
  engine = await instantiateLocalEngine(await WebAssembly.compile(readFileSync('public/wasm/local-align.wasm')));
});
function enumerate(fixture: Fixture): LocalAlignment[] {
  const scoring = loadScoring(fixture.matrix);
  const q = encodeResidues(fixture.query, scoring), r = encodeResidues(fixture.record, scoring);
  if (!('codes' in q) || !('codes' in r)) throw new Error('Invalid fixture');
  return Array.from({ [Symbol.iterator]: () => engine.enumerate(q.codes, r.codes, scoring) });
}

describe.each(fixtures)('$name', fixture => {
  const water = parse(file(fixture, 'water.srspair'))[0];
  const matcher = parse(file(fixture, 'matcher.srspair'));
  const score = oracleMatrix(fixture.matrix);
  const optimum = gotoh(fixture.query, fixture.record, score);

  it('rescores water (pinning documented quarantines) and compares the first score with Gotoh and the engine', () => {
    expect(file(fixture, 'query.fa')).toBe(`>Query\n${fixture.query.toUpperCase()}\n`);
    expect(file(fixture, 'record.fa')).toBe(`>record\n${fixture.record.toUpperCase()}\n`);
    const first = enumerate(fixture)[0];
    expect(first ? first.score2 / 2 : 0).toBe(optimum);
    expect(water.query.replaceAll('-', '')).toBe(fixture.query.slice(water.queryStart, water.queryEnd).toUpperCase());
    expect(water.record.replaceAll('-', '')).toBe(fixture.record.slice(water.recordStart, water.recordEnd).toUpperCase());
    if (fixture.waterQuarantine) {
      expect({ reportedScore: water.score, pathScore: rescore(water, score), optimum })
        .toEqual(fixture.waterQuarantine);
      expect(water.score).not.toBe(optimum);
    } else {
      expect(rescore(water, score)).toBe(water.score);
      expect(water.score).toBe(optimum);
    }
  });

  it('matches every matcher alignment in order through its largest non-fatal count', () => {
    expect(matcher).toHaveLength(fixture.matcherCount);
    const commands = JSON.parse(file(fixture, 'commands.json')) as { argv: string[]; exitCode: number }[];
    const attempts = commands.slice(1);
    expect(attempts.map(attempt => Number(attempt.argv[attempt.argv.indexOf('-alternatives') + 1])))
      .toEqual(Array.from({ length: fixture.matcherCount + 1 }, (_, i) => i + 1));
    expect(attempts.slice(0, -1).every(attempt => attempt.exitCode === 0)).toBe(true);
    expect(attempts.at(-1)!.exitCode).not.toBe(0);
    expect(file(fixture, 'matcher-exhaustion.stderr')).toContain('The number of alignments computed is too large');
    const hits = enumerate(fixture);
    for (const [i, reference] of matcher.entries()) {
      expect(rescore(reference, score), `matcher path ${i}`).toBe(reference.score / 2);
      const hit = hits[i];
      expect(hit, `matcher path ${i}`).toBeDefined();
      const path = columns(fixture, hit);
      expect({ score: hit.score2 / 2, queryStart: hit.queryStart, queryEnd: hit.queryEnd,
        recordStart: hit.recordStart, recordEnd: hit.recordEnd,
        query: path.map(c => c.queryBase ?? '-').join(''),
        record: path.map(c => c.recordBase ?? '-').join('') }, `matcher path ${i}`)
        .toEqual({ ...comparable(reference), score: reference.score / 2 });
    }
  });

  it('matches water identity, similarity, gaps and printed percentages on the forward first hit', () => {
    const hit = enumerate(fixture)[0];
    if (!hit) {
      expect(optimum).toBe(0);
      return;
    }
    const metrics = localMetrics(columns(fixture, hit), hit, loadScoring(fixture.matrix), fixture.query.length);
    expect({ length: metrics.length, identical: metrics.identical, similar: metrics.similar, gaps: metrics.gaps })
      .toEqual({ length: water.length, identical: water.identical, similar: water.similar, gaps: water.gaps });
    expect([metrics.identical, metrics.similar, metrics.gaps].map(n => Number((100 * n / metrics.length).toFixed(1))))
      .toEqual(water.percentages);
  });
});

it('matches the hit-view 70-column pair layout with water at record coordinate 101', () => {
  const fixture = fixtures.find(item => item.name === 'pair-layout')!;
  const water = parse(file(fixture, 'water.srspair'))[0];
  const hit = enumerate(fixture)[0];
  expect(hit.recordStart).toBe(100);
  expect(hit.queryEnd).toBe(70);
  expect(formatPairAlignment({ columns: columns(fixture, hit), queryName: 'Query', recordName: 'record',
    queryStart: 1, recordStart: 101, strand: 1 })).toBe(water.layout);
});

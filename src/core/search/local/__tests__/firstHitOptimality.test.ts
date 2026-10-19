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
import { expect, it } from 'vitest';
import { hitColumns } from '../../hitColumns';
import { instantiateLocalEngine } from '../engine';
import { localMetrics } from '../metrics';
import { encodeResidues, loadScoring, scoreOf } from '../scoring';
import { gotoh, oracleMatrix } from './oracle/gotoh';

it('matches Gotoh on 500 seeded mixed-case cases and independently checks every emitted path and metric', async () => {
  const engine = await instantiateLocalEngine(await WebAssembly.compile(readFileSync('public/wasm/local-align.wasm')));
  let seed = 0x6a09e667;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  let hits = 0;
  const fixtures = [
    ['AAAACCCCGGGGTTTT', 'AAAAGGGGTTTT'],
    ['AAAAGGGGTTTT', 'AAAACCCCGGGGTTTT'],
    ['AAAAACCCCCGGGGG', 'AAAAACCCCGGGGG'],
    ['WWWWAAAWWWW', 'WWWWWWWW'],
    ['WWWWWWWW', 'WWWWAAAWWWW'],
    ['N', 'N'], ['BZX', 'DQA'], ['ATAT', 'AUAU'],
    ['ACNAC', 'ACNAC'], ['A', 'C'],
  ];
  for (let trial = 0; trial < 500 + fixtures.length; trial++) {
    const protein = trial < 500 ? trial % 2 === 1 : [503, 504, 505, 506].includes(trial);
    const id = protein ? 'EBLOSUM62' : 'EDNAFULL';
    const alphabet = protein ? 'ARNDCQEGHILKMFPSTWYVBZX*' : 'ACGTUSWRYKMBVHDN';
    const sequence = () => Array.from({ length: 1 + Math.floor(random() * 60) }, () => {
      const letter = alphabet[Math.floor(random() * alphabet.length)];
      return random() < 0.5 ? letter.toLowerCase() : letter;
    }).join('');
    const [query, record] = trial < 500 ? [sequence(), sequence()] : fixtures[trial - 500];
    const scoring = loadScoring(id); const score = oracleMatrix(id);
    const q = encodeResidues(query, scoring); const r = encodeResidues(record, scoring);
    if (!('codes' in q) || !('codes' in r)) throw new Error('Invalid test input');
    let previous = Infinity; let first = true;
    const usedPairs = new Set<string>();
    const optimum = gotoh(query, record, score);
    for (const hit of { [Symbol.iterator]: () => engine.enumerate(q.codes, r.codes, scoring) }) {
      if (first) expect(hit.score2 / 2, `trial ${trial}: ${query}/${record}`).toBe(optimum);
      first = false; hits++;
      expect(hit.score2).toBeGreaterThan(0);
      expect(hit.score2).toBeLessThanOrEqual(previous); previous = hit.score2;
      expect(hit.queryStart).toBeGreaterThanOrEqual(0);
      expect(hit.queryEnd).toBeLessThanOrEqual(query.length);
      expect(hit.recordStart).toBeGreaterThanOrEqual(0);
      expect(hit.recordEnd).toBeLessThanOrEqual(record.length);
      let qi = 0, ri = hit.recordStart, value = 0, length = 0, identical = 0, similar = 0, gaps = 0;
      let clipped = 0, alignedQuery = 0;
      for (const match of hit.cigar.matchAll(/(\d+)([=XIDS])/g)) {
        const count = Number(match[1]); const op = match[2];
        if (op === 'S') { qi += count; clipped += count; continue; }
        if (!length) expect(qi).toBe(hit.queryStart);
        length += count;
        if (op === 'I' || op === 'D') {
          value -= 10 + (count - 1) * 0.5; gaps += count;
          if (op === 'I') { qi += count; alignedQuery += count; } else ri += count;
        } else {
          for (let k = 0; k < count; k++) {
            const a = query[qi].toUpperCase(), b = record[ri].toUpperCase();
            expect(op).toBe(a === b ? '=' : 'X');
            const key = `${qi},${ri}`; expect(usedPairs.has(key)).toBe(false); usedPairs.add(key);
            const substitution = score(a, b); value += substitution;
            identical += Number(a === b); similar += Number(substitution > 0);
            qi++; ri++; alignedQuery++;
          }
        }
      }
      expect(qi).toBe(query.length); expect(ri).toBe(hit.recordEnd);
      expect(clipped).toBe(hit.queryStart + query.length - hit.queryEnd);
      expect(alignedQuery).toBe(hit.queryEnd - hit.queryStart);
      expect(value).toBe(hit.score2 / 2);
      const columns = hitColumns({ cigar: hit.cigar, query, span: record.slice(hit.recordStart, hit.recordEnd),
        mode: 'local', alphabet: protein ? 'protein' : 'nucleotide', matrixScore: (a, b) => scoreOf(scoring, a, b) });
      expect(localMetrics(columns, hit, scoring, query.length)).toEqual({ score: value, length, identical, similar, gaps,
        queryStart: hit.queryStart, queryEnd: hit.queryEnd, queryLength: query.length });
    }
    if (first) expect(optimum).toBe(0);
  }
  expect(hits).toBeGreaterThan(500);
}, 30_000);

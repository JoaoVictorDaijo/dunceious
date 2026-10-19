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

import { cigarSpans, formatCigar, parseCigar, type CigarOp } from '@/src/domain/bio/cigar';
import type { LocalScoring } from './scoring';

export interface LocalAlignment {
  score2: number;
  queryStart: number;
  queryEnd: number;
  recordStart: number;
  recordEnd: number;
  cigar: string;
}
export interface LocalEngine {
  maxScore(query: Uint8Array, record: Uint8Array, scoring: LocalScoring,
    onProgress?: (fraction: number) => void): number;
  enumerate(query: Uint8Array, record: Uint8Array, scoring: LocalScoring,
    onProgress?: (fraction: number) => void): Iterator<LocalAlignment>;
  peakMemoryBytes(): number;
}
interface EngineExports {
  memory: WebAssembly.Memory;
  _initialize(): void;
  malloc(bytes: number): number;
  free(pointer: number): void;
  la_create(query: number, qlen: number, record: number, rlen: number, matrix: number,
    size: number, gapOpen: number, gapExtend: number): number;
  la_max_score(query: number, qlen: number, record: number, rlen: number, matrix: number,
    size: number, gapOpen: number, gapExtend: number): number;
  la_bigpass_step(handle: number, rows: number): number;
  la_next(handle: number, output: number, ops: number, capacity: number, length: number): number;
  la_destroy(handle: number): void;
  la_peak_memory(): number;
}
const PATH_ERROR = 'Local alignment failed its path check';

function checkedAlignment(values: number[], ops: Uint8Array, query: Uint8Array,
  record: Uint8Array, scoring: LocalScoring): LocalAlignment {
  const [score2, queryStart, queryEnd, recordStart, recordEnd] = values;
  const check = (valid: boolean) => { if (!valid) throw new Error(PATH_ERROR); };
  check(score2 > 0 && queryStart >= 0 && queryStart < queryEnd && queryEnd <= query.length
    && recordStart >= 0 && recordStart < recordEnd && recordEnd <= record.length);
  const path: CigarOp[] = [];
  for (const byte of ops) {
    const op = String.fromCharCode(byte);
    check(op === '=' || op === 'X' || op === 'I' || op === 'D');
    path.push(op as CigarOp);
  }
  const cigar = (queryStart ? `${queryStart}S` : '') + formatCigar(path)
    + (queryEnd < query.length ? `${query.length - queryEnd}S` : '');
  const spans = cigarSpans(cigar);
  check(spans.query === query.length && spans.record === recordEnd - recordStart);
  let qi = 0, ri = recordStart, rescore2 = 0;
  for (const { op, length } of parseCigar(cigar)) {
    if (op === 'S') { qi += length; continue; }
    if (op === 'I' || op === 'D') {
      rescore2 -= scoring.gapOpen2 + (length - 1) * scoring.gapExtend2;
      if (op === 'I') qi += length; else ri += length;
    } else {
      for (let i = 0; i < length; i++) {
        check(qi < queryEnd && ri < recordEnd && (op === '=') === (query[qi] === record[ri]));
        rescore2 += scoring.matrix2[query[qi++] * scoring.size + record[ri++]];
      }
    }
  }
  check(qi === query.length && ri === recordEnd && rescore2 === score2);
  return { score2, queryStart, queryEnd, recordStart, recordEnd, cigar };
}

function maxScore(e: EngineExports, query: Uint8Array, record: Uint8Array, scoring: LocalScoring,
  onProgress?: (fraction: number) => void): number {
  if (scoring.size !== scoring.symbols.length || scoring.matrix2.length !== scoring.size ** 2) {
    throw new Error('Invalid local scoring matrix');
  }
  const allocated: number[] = [];
  const allocate = (bytes: number) => {
    const pointer = e.malloc(Math.max(bytes, 1));
    if (!pointer) throw new Error('Local alignment allocation failed');
    allocated.push(pointer);
    return pointer;
  };
  try {
    const q = allocate(query.length), r = allocate(record.length);
    const matrix = allocate(scoring.matrix2.byteLength);
    new Uint8Array(e.memory.buffer, q, query.length).set(query);
    new Uint8Array(e.memory.buffer, r, record.length).set(record);
    new Int32Array(e.memory.buffer, matrix, scoring.matrix2.length).set(scoring.matrix2);
    onProgress?.(0);
    const score2 = e.la_max_score(q, query.length, r, record.length, matrix, scoring.size,
      scoring.gapOpen2, scoring.gapExtend2);
    if (score2 < 0) throw new Error(`Local alignment scoring failed (${score2})`);
    onProgress?.(1);
    return score2;
  } finally { for (const pointer of allocated) e.free(pointer); }
}

/** EMBOSS 6.6.0 matcher reactor; no I/O. Close a partially consumed iterator with return(). */
export async function instantiateLocalEngine(module: WebAssembly.Module): Promise<LocalEngine> {
  const instance = await WebAssembly.instantiate(module, { env: { emscripten_notify_memory_growth() {} } });
  const e = instance.exports as unknown as EngineExports;
  e._initialize();
  return {
    peakMemoryBytes: () => e.la_peak_memory() >>> 0,
    maxScore: (query, record, scoring, onProgress) => maxScore(e, query, record, scoring, onProgress),
    *enumerate(inputQuery, inputRecord, inputScoring, onProgress) {
      // Snapshots keep suspended iterators independent of caller mutations.
      const query = inputQuery.slice(); const record = inputRecord.slice();
      const scoring = { ...inputScoring, matrix2: inputScoring.matrix2.slice() };
      if (scoring.size !== scoring.symbols.length || scoring.matrix2.length !== scoring.size ** 2) {
        throw new Error('Invalid local scoring matrix');
      }
      const allocated: number[] = [];
      let handle = 0;
      const allocate = (bytes: number) => {
        const pointer = e.malloc(Math.max(bytes, 1));
        if (!pointer) throw new Error('Local alignment allocation failed');
        allocated.push(pointer);
        return pointer;
      };
      try {
        const q = allocate(query.length), r = allocate(record.length);
        const matrix = allocate(scoring.matrix2.byteLength);
        const output = allocate(20), length = allocate(4);
        const capacity = query.length + record.length;
        const ops = allocate(capacity);
        // A wasm allocation can grow memory and detach every preceding view.
        new Uint8Array(e.memory.buffer, q, query.length).set(query);
        new Uint8Array(e.memory.buffer, r, record.length).set(record);
        new Int32Array(e.memory.buffer, matrix, scoring.matrix2.length).set(scoring.matrix2);
        handle = e.la_create(q, query.length, r, record.length, matrix, scoring.size, scoring.gapOpen2, scoring.gapExtend2);
        if (handle <= 0) throw new Error(`Local alignment creation failed (${handle})`);
        onProgress?.(0);
        let done = 0;
        while (done < query.length) {
          const next = e.la_bigpass_step(handle, 64);
          if (next <= done || next > query.length) throw new Error(`Local alignment scoring failed (${next})`);
          done = next;
          onProgress?.(done / query.length);
        }
        if (!query.length) onProgress?.(1);
        let previousScore2 = Infinity;
        while (true) {
          const status = e.la_next(handle, output, ops, capacity, length);
          if (status === 0) return;
          if (status !== 1) throw new Error(`Local alignment enumeration failed (${status})`);
          const count = new Int32Array(e.memory.buffer, length, 1)[0];
          if (count <= 0 || count > capacity) throw new Error(PATH_ERROR);
          const alignment = checkedAlignment([...new Int32Array(e.memory.buffer, output, 5)],
            new Uint8Array(e.memory.buffer, ops, count), query, record, scoring);
          if (alignment.score2 > previousScore2) throw new Error('Local alignment scores increased');
          previousScore2 = alignment.score2;
          yield alignment;
        }
      } finally {
        if (handle > 0) e.la_destroy(handle);
        for (const pointer of allocated) e.free(pointer);
      }
    },
  };
}

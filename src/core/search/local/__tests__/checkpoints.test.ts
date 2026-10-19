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
import { instantiateLocalEngine, type LocalAlignment, type CheckpointDiagnostics } from '../engine';
import { loadScoring, encodeResidues } from '../scoring';
import { reverseComplement } from '@/src/domain/bio/sequence';

let module: WebAssembly.Module;
beforeAll(async () => { module = await WebAssembly.compile(readFileSync('public/wasm/local-align.wasm')); });
const sequence = (length: number, initial: number, alphabet = 'ACGT') => {
  let seed = initial;
  return Array.from({ length }, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return alphabet[Math.floor(seed / 2 ** 32 * alphabet.length)];
  }).join('');
};
async function enumerate(query: string, record: string, checkpoints: boolean, k = 128,
  matrix: 'EDNAFULL' | 'EBLOSUM62' = 'EDNAFULL') {
  const scoring = loadScoring(matrix);
  const codes = (s: string) => {
    const result = encodeResidues(s, scoring);
    if (!('codes' in result)) throw new Error('Invalid synthetic residue');
    return result.codes;
  };
  let diagnostics: CheckpointDiagnostics | undefined;
  const engine = await instantiateLocalEngine(module, { checkpoints, onCheckpointDiagnostics: d => { diagnostics = d; } });
  const iterator = engine.enumerate(codes(query), codes(record), scoring);
  const alignments: LocalAlignment[] = [];
  let exhausted = false;
  try {
    for (let i = 0; i < k; i++) {
      const next = iterator.next();
      if (next.done) { exhausted = true; break; }
      alignments.push(next.value);
    }
  } finally { iterator.return?.(); }
  expect(diagnostics).toBeDefined();
  return { alignments, exhausted, diagnostics: diagnostics! };
}
it('resumes a SmallPass and preserves the same first 128 alignments', async () => {
  const query = sequence(96, 17);
  const background = sequence(1100, 73);
  const record = background.slice(0, 512) + query + background.slice(512 + query.length);
  const on = await enumerate(query, record, true);
  const off = await enumerate(query, record, false);
  expect(on.alignments).toEqual(off.alignments);
  expect(on.exhausted).toBe(off.exhausted);
  expect(on.diagnostics.resumes).toBeGreaterThan(0);
  expect(off.diagnostics.resumes).toBe(0);
});
it('preserves the first four alignments when the budget widens checkpoints to 512 columns', async () => {
  const query = sequence(1024, 17);
  const background = sequence(45056, 73);
  const record = background.slice(0, 2048) + query + background.slice(2048 + query.length);
  const on = await enumerate(query, record, true, 4);
  const off = await enumerate(query, record, false, 4);
  expect(on.alignments).toHaveLength(4);
  expect(on.alignments[0].recordStart).toBe(2048);
  expect(on.alignments).toEqual(off.alignments);
  expect(on.exhausted).toBe(off.exhausted);
  expect(on.diagnostics.step).toBe(512);
  expect(on.diagnostics.bytes).toBe(2164800);
  expect(on.diagnostics.resumes).toBeGreaterThan(0);
  expect(off.diagnostics.bytes).toBe(0);
  expect(off.diagnostics.resumes).toBe(0);
});
it('plans checkpoint storage within 4 MiB without allocating large inputs', async () => {
  const instance = await WebAssembly.instantiate(module, { env: { emscripten_notify_memory_growth() {} } });
  const plan = instance.exports.la_checkpoint_step as (q: number, r: number) => number;
  expect(plan(0, 1000)).toBe(0);
  expect(plan(-1, 1000)).toBe(0);
  expect(plan(96, 255)).toBe(0);
  expect(plan(96, 256)).toBe(256);
  expect(plan(2000, 30000)).toBe(512);
  expect(plan(174761, 256)).toBe(256);
  expect(plan(174761, 1024)).toBe(1024);
  expect(plan(174762, 256)).toBe(0);
  expect(plan(2147483647, 2147483647)).toBe(0);
});

it.each([511, 512, 513, 514])('pins the first start at column %i around checkpoint 512 (first 128)', async start => {
  const query = sequence(96, 17);
  const background = sequence(1100, 73);
  const record = background.slice(0, start - 1) + query + background.slice(start - 1 + query.length);
  const on = await enumerate(query, record, true);
  const off = await enumerate(query, record, false);
  expect(on.alignments[0].recordStart).toBe(start - 1);
  expect(on.alignments).toEqual(off.alignments);
  expect(on.exhausted).toBe(off.exhausted);
  const firstResume = await enumerate(query, record, true, 2);
  expect(firstResume.diagnostics.resumes).toBe(1);
  expect(firstResume.diagnostics.lastColumn).toBe(Math.floor((start - 1) / 256) * 256);
});

it.each([255, 256, 257, 512, 513])('compares every alignment for a %i-column record', async length => {
  const query = sequence(6, 91);
  const record = sequence(length, 25);
  const on = await enumerate(query, record, true, Infinity);
  const off = await enumerate(query, record, false, Infinity);
  expect(on.exhausted).toBe(true);
  expect(off.exhausted).toBe(true);
  expect(on.alignments).toEqual(off.alignments);
  expect(on.diagnostics.step).toBe(length < 256 ? 0 : 256);
  expect(on.diagnostics.bytes).toBe(Math.floor(length / 256) * 7 * 6 * 4);
  expect(off.diagnostics.bytes).toBe(0);
});

it('exhausts a one-residue query with a column-1 alignment on the unchanged SmallPass path', async () => {
  const on = await enumerate('A', 'A' + sequence(512, 81), true, Infinity);
  const off = await enumerate('A', 'A' + sequence(512, 81), false, Infinity);
  expect(on.alignments).toEqual(off.alignments);
  expect(on.alignments[0].recordStart).toBe(0);
  expect(on.exhausted).toBe(true);
  expect(off.exhausted).toBe(true);
  expect(on.diagnostics.smallPasses).toBeGreaterThan(0);
  expect(on.diagnostics.resumes).toBe(0);
});

it.each(['left', 'right'] as const)('preserves a second alignment to the %s of the first (first 128)', async side => {
  const query = sequence(32, 41);
  const mutated = query.slice(0, 16) + (query[16] === 'A' ? 'C' : 'A') + query.slice(17);
  const first = side === 'left' ? 700 : 300;
  const second = side === 'left' ? 300 : 700;
  let record = sequence(1100, 73);
  record = record.slice(0, first) + query + record.slice(first + query.length);
  record = record.slice(0, second) + mutated + record.slice(second + mutated.length);
  const on = await enumerate(query, record, true);
  const off = await enumerate(query, record, false);
  expect(on.alignments).toEqual(off.alignments);
  expect(on.alignments[0].recordStart).toBe(first);
  expect(on.alignments[1].recordStart).toBe(second);
  expect(on.exhausted).toBe(off.exhausted);
});

it('preserves a long deletion crossing checkpoint 512 (first 128)', async () => {
  const query = 'ACGT'.repeat(20);
  const record = sequence(456, 73) + query.slice(0, 40) + 'N'.repeat(60) + query.slice(40) + sequence(200, 87);
  const on = await enumerate(query, record, true);
  const off = await enumerate(query, record, false);
  expect(on.alignments).toEqual(off.alignments);
  expect(on.exhausted).toBe(off.exhausted);
  let column = on.alignments[0].recordStart + 1;
  let crosses = false;
  for (const match of on.alignments[0].cigar.matchAll(/(\d+)([=XIDS])/g)) {
    const length = Number(match[1]);
    if (match[2] === 'D' && length >= 50 && column <= 512 && column + length > 512) crosses = true;
    if (['=', 'X', 'D'].includes(match[2])) column += length;
  }
  expect(crosses).toBe(true);
  expect(on.diagnostics.resumes).toBeGreaterThan(0);
});

it.each([1, -1] as const)('compares tandem, inverted and gapped copies on strand %i (first 128)', async strand => {
  const query = sequence(48, 151);
  const near = query.slice(0, 24) + 'GG' + query.slice(24);
  const raw = sequence(300, 51) + query + near + reverseComplement(query) + sequence(256, 113);
  const record = strand === 1 ? raw : reverseComplement(raw);
  const on = await enumerate(query, record, true);
  const off = await enumerate(query, record, false);
  expect(on.alignments).toEqual(off.alignments);
  expect(on.exhausted).toBe(off.exhausted);
  expect(on.alignments.some(a => /[ID]/.test(a.cigar))).toBe(true);
  expect(on.diagnostics.resumes).toBeGreaterThan(0);
});

it('preserves IUPAC codes, N runs and RNA U (first 128)', async () => {
  const query = 'ACGU'.repeat(6) + 'RYSWKMBDHVN';
  const record = sequence(520, 9, 'ACGU') + query + 'N'.repeat(80) + sequence(400, 19, 'ACGURYSWKMBDHVN');
  const on = await enumerate(query, record, true);
  const off = await enumerate(query, record, false);
  expect(on.alignments).toEqual(off.alignments);
  expect(on.exhausted).toBe(off.exhausted);
  expect(on.diagnostics.resumes).toBeGreaterThan(0);
});

it.each([127, 1100])('compares EBLOSUM62 with %i record residues', async length => {
  const alphabet = 'ARNDCQEGHILKMFPSTWYV';
  const query = sequence(length < 256 ? 4 : 96, 17, alphabet);
  let record = sequence(length, 73, alphabet);
  if (length >= 256) record = record.slice(0, 512) + query + record.slice(512 + query.length);
  const k = length < 256 ? Infinity : 128;
  const on = await enumerate(query, record, true, k, 'EBLOSUM62');
  const off = await enumerate(query, record, false, k, 'EBLOSUM62');
  expect(on.alignments).toEqual(off.alignments);
  expect(on.exhausted).toBe(off.exhausted);
  if (length < 256) {
    expect(on.exhausted).toBe(true);
    expect(on.diagnostics.bytes).toBe(0);
  } else {
    expect(on.diagnostics.step).toBe(256);
    expect(on.diagnostics.bytes).toBe(4 * 97 * 6 * 4);
    expect(on.diagnostics.resumes).toBeGreaterThan(0);
  }
});

const seeds = Number(process.env.LOCAL_CHECKPOINT_SEEDS ?? 32);
it('preserves the first 128 alignments for every fixed synthetic seed', async () => {
  if (!Number.isSafeInteger(seeds) || seeds < 1) throw new Error('LOCAL_CHECKPOINT_SEEDS must be a positive integer');
  let resumes = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const protein = seed % 3 === 0;
    const alphabet = protein ? 'ARNDCQEGHILKMFPSTWYVBZX*' : 'ACGTUSWRYKMBVHDN';
    const query = sequence(24 + seed % 73, seed, alphabet);
    const background = sequence(768 + seed % 5 * 128, seed + 100, alphabet);
    let copy = query;
    if (seed % 4 === 0) copy = query.slice(0, 12) + sequence(3, seed + 200, alphabet) + query.slice(12);
    if (seed % 4 === 1) copy = query.slice(0, 12) + query.slice(15);
    let record = background.slice(0, 511 + seed % 4) + copy + background.slice(511 + seed % 4 + copy.length);
    if (!protein && seed % 5 === 0) record = reverseComplement(record, record.includes('U') ? 'rna' : 'dna');
    const matrix = protein ? 'EBLOSUM62' : 'EDNAFULL';
    const on = await enumerate(query, record, true, 128, matrix);
    const off = await enumerate(query, record, false, 128, matrix);
    expect(on.alignments, `seed ${seed}`).toEqual(off.alignments);
    expect(on.exhausted, `seed ${seed}`).toBe(off.exhausted);
    resumes += on.diagnostics.resumes;
  }
  expect(resumes).toBeGreaterThan(0);
}, Math.max(60000, seeds * 5000));

it('restricts the switch to before BigPass and reports invalid diagnostic requests', async () => {
  const instance = await WebAssembly.instantiate(module, { env: { emscripten_notify_memory_growth() {} } });
  const e = instance.exports as unknown as {
    memory: WebAssembly.Memory; _initialize(): void; malloc(n: number): number; free(p: number): void;
    la_create(q: number, qlen: number, r: number, rlen: number, m: number, size: number, open: number, extend: number): number;
    la_set_checkpoints(h: number, enabled: number): number; la_bigpass_step(h: number, rows: number): number;
    la_checkpoint_stat(h: number, field: number): number; la_destroy(h: number): void;
  };
  e._initialize();
  const q = e.malloc(1), r = e.malloc(257), m = e.malloc(4);
  new Uint8Array(e.memory.buffer, q, 1).fill(0);
  new Uint8Array(e.memory.buffer, r, 257).fill(0);
  new Int32Array(e.memory.buffer, m, 1)[0] = 10;
  const handle = e.la_create(q, 1, r, 257, m, 1, 20, 1);
  try {
    expect(handle).toBeGreaterThan(0);
    expect(e.la_set_checkpoints(0, 1)).toBe(-1);
    expect(e.la_set_checkpoints(handle, 2)).toBe(-1);
    expect(e.la_set_checkpoints(handle, 0)).toBe(0);
    expect(e.la_set_checkpoints(handle, 1)).toBe(0);
    expect(e.la_bigpass_step(handle, 1)).toBe(1);
    expect(e.la_set_checkpoints(handle, 0)).toBe(-3);
    expect(e.la_checkpoint_stat(handle, 0)).toBe(256);
    expect(e.la_checkpoint_stat(handle, 1)).toBe(48);
    expect(e.la_checkpoint_stat(handle, 99)).toBe(-1);
  } finally { e.la_destroy(handle); e.free(q); e.free(r); e.free(m); }
  expect(e.la_checkpoint_stat(handle, 0)).toBe(-1);
});

it('keeps non-origin SmallPass regions on the unchanged path despite a usable prefix', async () => {
  const record = 'C'.repeat(599) + 'AAAA' + 'C'.repeat(100);
  const on = await enumerate('AA', record, true, Infinity);
  const off = await enumerate('AA', record, false, Infinity);
  expect(on.alignments).toEqual(off.alignments);
  expect(on.exhausted).toBe(true);
  expect(off.exhausted).toBe(true);
  expect(on.alignments[0].recordStart).toBe(599);
  expect(on.diagnostics.smallPasses).toBeGreaterThan(0);
  expect(on.diagnostics.resumes).toBe(0);
});

it('enables checkpoints by default without calling the test switch', async () => {
  const scoring = loadScoring('EDNAFULL');
  const query = sequence(96, 17);
  const record = sequence(512, 73) + query + sequence(492, 91);
  const q = encodeResidues(query, scoring), r = encodeResidues(record, scoring);
  if (!('codes' in q) || !('codes' in r)) throw new Error('Invalid synthetic residue');
  let diagnostics: CheckpointDiagnostics | undefined;
  const engine = await instantiateLocalEngine(module, { onCheckpointDiagnostics: d => { diagnostics = d; } });
  const iterator = engine.enumerate(q.codes, r.codes, scoring);
  try { iterator.next(); iterator.next(); }
  finally { iterator.return?.(); }
  expect(diagnostics?.resumes).toBe(1);
  expect(diagnostics?.bytes).toBeGreaterThan(0);
});

it('releases the iterator when a diagnostic observer throws', async () => {
  const scoring = loadScoring('EDNAFULL');
  let calls = 0;
  const engine = await instantiateLocalEngine(module, { onCheckpointDiagnostics() {
    if (++calls === 1) throw new Error('diagnostic observer failed');
  } });
  const iterator = engine.enumerate(new Uint8Array([0]), new Uint8Array([0]), scoring);
  expect(iterator.next().value?.score2).toBe(10);
  expect(() => iterator.return?.()).toThrow('diagnostic observer failed');
  expect(Array.from({ [Symbol.iterator]: () => engine.enumerate(new Uint8Array([0]), new Uint8Array([0]), scoring) }))
    .toHaveLength(1);
  expect(calls).toBe(2);
});

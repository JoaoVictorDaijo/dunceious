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

import { linkSync, symlinkSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import * as engineModule from '../src/core/search/local/engine';
import { runCheckpointHarness } from './checkpointHarness';
import { exportToGenBank } from '../src/core/genbank';
import { instantiateLocalEngine } from '../src/core/search/local/engine';
import { encodeResidues, loadScoring } from '../src/core/search/local/scoring';
import { reverseComplement } from '../src/domain/bio/sequence';

function syntheticSequence(length: number, initial: number, alphabet = 'ACGT') {
  let seed = initial;
  return Array.from({ length }, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return alphabet[Math.floor(seed / 2 ** 32 * alphabet.length)];
  }).join('');
}

async function referenceDigest(query: string, record: string) {
  const scoring = loadScoring('EDNAFULL');
  const q = encodeResidues(query, scoring), r = encodeResidues(record, scoring);
  if (!('codes' in q) || !('codes' in r)) throw new Error('Invalid synthetic fixture');
  const engine = await instantiateLocalEngine(await WebAssembly.compile(readFileSync('public/wasm/local-align.wasm')));
  const iterator = engine.enumerate(q.codes, r.codes, scoring);
  const hash = createHash('sha256');
  try {
    for (let i = 0; i < 32; i++) {
      const next = iterator.next();
      if (next.done) break;
      const a = next.value;
      hash.update(JSON.stringify([a.score2, a.queryStart, a.queryEnd, a.recordStart, a.recordEnd, a.cigar]) + '\n');
    }
  } finally { iterator.return?.(); }
  return hash.digest('hex');
}

it('compares synthetic FASTA/GenBank streams and emits only digests and diagnostics', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'local-checkpoint-harness-'));
  try {
    const query = syntheticSequence(36, 17).replaceAll('T', 'U');
    const record = syntheticSequence(320, 73) + reverseComplement(query, 'rna') + syntheticSequence(200, 91);
    writeFileSync(join(directory, 'query.fa'), `>dummy DO_NOT_PRINT
AAAA
>source DO_NOT_PRINT
--${query.slice(0, 10)}-${query.slice(10)}--
`);
    writeFileSync(join(directory, 'target.gb'), exportToGenBank([
      { id: 'first', name: 'DO_NOT_PRINT', features: [], sequence: syntheticSequence(80, 23), moleculeType: 'dna' },
      { id: 'second', name: 'DO_NOT_PRINT', features: [], sequence: record, moleculeType: 'dna' },
    ]).text);
    const protein = syntheticSequence(24, 41, 'ARNDCQEGHILKMFPSTWYV');
    writeFileSync(join(directory, 'protein.gb'), exportToGenBank([
      { id: 'protein', name: 'DO_NOT_PRINT', features: [], sequence: protein, moleculeType: 'protein' },
    ]).text);
    writeFileSync(join(directory, 'protein.fa'), `>target DO_NOT_PRINT
--${protein.slice(0, 10)}-${protein.slice(10)}AAA${protein}--
`);
    const cases = { cases: [
      { id: 'synthetic-rna', moleculeType: 'rna', query: { file: 'query.fa', recordIndex: 1, start: 2, length: 24, strand: -1 },
        target: { file: 'target.gb', records: [1, 0] }, strands: 'both', maxAlignments: 32 },
      { id: 'synthetic-protein', moleculeType: 'protein', query: { file: 'protein.gb', recordIndex: 0, start: 0, length: 24, strand: 1 },
        target: { file: 'protein.fa', records: [0] }, strands: 'both', maxAlignments: 32 },
    ] };
    writeFileSync(join(directory, 'cases.json'), JSON.stringify(cases));
    writeFileSync(join(directory, 'summary.json'), 'previous summary');
    const output: string[] = [];
    const rows = await runCheckpointHarness(join(directory, 'cases.json'), join(directory, 'summary.json'), line => output.push(line));
    expect(rows).toHaveLength(5);
    expect(rows.map(row => [row.caseId, row.stream.recordIndex, row.stream.strand])).toEqual([
      ['synthetic-rna', 1, 1], ['synthetic-rna', 1, -1], ['synthetic-rna', 0, 1], ['synthetic-rna', 0, -1], ['synthetic-protein', 0, 1],
    ]);
    expect(rows.every(row => row.result === 'IDENTICAL' && row.on.sha256 === row.off.sha256)).toBe(true);
    expect(rows[0].on.alignments).toBe(32);
    expect(rows[0].on.diagnostics.bytes).toBeGreaterThan(0);
    expect(rows.every(row => row.off.diagnostics.resumes === 0 && row.off.diagnostics.bytes === 0)).toBe(true);
    expect(JSON.parse(readFileSync(join(directory, 'summary.json'), 'utf8'))).toEqual({ streams: rows });
    expect(output.map(line => JSON.parse(line))).toEqual(rows);
    expect(output.join('')).not.toContain('DO_NOT_PRINT');
    expect(output.join('')).not.toContain(query);
    const orientedQuery = reverseComplement(query.slice(2, 26), 'rna');
    expect(rows[0].on.sha256).toBe(await referenceDigest(orientedQuery, record));
    expect(rows[1].on.sha256).toBe(await referenceDigest(orientedQuery, reverseComplement(record, 'rna')));

  } finally { rmSync(directory, { recursive: true, force: true }); }
});

it('rejects synthetic invalid inputs without exposing record text', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'local-checkpoint-harness-'));
  try {
    writeFileSync(join(directory, 'invalid.fa'), `>DO_NOT_PRINT
ACGT.SECRET
`);
    const manifest = { cases: [{ id: 'synthetic-invalid', moleculeType: 'dna',
      query: { file: 'invalid.fa', recordIndex: 0, start: 0, length: 11, strand: 1 },
      target: { file: 'invalid.fa', records: [0] }, strands: 'fwd', maxAlignments: 32 }] };
    writeFileSync(join(directory, 'cases.json'), JSON.stringify(manifest));
    const output: string[] = [];
    await expect(runCheckpointHarness(join(directory, 'cases.json'), join(directory, 'summary.json'), line => output.push(line)))
      .rejects.toThrow('Checkpoint differential harness failed; no record content is reported');
    expect(output).toEqual([]);
    writeFileSync(join(directory, 'cases.json'), '{ "cases": "DO_NOT_PRINT" }');
    await expect(runCheckpointHarness(join(directory, 'cases.json'), join(directory, 'summary.json')))
      .rejects.toThrow('Checkpoint differential harness failed; no record content is reported');
    writeFileSync(join(directory, 'invalid.fa'), '>synthetic DO_NOT_PRINT\nACGTACGTACGT\n');
    manifest.cases[0].query.start = 20;
    writeFileSync(join(directory, 'cases.json'), JSON.stringify(manifest));
    await expect(runCheckpointHarness(join(directory, 'cases.json'), join(directory, 'summary.json')))
      .rejects.toThrow('Checkpoint differential harness failed; no record content is reported');
    manifest.cases[0].query.start = 0;
    manifest.cases[0].target.records = [99];
    writeFileSync(join(directory, 'cases.json'), JSON.stringify(manifest));
    await expect(runCheckpointHarness(join(directory, 'cases.json'), join(directory, 'summary.json')))
      .rejects.toThrow('Checkpoint differential harness failed; no record content is reported');
    manifest.cases[0].target.records = [0];
    writeFileSync(join(directory, 'cases.json'), JSON.stringify(manifest));
    const before = readFileSync(join(directory, 'invalid.fa'), 'utf8');
    await expect(runCheckpointHarness(join(directory, 'cases.json'), join(directory, 'invalid.fa')))
      .rejects.toThrow('Checkpoint differential harness failed; no record content is reported');
    expect(readFileSync(join(directory, 'invalid.fa'), 'utf8')).toBe(before);

  } finally { rmSync(directory, { recursive: true, force: true }); }
});

it('reports DIFFER for synthetic enumeration differences without printing alignments', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'local-checkpoint-harness-'));
  const original = engineModule.instantiateLocalEngine;
  const spy = vi.spyOn(engineModule, 'instantiateLocalEngine').mockImplementation(async (module, options) => {
    const engine = await original(module, options);
    if (options?.checkpoints !== false) return engine;
    return { ...engine, *enumerate(...args) {
      const iterator = engine.enumerate(...args);
      try {
        while (true) {
          const next = iterator.next();
          if (next.done) return;
          yield { ...next.value, score2: next.value.score2 + 1 };
        }
      } finally { iterator.return?.(); }
    } };
  });
  try {
    writeFileSync(join(directory, 'synthetic.fa'), '>synthetic DO_NOT_PRINT\nACGTACGT\n');
    writeFileSync(join(directory, 'cases.json'), JSON.stringify({ cases: [{ id: 'synthetic-difference', moleculeType: 'dna',
      query: { file: 'synthetic.fa', recordIndex: 0, start: 0, length: 8, strand: 1 },
      target: { file: 'synthetic.fa', records: [0] }, strands: 'fwd', maxAlignments: 32 }] }));
    const output: string[] = [];
    const rows = await runCheckpointHarness(join(directory, 'cases.json'), join(directory, 'summary.json'), line => output.push(line));
    expect(rows[0].result).toBe('DIFFER');
    expect(rows[0].on.alignments).toBe(rows[0].off.alignments);
    expect(rows[0].on.sha256).not.toBe(rows[0].off.sha256);
    expect(output.join('')).not.toContain('DO_NOT_PRINT');
    expect(output.join('')).not.toContain('cigar');
  } finally { spy.mockRestore(); rmSync(directory, { recursive: true, force: true }); }
});

it.each(['symlink', 'hardlink'])('preserves synthetic inputs aliased by a %s summary', async kind => {
  const directory = mkdtempSync(join(tmpdir(), 'local-checkpoint-harness-'));
  try {
    const input = join(directory, 'synthetic.fa'), summary = join(directory, 'summary.json');
    const content = '>synthetic\nACGTACGT\n';
    writeFileSync(input, content);
    if (kind === 'symlink') symlinkSync(input, summary);
    else linkSync(input, summary);
    writeFileSync(join(directory, 'cases.json'), JSON.stringify({ cases: [{ id: 'synthetic-alias', moleculeType: 'dna',
      query: { file: 'synthetic.fa', recordIndex: 0, start: 0, length: 8, strand: 1 },
      target: { file: 'synthetic.fa', records: [0] }, strands: 'fwd', maxAlignments: 2 }] }));
    await expect(runCheckpointHarness(join(directory, 'cases.json'), summary, () => {}))
      .rejects.toThrow('Checkpoint differential harness failed; no record content is reported');
    expect(readFileSync(input, 'utf8')).toBe(content);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

it.runIf(Boolean(process.env.LOCAL_CHECKPOINT_CASES))('compares configured record cases', async () => {
  const cases = process.env.LOCAL_CHECKPOINT_CASES;
  const summary = process.env.LOCAL_CHECKPOINT_SUMMARY;
  if (!cases || !summary) throw new Error('Set LOCAL_CHECKPOINT_CASES and LOCAL_CHECKPOINT_SUMMARY');
  const rows = await runCheckpointHarness(cases, summary);
  expect(rows.every(row => row.result === 'IDENTICAL'), 'Checkpoint mismatch; see the JSON summary').toBe(true);
}, 3600000);

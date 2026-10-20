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

import { closeSync, fstatSync, ftruncateSync, openSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { parseFasta } from '../src/core/formats/fasta';
import { parseGenBank } from '../src/core/genbank';
import { complementAlphabet, removeGapsWithMap, reverseComplement } from '../src/domain/bio/sequence';
import type { SeqRecord } from '../src/domain/bio/types';
import { instantiateLocalEngine, type CheckpointDiagnostics } from '../src/core/search/local/engine';
import { encodeResidues, loadScoring, scoringFor, type LocalScoring } from '../src/core/search/local/scoring';

type Molecule = 'dna' | 'rna' | 'protein';
interface CheckpointCase {
  id: string;
  moleculeType: Molecule;
  query: { file: string; recordIndex: number; start: number; length: number; strand: 1 | -1 };
  target: { file: string; records: number[] };
  strands: 'fwd' | 'rev' | 'both';
  maxAlignments: number;
}
interface PathResult {
  alignments: number;
  sha256: string;
  wallMs: number;
  diagnostics: CheckpointDiagnostics;
}
export interface CheckpointComparison {
  caseId: string;
  stream: { recordIndex: number; strand: 1 | -1 };
  result: 'IDENTICAL' | 'DIFFER';
  on: PathResult;
  off: PathResult;
}
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isIndex = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;

function checkedCase(value: unknown): CheckpointCase {
  if (!isObject(value) || !isObject(value.query) || !isObject(value.target)) throw new Error('Invalid case');
  const q = value.query, t = value.target;
  if (typeof value.id !== 'string' || !/^[A-Za-z0-9_.-]+$/.test(value.id)
    || typeof value.moleculeType !== 'string' || !['dna', 'rna', 'protein'].includes(value.moleculeType)
    || typeof value.strands !== 'string' || !['fwd', 'rev', 'both'].includes(value.strands)
    || !isIndex(value.maxAlignments) || value.maxAlignments < 1
    || typeof q.file !== 'string' || !q.file || !isIndex(q.recordIndex)
    || !isIndex(q.start) || !isIndex(q.length) || q.length < 1 || (q.strand !== 1 && q.strand !== -1)
    || typeof t.file !== 'string' || !t.file || !Array.isArray(t.records) || !t.records.length
    || !t.records.every(isIndex) || new Set(t.records).size !== t.records.length
    || (value.moleculeType === 'protein' && q.strand === -1)) throw new Error('Invalid case');
  return value as unknown as CheckpointCase;
}

function readCases(file: string): CheckpointCase[] {
  const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (!isObject(parsed) || !Array.isArray(parsed.cases) || !parsed.cases.length) throw new Error('Invalid cases');
  const cases = parsed.cases.map(checkedCase);
  if (new Set(cases.map(c => c.id)).size !== cases.length) throw new Error('Duplicate case identifier');
  return cases.map(c => ({ ...c,
    query: { ...c.query, file: resolve(dirname(file), c.query.file) },
    target: { ...c.target, file: resolve(dirname(file), c.target.file) },
  }));
}

function recordsFrom(file: string, cache: Map<string, SeqRecord[]>): SeqRecord[] {
  const cached = cache.get(file);
  if (cached) return cached;
  const content = readFileSync(file, 'utf8').trimStart();
  let records: SeqRecord[];
  if (content.startsWith('>')) records = parseFasta(content);
  else if (content.startsWith('LOCUS')) records = parseGenBank(content);
  else throw new Error('Unsupported format');
  if (!records.length) throw new Error('No parsed records');
  cache.set(file, records);
  return records;
}

function codes(sequence: string, scoring: LocalScoring): Uint8Array {
  const result = encodeResidues(sequence, scoring);
  if (!('codes' in result)) throw new Error('Unsupported residues');
  return result.codes;
}

function queryCodes(c: CheckpointCase, cache: Map<string, SeqRecord[]>, scoring: LocalScoring): Uint8Array {
  const record = recordsFrom(c.query.file, cache)[c.query.recordIndex];
  if (!record) throw new Error('Invalid query record index');
  const raw = record.alignedSequence || record.sequence;
  const forward = removeGapsWithMap(raw).ungapped;
  if (c.query.start > forward.length || c.query.length > forward.length - c.query.start) throw new Error('Invalid query range');
  const part = forward.slice(c.query.start, c.query.start + c.query.length);
  const oriented = c.query.strand === 1 ? part
    : reverseComplement(part, complementAlphabet(raw, record.moleculeType ?? c.moleculeType));
  return codes(oriented, scoring);
}

function targetCodes(record: SeqRecord, strand: 1 | -1, molecule: Molecule, scoring: LocalScoring): Uint8Array {
  const raw = record.alignedSequence || record.sequence;
  const oriented = strand === 1 ? raw : reverseComplement(raw, complementAlphabet(raw, record.moleculeType ?? molecule));
  return codes(removeGapsWithMap(oriented).ungapped, scoring);
}

async function makeRunner(module: WebAssembly.Module, checkpoints: boolean) {
  let diagnostics: CheckpointDiagnostics | undefined;
  const engine = await instantiateLocalEngine(module, { checkpoints, onCheckpointDiagnostics: d => { diagnostics = d; } });
  return (query: Uint8Array, record: Uint8Array, scoring: LocalScoring, k: number): PathResult => {
    diagnostics = undefined;
    const hash = createHash('sha256');
    const iterator = engine.enumerate(query, record, scoring);
    let alignments = 0;
    const start = performance.now();
    try {
      for (let i = 0; i < k; i++) {
        const next = iterator.next();
        if (next.done) break;
        const a = next.value;
        hash.update(JSON.stringify([a.score2, a.queryStart, a.queryEnd, a.recordStart, a.recordEnd, a.cigar]) + '\n');
        alignments++;
      }
    } finally { iterator.return?.(); }
    const wallMs = performance.now() - start;
    if (!diagnostics) throw new Error('Missing checkpoint diagnostics');
    return { alignments, sha256: hash.digest('hex'), wallMs, diagnostics };
  };
}

async function compareCases(cases: CheckpointCase[], module: WebAssembly.Module,
  writeLine: (line: string) => void): Promise<CheckpointComparison[]> {
  const on = await makeRunner(module, true), off = await makeRunner(module, false);
  const cache = new Map<string, SeqRecord[]>();
  const rows: CheckpointComparison[] = [];
  for (const c of cases) {
    const scoring = loadScoring(scoringFor(c.moleculeType === 'protein'));
    const query = queryCodes(c, cache, scoring);
    const targets = recordsFrom(c.target.file, cache);
    const strands: Array<1 | -1> = c.moleculeType === 'protein' || c.strands === 'fwd' ? [1]
      : c.strands === 'rev' ? [-1] : [1, -1];
    for (const recordIndex of c.target.records) {
      if (!targets[recordIndex]) throw new Error('Invalid target record index');
      for (const strand of strands) {
        const record = targetCodes(targets[recordIndex], strand, c.moleculeType, scoring);
        const enabled = on(query, record, scoring, c.maxAlignments);
        const disabled = off(query, record, scoring, c.maxAlignments);
        const row: CheckpointComparison = { caseId: c.id, stream: { recordIndex, strand }, on: enabled, off: disabled,
          result: enabled.alignments === disabled.alignments && enabled.sha256 === disabled.sha256 ? 'IDENTICAL' : 'DIFFER' };
        rows.push(row);
        writeLine(JSON.stringify(row));
      }
    }
  }
  return rows;
}

function writeSummary(file: string, inputs: string[], streams: CheckpointComparison[]) {
  // Inspect the opened inode before truncation: path aliases must never overwrite source records.
  const descriptor = openSync(file, 'a');
  try {
    const output = fstatSync(descriptor);
    if (inputs.some(input => {
      const source = statSync(input);
      return source.dev === output.dev && source.ino === output.ino;
    })) throw new Error('Summary would overwrite an input');
    ftruncateSync(descriptor, 0);
    writeFileSync(descriptor, JSON.stringify({ streams }, null, 2) + '\n');
  } finally { closeSync(descriptor); }
}

/** Errors are deliberately redacted so parser/engine failures cannot print record content. */
export async function runCheckpointHarness(caseFile: string, summaryFile: string,
  writeLine: (line: string) => void = line => console.log(line)): Promise<CheckpointComparison[]> {
  try {
    const cases = readCases(caseFile);
    const inputs = [resolve(caseFile), ...cases.flatMap(c => [c.query.file, c.target.file])];
    if (inputs.includes(resolve(summaryFile))) throw new Error('Summary would overwrite an input');
    const module = await WebAssembly.compile(readFileSync('public/wasm/local-align.wasm'));
    const streams = await compareCases(cases, module, writeLine);
    writeSummary(summaryFile, inputs, streams);
    return streams;
  } catch { throw new Error('Checkpoint differential harness failed; no record content is reported'); }
}

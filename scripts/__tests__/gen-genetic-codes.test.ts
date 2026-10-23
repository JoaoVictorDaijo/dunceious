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

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { afterEach, expect, it } from 'vitest';

const registry = JSON.parse(readFileSync(new URL('../../docs/standards/sources.json', import.meta.url), 'utf8'));
const oracle = JSON.parse(readFileSync(new URL('../../src/domain/bio/__tests__/fixtures/ncbi-genetic-codes.biopython.json', import.meta.url), 'utf8')) as {
  tables: Record<string, { name: string; codons: Record<string, string>; starts: string }>;
};

// NCBI's gc.prt is pinned and fetched, not redistributed (docs/standards/sources.md), so the
// generator reads input written here in gc.prt's ASN.1 layout from the independent Biopython
// tables. Its own checksum is pinned in the throwaway registry below.
const gcPrt = (version = '4.6') => Buffer.from([
  '--**************************************************************************',
  `--  Version ${version}`,
  '--**************************************************************************',
  'Genetic-code-table ::= {',
  Object.entries(oracle.tables).map(([id, table]) => [
    ' {',
    `  name "${table.name}" ,`,
    `  id ${id} ,`,
    `  ncbieaa  "${Object.values(table.codons).join('').replace(/_/g, '*')}",`,
    `  sncbieaa "${table.starts}"`,
    ' }',
  ].join('\n')).join(' ,\n'),
  '}',
  '',
].join('\n'), 'latin1');
const pinned = gcPrt();
const pinnedChecksum = createHash('sha256').update(pinned).digest('hex');
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function workspace(bytes = pinned, checksum = pinnedChecksum) {
  const dir = mkdtempSync(path.join(tmpdir(), 'dunceious-genetic-codes-'));
  dirs.push(dir);
  for (const sub of ['docs/standards', '.cache/standards', 'scripts', 'src/domain/bio']) {
    mkdirSync(path.join(dir, sub), { recursive: true });
  }
  const documents = structuredClone(registry.documents);
  const pin = documents.find((doc: { id: string }) => doc.id === 'ncbi-genetic-codes');
  pin.sha256 = checksum;
  writeFileSync(path.join(dir, 'docs/standards/sources.json'), JSON.stringify({ documents }));
  writeFileSync(path.join(dir, '.cache/standards/gc.prt'), bytes);
  writeFileSync(path.join(dir, 'scripts/gen-genetic-codes.mjs'), readFileSync(new URL('../gen-genetic-codes.mjs', import.meta.url)));
  const output = path.join(dir, 'src/domain/bio/geneticCodes.ts');
  const previous = 'existing generated output must survive refusal';
  writeFileSync(output, previous);
  const run = () => spawnSync(process.execPath, ['scripts/gen-genetic-codes.mjs'], { cwd: dir, encoding: 'utf8' });
  return { output, previous, run };
}

it('generates all pinned tables as an importable module with Biopython residues and NCBI stop/start rows', () => {
  const { output, run } = workspace();
  const first = run();
  expect(first.status, first.stderr).toBe(0);
  const source = readFileSync(output, 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
  const exports: { NCBI_GENETIC_CODES?: Record<string, { aminoAcids: string; starts: string }>; NCBI_GENETIC_CODES_VERSION?: string } = {};
  runInNewContext(compiled.outputText, { exports });
  expect(exports.NCBI_GENETIC_CODES_VERSION).toBe('4.6');
  const codes = exports.NCBI_GENETIC_CODES!;
  expect(Object.keys(codes)).toEqual(Object.keys(oracle.tables));
  // The independent fixture lists codons in the NCBI file's published Base1/Base2/Base3 order.
  for (const [id, table] of Object.entries(oracle.tables) as [string, { codons: Record<string, string> }][]) {
    expect(codes[id].aminoAcids, id).toBe(Object.values(table.codons).join('').replace(/_/g, '*'));
  }
  // Literal sncbieaa rows from NCBI's published tables, independent of the input written above.
  expect(codes['11'].starts).toBe('---M------**--*----M------------MMMM---------------M------------');
  expect(codes['27'].starts).toBe('--------------*--------------------M----------------------------');
  expect(codes['28'].starts).toBe('----------**--*--------------------M----------------------------');
  expect(codes['31'].starts).toBe('----------**-----------------------M----------------------------');
  const second = run();
  expect(second.status, second.stderr).toBe(0);
  expect(readFileSync(output, 'utf8')).toBe(source);
});

it('refuses a checksum mismatch before overwriting generated output', () => {
  const { output, previous, run } = workspace(Buffer.concat([pinned, Buffer.from('\n-- changed\n')]), pinnedChecksum);
  const result = run();
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('does not match the pinned checksum');
  expect(readFileSync(output, 'utf8')).toBe(previous);
});

it.each([
  ['missing version', gcPrt().toString('latin1').replace(/--\s*Version\s+[\d.]+/g, '-- revision omitted')],
  ['no tables', '-- Version 4.6\nGenetic-code-table ::= { }\n'],
])('refuses an unparseable file with a matching checksum: %s', (_reason, text) => {
  const bytes = Buffer.from(text, 'latin1');
  const checksum = createHash('sha256').update(bytes).digest('hex');
  const { output, previous, run } = workspace(bytes, checksum);
  const result = run();
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain('Could not parse gc.prt');
  expect(readFileSync(output, 'utf8')).toBe(previous);
});

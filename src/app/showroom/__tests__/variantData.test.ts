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
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { handleBioMessage } from '@/src/workers/handlers/bio';

const EXAMPLES = resolve(__dirname, '../../../../examples');
const VARIANTS = resolve(EXAMPLES, 'sars-cov-2-variants');

const read = (path: string) => readFileSync(path, 'utf-8');
const sha256 = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

/** Parses a GenBank file the way the workbench does, so the IDs are the ones the app sees. */
function parseRecords(path: string, filename: string) {
  const response = handleBioMessage({ type: 'PARSE_GENBANK', filename, content: read(path) });
  if (response.type !== 'PARSE_SUCCESS') throw new Error(`parse failed for ${filename}: ${response.type}`);
  return response.records;
}

/** Reads the bundled FASTA directly, without the app's parser: it is the oracle, not a subject. */
function readFastaRows(path: string): { id: string; row: string }[] {
  const rows: { id: string; row: string }[] = [];
  for (const line of read(path).split('\n')) {
    if (line.startsWith('>')) rows.push({ id: line.slice(1).trim().split(/\s+/)[0], row: '' });
    else if (line.trim() !== '') rows[rows.length - 1].row += line.trim();
  }
  return rows;
}

const provenance = () => JSON.parse(read(resolve(VARIANTS, 'PROVENANCE.json')));
const genBankSequences = () => new Map([
  ...parseRecords(resolve(EXAMPLES, 'sars-cov-2-NC_045512.gb'), 'sars-cov-2-NC_045512.gb'),
  ...parseRecords(resolve(VARIANTS, 'variants.gb'), 'variants.gb'),
].map(record => [record.id, record.sequence]));

describe('bundled SARS-CoV-2 variant data', () => {
  it('aligned.fasta matches its recorded checksum', () => {
    expect(sha256(resolve(VARIANTS, 'aligned.fasta'))).toBe(provenance().sha256['aligned.fasta']);
  });

  it('variants.gb and the reference match their recorded checksums', () => {
    const { sha256: sums } = provenance();
    expect(sha256(resolve(VARIANTS, 'variants.gb'))).toBe(sums['variants.gb']);
    expect(sha256(resolve(EXAMPLES, 'sars-cov-2-NC_045512.gb'))).toBe(sums['sars-cov-2-NC_045512.gb']);
    // The MAFFT input is a build-time temporary, so this sum is the only one
    // with no committed file behind it: at least require that it is recorded.
    expect(sums['mafft-input.fasta']).toMatch(/^[0-9a-f]{64}$/);
  });

  it('each ungapped row equals its GenBank sequence, case included', () => {
    const sequences = genBankSequences();
    const rows = readFastaRows(resolve(VARIANTS, 'aligned.fasta'));
    expect(rows).toHaveLength(4);
    for (const { id, row } of rows) {
      expect(sequences.has(id)).toBe(true);
      expect(row.replaceAll('-', '')).toBe(sequences.get(id));
    }
  });

  it('rows share one length and IDs match the parsed records', () => {
    const rows = readFastaRows(resolve(VARIANTS, 'aligned.fasta'));
    expect(rows).toHaveLength(4);
    expect(new Set(rows.map(r => r.row.length)).size).toBe(1);
    expect(rows.map(r => r.id)).toEqual([...genBankSequences().keys()]);
  });

  it('names every accession in the provenance with a reason', () => {
    const { accessions, ncbiRetrieved, mafft } = provenance();
    expect(accessions).toHaveLength(3);
    for (const entry of accessions) {
      expect(entry.lineage).toBeTruthy();
      expect(entry.accession).toBeTruthy();
      expect(entry.version).toBeTruthy();
      expect(entry.why.length).toBeGreaterThan(20);
    }
    expect(ncbiRetrieved).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(mafft.command).toContain('--preservecase');
    expect(mafft.command).toContain('--auto');
  });

  it('pins the aligner it used', () => {
    const { mafft } = provenance();
    expect(mafft.version).toMatch(/^v[0-9]/);
    expect(mafft.imageDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(mafft.image).toBeTruthy();
    expect(mafft.strategy).toBeTruthy();
  });
});

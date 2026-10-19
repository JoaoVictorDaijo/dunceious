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
const VARIANTS = resolve(EXAMPLES, 'nucleotide/sars-cov-2-variants');

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

/**
 * `scripts/build-sars-cov-2-variants.sh` feeds MAFFT one FASTA built straight from the
 * GenBank bytes, replicated here: each record's residues are everything after its `ORIGIN`
 * line with non-letters stripped and uppercased (`--preservecase` then keeps that case),
 * wrapped at 60 columns under the LOCUS name, reference file first.
 */
function buildMafftInput(paths: string[]): string {
  let fasta = '';
  for (const path of paths) {
    for (const chunk of read(path).split('\n//')) {
      const locus = /^LOCUS\s+(\S+)/m.exec(chunk);
      const origin = chunk.indexOf('\nORIGIN');
      if (!locus || origin < 0) continue;
      const residues = chunk.slice(origin + '\nORIGIN'.length).replace(/[^A-Za-z]/g, '').toUpperCase();
      fasta += `>${locus[1]}\n`;
      for (let at = 0; at < residues.length; at += 60) fasta += `${residues.slice(at, at + 60)}\n`;
    }
  }
  return fasta;
}

const provenance = () => JSON.parse(read(resolve(VARIANTS, 'PROVENANCE.json')));
const genBankSequences = () => new Map([
  ...parseRecords(resolve(EXAMPLES, 'nucleotide/coronaviruses/sars-cov-2-NC_045512.gb'), 'sars-cov-2-NC_045512.gb'),
  ...parseRecords(resolve(VARIANTS, 'variants.gb'), 'variants.gb'),
].map(record => [record.id, record.sequence]));

describe('bundled SARS-CoV-2 variant data', () => {
  it('aligned.fasta matches its recorded checksum', () => {
    expect(sha256(resolve(VARIANTS, 'aligned.fasta'))).toBe(provenance().sha256['aligned.fasta']);
  });

  it('variants.gb and the reference match their recorded checksums', () => {
    const { sha256: sums } = provenance();
    expect(sha256(resolve(VARIANTS, 'variants.gb'))).toBe(sums['variants.gb']);
    expect(sha256(resolve(EXAMPLES, 'nucleotide/coronaviruses/sars-cov-2-NC_045512.gb'))).toBe(sums['sars-cov-2-NC_045512.gb']);
    expect(sums['mafft-input.fasta']).toMatch(/^[0-9a-f]{64}$/);
  });

  // The MAFFT input is a build-time temporary with no committed file, so rebuilding it here
  // from the committed GenBank bytes is what ties them to the alignment: GenBank -> MAFFT
  // input -> aligned.fasta. A sum that only had to look like a sum would not notice the
  // reference or the variants changing underneath it.
  it('the MAFFT input rebuilt from the GenBank files matches its recorded checksum', () => {
    const input = buildMafftInput([
      resolve(EXAMPLES, 'nucleotide/coronaviruses/sars-cov-2-NC_045512.gb'),
      resolve(VARIANTS, 'variants.gb'),
    ]);
    expect(input.split('\n').filter(line => line.startsWith('>'))).toEqual(
      ['>NC_045512', '>OL461693', '>OR279985', '>OR323867']);
    expect(createHash('sha256').update(input).digest('hex')).toBe(provenance().sha256['mafft-input.fasta']);
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

// OL461693's GenBank record states no Pango lineage, so the Alpha label rests on
// the record carrying the lineage-defining changes. These are read from Table 1 of
// Rambaut et al. 2020, "Preliminary genomic characterisation of an emergent
// SARS-CoV-2 lineage in the UK defined by a novel set of spike mutations"
// (https://virological.org/t/563), in NC_045512.2 coordinates, 1-based.
describe('OL461693 carries the B.1.1.7-defining changes', () => {
  const rows = () => new Map(readFastaRows(resolve(VARIANTS, 'aligned.fasta')).map(r => [r.id, r.row]));
  /** The reference row is ungapped, so reference position p is alignment column p. */
  const columnOf = (position: number) => position - 1;

  it('has an ungapped reference row, so columns are reference coordinates', () => {
    const reference = rows().get('NC_045512');
    expect(reference).toBeDefined();
    expect(reference).not.toContain('-');
  });

  it.each([
    ['spike N501Y (A23063T)', 23063, 'A', 'T'],
    ['spike A570D (C23271A)', 23271, 'C', 'A'],
    ['spike D1118H (G24914C)', 24914, 'G', 'C'],
    ['ORF8 Q27stop (C27972T)', 27972, 'C', 'T'],
    ['N S235F (C28977T)', 28977, 'C', 'T'],
  ])('%s', (_change, position, referenceBase, alphaBase) => {
    const aligned = rows();
    expect(aligned.get('NC_045512')?.[columnOf(position)]).toBe(referenceBase);
    expect(aligned.get('OL461693')?.[columnOf(position)]).toBe(alphaBase);
  });

  it.each([
    ['spike HV 69-70 deletion (21765-21770)', 21765, 21770],
    ['spike Y144 deletion (21991-21993)', 21991, 21993],
  ])('%s', (_change, start, end) => {
    const aligned = rows();
    const span = (id: string) => aligned.get(id)?.slice(columnOf(start), end);
    expect(span('NC_045512')).toMatch(/^[ACGT]+$/);
    expect(span('OL461693')).toBe('-'.repeat(end - start + 1));
  });
});

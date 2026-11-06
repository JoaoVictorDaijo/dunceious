/*
 * Dunceious
 * Copyright (C) 2026 João Victor Daijo and Murilo Cassiano
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

import { expect, it } from 'vitest';
import fixture from './fixtures/ncbi-genetic-codes.biopython.json';
import { assumedTranslation, otherReadings } from '../assumedTranslation';
import { translateSequence, translateFeature } from '../sequence';
import { exportToGenBank } from '@/src/core/genbank/serialize';
import { exportToGff3 } from '@/src/core/formats/gff3';
import { serializeProject } from '@/src/app/logic/projectFile';
import type { BioFeature } from '../types';

const feature = (table?: string, type = 'CDS'): BioFeature => ({
  type, name: 'test', start: 0, end: 12, strand: 1,
  metadata: table === undefined ? {} : { transl_table: table },
});
const tables: Record<string, { codons: Record<string, string> }> = fixture.tables;
const residue = (value: string) => value === '_' ? '*' : value;

it('matches all fixture-derived alternative readings and the literal 13 sensitive codons', () => {
  const sensitive: string[] = [];
  for (const codon of Object.keys(tables['1'].codons)) {
    const groups = new Map<string, number[]>();
    for (const [id, table] of Object.entries(tables)) {
      const aa = residue(table.codons[codon]);
      if (aa !== residue(tables['1'].codons[codon])) groups.set(aa, [...(groups.get(aa) ?? []), Number(id)]);
    }
    const readings = [...groups].map(([residue, tables]) => ({ residue, tables }));
    if (readings.length) sensitive.push(codon);
    expect(otherReadings(codon)).toEqual(readings);
    expect(assumedTranslation(feature('99'), codon)?.codeSensitive).toEqual([readings.length > 0]);
  }
  expect(sensitive.sort()).toEqual(['AAA', 'AGA', 'AGG', 'ATA', 'CTA', 'CTC', 'CTG', 'CTT', 'TAA', 'TAG', 'TCA', 'TGA', 'TTA']);
});

it.each([
  ['ATGTGGTGAGCT', 'MW*A', [false, false, true, false], [false, false, true, false]],
  ['augugguga', 'MW*', [false, false, true], [false, false, true]],
  ['GTG', 'V', [false], [false]],
  ['TGN', '?', [true], [true]],
  ['GCN', 'A', [false], [false]],
  ['RAY', '?', [false], [false]],
] as const)('reads %s literally under table 1', (seq, residues, codeSensitive, possibleStop) => {
  expect(assumedTranslation(feature('99'), seq)).toEqual({ assumedTable: 1, residues, codeSensitive, possibleStop });
});

it('gates the view on invalid codes and coding feature types, without changing computed results', () => {
  for (const type of ['CDS', 'cds', 'ORF', 'orf']) {
    for (const table of ['99', '', 'abc']) expect(assumedTranslation(feature(table, type), 'ATG')?.residues).toBe('M');
    for (const table of [undefined, '1', '11']) expect(assumedTranslation(feature(table, type), 'ATG')).toBeUndefined();
  }
  expect(assumedTranslation(feature('99', 'gene'), 'ATG')).toBeUndefined();
  expect(translateSequence('ATGTGGTGA', 99)).toBe('???');
  expect(translateFeature(feature('99'), 'ATGTGGTGA', 99)).toBe('???');
  expect(translateFeature({ ...feature('99'), translation: 'M' }, 'ATGTGGTGA', 99)).toBe('M??');
  expect(assumedTranslation(feature('99'), 'ATGA')?.residues).toBe('M');
  expect(assumedTranslation(feature('99'), '')?.residues).toBe('');
});

it('keeps provisional residues out of annotations, interchange exports and project serialization', () => {
  const f = feature('99');
  const record = { id: 'r', name: 'r', sequence: 'ATGTGGTGAGCT', features: [f] };
  const before = JSON.stringify(record);
  expect(assumedTranslation(f, record.sequence)?.residues).toBe('MW*A');
  expect(exportToGenBank([record]).text).not.toContain('/translation');
  expect(exportToGff3([record]).text).not.toMatch(/translation=/i);
  const saved = serializeProject({ records: [record], featureColors: {}, showAnnotations: true, showTranslation: true, showConservation: false });
  expect(saved).not.toContain('MW*A');
  expect(saved).not.toContain('assumed');
  expect(JSON.stringify(record)).toBe(before);
});

it('matches a separate IUPAC expansion loop over the Biopython rows', () => {
  const alphabet: Record<string, string> = { A: 'A', C: 'C', G: 'G', T: 'T', R: 'AG', Y: 'CT', S: 'CG', W: 'AT', K: 'GT', M: 'AC', B: 'CGT', D: 'AGT', H: 'ACT', V: 'ACG', N: 'ACGT' };
  for (const a of Object.keys(alphabet)) for (const b of Object.keys(alphabet)) for (const c of Object.keys(alphabet)) {
    const readings = new Set<string>();
    let sensitive = false;
    for (const x of alphabet[a]) for (const y of alphabet[b]) for (const z of alphabet[c]) {
      const codon = x + y + z;
      readings.add(residue(tables['1'].codons[codon]));
      if (Object.values(tables).some(t => t.codons[codon] !== tables['1'].codons[codon])) sensitive = true;
    }
    expect(assumedTranslation(feature('99'), a + b + c), a + b + c).toEqual({
      assumedTable: 1, residues: readings.size === 1 ? [...readings][0] : '?',
      codeSensitive: [sensitive], possibleStop: [readings.has('*')],
    });
  }
});

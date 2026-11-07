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

import { parseLocation } from '@/src/core/genbank/locationParser';
import { expect, it } from 'vitest';
import fixture from './fixtures/ncbi-genetic-codes.biopython.json';
import { assumedTranslation, otherReadings, startTables } from '../assumedTranslation';
import { translateSequence, translateFeature } from '../sequence';
import { exportToGenBank } from '@/src/core/genbank/serialize';
import { exportToGff3 } from '@/src/core/formats/gff3';
import { serializeProject } from '@/src/app/logic/projectFile';
import type { BioFeature } from '../types';

/** The parsed geometry of a location, as GenBank import gives it, so its partial flags are set. */
const located = (locationString?: string) => {
  if (locationString === undefined) return {};
  const { strand, segments } = parseLocation(locationString);
  return { locationString, strand, segments };
};

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
  expect(translateFeature({ ...feature('99'), metadata: { ...feature('99').metadata, translation: 'M' } }, 'ATGTGGTGA', 99)).toBe('M??');
  expect(assumedTranslation(feature('99'), 'ATGA')?.residues).toBe('M');
  expect(assumedTranslation(feature('99'), '')?.residues).toBe('');
});

it('keeps provisional residues out of annotations, interchange exports and project serialization', () => {
  const f = { ...feature('99'), ...located('1..12') };
  const record = { id: 'r', name: 'r', sequence: 'TTGTGGTGAGCT', features: [f] };
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

it('reads complete first codons and start sensitivity against every Biopython Starts row', () => {
  for (const codon of Object.keys(fixture.tables['1'].codons)) {
    const starts = Object.entries(fixture.tables).filter(([, table]) =>
      table.starts[Object.keys(table.codons).indexOf(codon)] === 'M').map(([id]) => Number(id));
    const aa = residue(tables['1'].codons[codon]);
    const ordinarySensitive = Object.values(tables).some(t => t.codons[codon] !== tables['1'].codons[codon]);
    const f = { ...feature('99'), ...located('1..6'), metadata: { transl_table: '99', codon_start: '1' } };
    const view = assumedTranslation(f, codon + codon)!;
    expect(startTables(codon), codon).toEqual(starts);
    const contextual = new Map<string, number[]>();
    const standardStart = starts.includes(1) ? 'M' : aa;
    for (const [id, table] of Object.entries(fixture.tables)) {
      const reading = starts.includes(Number(id)) ? 'M' : residue(table.codons[codon as keyof typeof table.codons]);
      if (reading !== standardStart) contextual.set(reading, [...(contextual.get(reading) ?? []), Number(id)]);
    }
    expect(otherReadings(codon, true), codon).toEqual([...contextual].map(([residue, tables]) => ({ residue, tables })));
    expect(view.residues, codon).toBe((starts.includes(1) ? 'M' : aa) + aa);
    expect(view.codeSensitive, codon).toEqual([ordinarySensitive || (starts.length > 0 && starts.length < 27), ordinarySensitive]);
    expect(translateFeature(f, codon + codon, 99)).toBe('??');
  }
  expect(startTables('ATG')).toHaveLength(27);
  expect(startTables('TTG')).toHaveLength(9);
  expect(startTables('CTG')).toHaveLength(8);
  expect(startTables('GTG')).toHaveLength(13);
});

it.each([
  { codon: 'ATG', locationString: '1..9', codon_start: '1', expected: 'M', sensitive: false },
  { codon: 'TTG', locationString: '1..9', codon_start: '1', expected: 'M', sensitive: true },
  { codon: 'CTG', locationString: '1..9', codon_start: '1', expected: 'M', sensitive: true },
  { codon: 'GTG', locationString: '1..9', codon_start: '1', expected: 'V', sensitive: true },
  { codon: 'uug', locationString: '1..9', codon_start: undefined, expected: 'M', sensitive: true },
  { codon: 'TTG', locationString: '1..9', codon_start: '2', expected: 'L', sensitive: false },
  { codon: 'TTG', locationString: '<1..9', codon_start: '1', expected: 'L', sensitive: false },
  { codon: 'TTG', locationString: undefined, codon_start: '1', expected: 'L', sensitive: false },
  { codon: 'GTG', locationString: undefined, codon_start: '1', expected: 'V', sensitive: false },
  { codon: 'TTG', locationString: 'complement(1..>9)', codon_start: '1', expected: 'L', sensitive: false },
  { codon: 'TTG', locationString: 'complement(<1..9)', codon_start: '1', expected: 'M', sensitive: true },
  { codon: 'GTN', locationString: '1..9', codon_start: '1', expected: 'V', sensitive: true },
  { codon: 'ATN', locationString: '1..9', codon_start: '1', expected: '?', sensitive: true },
  { codon: 'YTG', locationString: '1..9', codon_start: '1', expected: 'L', sensitive: true },
])('applies initiation context to $codon at $locationString /codon_start=$codon_start', ({ codon, locationString, codon_start, expected, sensitive }) => {
  const f = { ...feature('99'), ...located(locationString), metadata: { transl_table: '99', ...(codon_start ? { codon_start } : {}) } };
  const view = assumedTranslation(f, codon)!;
  expect(view.residues).toBe(expected);
  expect(view.codeSensitive).toEqual([sensitive]);
});

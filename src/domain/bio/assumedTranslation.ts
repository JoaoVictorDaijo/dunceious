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

import type { BioFeature } from './types';
import { NCBI_GENETIC_CODES } from './geneticCodes';
import { featureTranslTable, isNcbiGeneticCode } from './sequence';

/** A presentation-only assumption: never attach it to annotations or computed results. */
export interface AssumedTranslation {
  assumedTable: 1;
  residues: string;
  codeSensitive: boolean[];
  possibleStop: boolean[];
}

const IUPAC: Readonly<Record<string, string>> = {
  A: 'A', C: 'C', G: 'G', T: 'T', R: 'AG', Y: 'CT', S: 'CG', W: 'AT',
  K: 'GT', M: 'AC', B: 'CGT', D: 'AGT', H: 'ACT', V: 'ACG', N: 'ACGT',
};
const normalize = (codon: string) => codon.toUpperCase().replace(/U/g, 'T');
const indexOf = (codon: string) => [...codon].reduce((index, base) => index * 4 + 'TCAG'.indexOf(base), 0);

function expansions(codon: string): string[] {
  const normalized = normalize(codon);
  if (normalized.length !== 3) return [];
  let result = [''];
  for (const base of normalized) result = result.flatMap(prefix => [...(IUPAC[base] ?? '')].map(b => prefix + b));
  return result;
}

/** Literal gc.prt 4.6 amino-acid rows: initiation and terminal context cannot justify an assumption. */
export function tableOneReadings(codon: string): string[] {
  return [...new Set(expansions(codon).map(c => NCBI_GENETIC_CODES[1].aminoAcids[indexOf(c)]))].sort();
}

/** Alternative literal NCBI readings, excluding table 1's reading of the same exact codon. */
export function otherReadings(codon: string): { residue: string; tables: number[] }[] {
  const normalized = normalize(codon);
  if (!/^[ACGT]{3}$/.test(normalized)) return [];
  const index = indexOf(normalized);
  const standard = NCBI_GENETIC_CODES[1].aminoAcids[index];
  const groups = new Map<string, number[]>();
  for (const [id, code] of Object.entries(NCBI_GENETIC_CODES)) {
    const residue = code.aminoAcids[index];
    if (residue !== standard) groups.set(residue, [...(groups.get(residue) ?? []), Number(id)]);
  }
  return [...groups].map(([residue, tables]) => ({ residue, tables }));
}

const sensitiveCodons = new Set<string>();
for (const a of 'TCAG') for (const b of 'TCAG') for (const c of 'TCAG') {
  if (otherReadings(a + b + c).length) sensitiveCodons.add(a + b + c);
}

/**
 * A separate table-1 view for invalid coding qualifiers, never a computed translation.
 * Literal gc.prt 4.6 rows and exhaustive IUPAC expansion are checked against Biopython 1.88.
 */
export function assumedTranslation(feature: BioFeature, codingSeq: string): AssumedTranslation | undefined {
  if (!['CDS', 'cds', 'ORF', 'orf'].includes(feature.type) || isNcbiGeneticCode(featureTranslTable(feature))) return undefined;
  const view: AssumedTranslation = { assumedTable: 1, residues: '', codeSensitive: [], possibleStop: [] };
  for (let i = 0; i + 2 < codingSeq.length; i += 3) {
    const codon = codingSeq.slice(i, i + 3);
    const readings = tableOneReadings(codon);
    view.residues += readings.length === 1 ? readings[0] : '?';
    view.codeSensitive.push(expansions(codon).some(c => sensitiveCodons.has(c)));
    view.possibleStop.push(readings.includes('*'));
  }
  return view;
}

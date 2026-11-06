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
import { isFivePrimePartialLocation } from './locationFlags';
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

/** Literal gc.prt 4.6 readings before CDS-specific initiation context is considered. */
export function tableOneReadings(codon: string): string[] {
  return [...new Set(expansions(codon).map(c => NCBI_GENETIC_CODES[1].aminoAcids[indexOf(c)]))].sort();
}

/** Other NCBI readings relative to table 1, with Starts rows used only in complete initiation context. */
export function otherReadings(codon: string, initiation = false): { residue: string; tables: number[] }[] {
  const normalized = normalize(codon);
  if (!/^[ACGT]{3}$/.test(normalized)) return [];
  const index = indexOf(normalized);
  const standard = initiation && NCBI_GENETIC_CODES[1].starts[index] === 'M' ? 'M' : NCBI_GENETIC_CODES[1].aminoAcids[index];
  const groups = new Map<string, number[]>();
  for (const [id, code] of Object.entries(NCBI_GENETIC_CODES)) {
    const residue = initiation && code.starts[index] === 'M' ? 'M' : code.aminoAcids[index];
    if (residue !== standard) groups.set(residue, [...(groups.get(residue) ?? []), Number(id)]);
  }
  return [...groups].map(([residue, tables]) => ({ residue, tables }));
}

/** NCBI gc.prt 4.6 Starts rows; only exact codons establish an initiator. */
export function startTables(codon: string): number[] {
  const normalized = normalize(codon);
  if (!/^[ACGT]{3}$/.test(normalized)) return [];
  const index = indexOf(normalized);
  return Object.entries(NCBI_GENETIC_CODES).filter(([, code]) => code.starts[index] === 'M').map(([id]) => Number(id));
}

/**
 * NCBI x_Translate (912b751) checks starts only for complete frame 1. The 5′ end is read from the
 * per-end partial flags (LOC-4), which survive edits; a feature without intervals is unknown.
 */
export function assumedInitiationContext(feature: Pick<BioFeature, 'metadata' | 'strand' | 'segments'>): boolean {
  return !!feature.segments?.length
    && (feature.metadata?.codon_start ?? '1').trim() === '1'
    && !isFivePrimePartialLocation(feature);
}

const sensitiveCodons = new Set<string>();
const startSensitiveCodons = new Set<string>();
for (const a of 'TCAG') for (const b of 'TCAG') for (const c of 'TCAG') {
  const codon = a + b + c;
  if (otherReadings(codon).length) sensitiveCodons.add(codon);
  const starts = startTables(codon);
  if (starts.length > 0 && starts.length < Object.keys(NCBI_GENETIC_CODES).length) startSensitiveCodons.add(codon);
}

/**
 * A separate table-1 view for invalid coding qualifiers, never a computed translation.
 * Literal gc.prt 4.6 rows and exhaustive IUPAC expansion are checked against Biopython 1.88.
 */
export function assumedTranslation(feature: BioFeature, codingSeq: string): AssumedTranslation | undefined {
  if (!['CDS', 'cds', 'ORF', 'orf'].includes(feature.type) || isNcbiGeneticCode(featureTranslTable(feature))) return undefined;
  const initiation = assumedInitiationContext(feature);
  const view: AssumedTranslation = { assumedTable: 1, residues: '', codeSensitive: [], possibleStop: [] };
  for (let i = 0; i + 2 < codingSeq.length; i += 3) {
    const codon = codingSeq.slice(i, i + 3);
    const readings = tableOneReadings(codon);
    const firstStart = i === 0 && initiation;
    view.residues += firstStart && startTables(codon).includes(1) ? 'M' : readings.length === 1 ? readings[0] : '?';
    view.codeSensitive.push(expansions(codon).some(c => sensitiveCodons.has(c) || (firstStart && startSensitiveCodons.has(c))));
    view.possibleStop.push(readings.includes('*'));
  }
  return view;
}

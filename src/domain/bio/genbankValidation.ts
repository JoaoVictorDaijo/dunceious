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

import type { SeqRecord } from './types';
import { featureTranslTable, isNcbiGeneticCode } from './sequence';
export { validCodonStart } from './codonStart';
import { validCodonStart } from './codonStart';

/** INSDC FT 11.4 §§7.4.1, 7.4.3: gap and stop symbols are not residues. */
export function isGenBankResidue(character: string, protein = false): boolean {
  return character.length === 1 && (protein ? /^[ACDEFGHIKLMNPQRSTVWYUXBZJO]$/i : /^[ACGTURYMKSWBDHVN]$/i).test(character);
}

/** Omission reason for the GenBank writer and its preview; never repairs coordinates. */
export function genBankExportProblem(record: SeqRecord): string | null {
  if ([...record.sequence].some(c => !isGenBankResidue(c, record.moleculeType === 'protein'))) return `${record.id} not exported: its sequence contains non-residue characters`;
  for (const feature of record.features.filter(f => f.type === 'CDS')) {
    if (!validCodonStart(feature.metadata?.codon_start)) return `${record.id} not exported: CDS ${feature.name} has an invalid /codon_start`;
    if (!isNcbiGeneticCode(featureTranslTable(feature))) return `${record.id} not exported: CDS ${feature.name} has an invalid /transl_table`;
  }
  return null;
}

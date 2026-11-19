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

import type { SeqRecord } from '@/src/domain/bio/types';
import { detectMoleculeType, classifyLocusMoleculeType, isProteinSession, type MoleculeCategory } from '@/src/domain/bio';

const FASTA_SAMPLE_MAX_RECORDS = 3;
const FASTA_SAMPLE_MAX_LENGTH = 1200;

/** Returns 'protein' if the GenBank LOCUS line declares amino-acid units, else 'nucleotide'. */
export function sniffGenBankCategory(content: string): MoleculeCategory {
  const match = content.match(/^LOCUS\s+.+$/m);
  if (match && classifyLocusMoleculeType(match[0]) === 'protein') return 'protein';
  return 'nucleotide';
}

/**
 * Samples the first few records of a FASTA string and classifies the sample
 * via the canonical `detectMoleculeType` (protein-only alphabet =
 * PROTEIN_ONLY_RESIDUES). RNA maps to 'nucleotide'.
 */
export function sniffFastaCategory(content: string): MoleculeCategory {
  const lines = content.split('\n');
  let seq = '';
  let seenHeader = false;
  let sampledRecords = 0;
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith('>')) {
      if (seenHeader && seq) {
        sampledRecords += 1;
        if (sampledRecords >= FASTA_SAMPLE_MAX_RECORDS || seq.length >= FASTA_SAMPLE_MAX_LENGTH) break;
      }
      seenHeader = true;
      continue;
    } else if (seenHeader && t) {
      seq += t;
      if (seq.length >= FASTA_SAMPLE_MAX_LENGTH) break;
    }
  }

  const sample = seq.toUpperCase().replace(/[^A-Z*-]/g, '');
  if (!sample) return 'nucleotide';
  return detectMoleculeType(sample) === 'protein' ? 'protein' : 'nucleotide';
}

/**
 * The pre-dispatch refusal: a sampled file whose category differs from a non-empty workspace.
 * It can only refuse early; `findSessionTypeConflict` still checks every parsed record.
 */
export function previewMismatch(records: SeqRecord[], content: string, isFasta: boolean): { incoming: MoleculeCategory; loaded: MoleculeCategory } | null {
  if (records.length === 0) return null;
  const incoming = isFasta ? sniffFastaCategory(content) : sniffGenBankCategory(content);
  const loaded: MoleculeCategory = isProteinSession(records) ? 'protein' : 'nucleotide';
  return incoming === loaded ? null : { incoming, loaded };
}

export const categoryLabel = (category: MoleculeCategory) => category === 'protein' ? 'peptide' : 'nucleotide';

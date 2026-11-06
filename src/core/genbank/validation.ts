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

import { conceptualTranslation } from '@/src/domain/bio/translation';
import { codeBreakMessage } from '@/src/domain/bio/translationExceptions';
import { FEATURE_TABLE } from '@/src/domain/bio/insdcFeatureTable';
import { validCodonStart, isGenBankResidue } from '@/src/domain/bio/genbankValidation';
import { featureTranslTable, isNcbiGeneticCode } from '@/src/domain/bio/sequence';
import type { SeqRecord } from '@/src/domain/bio/types';
import type { FindingSink } from './findings';

type KeyRule = { mandatory: readonly string[]; optional: readonly string[] };

export function validateRecord(record: SeqRecord, lines: string[], finding: FindingSink): void {
  const locus = lines.find(line => /^LOCUS\s/.test(line));
  const length = locus?.match(/\s(\d+)\s+(bp|aa)(?=\s|$)/i);
  if (!locus || !/^LOCUS\s/.test(lines.find(line => line.trim()) ?? '')) finding('refuse', 'missing-locus', 'Record has no LOCUS line.');
  else if (!length) finding('refuse', 'missing-length', `${record.id}'s LOCUS line has no readable sequence length and unit.`);
  if (!record.sequence.length) finding('refuse', lines.some(l => /^CONTIG\b/.test(l)) ? 'contig-only' : 'no-sequence', lines.some(l => /^CONTIG\b/.test(l)) ? 'Sequence is given as CONTIG (assembled from other records), which Dunceious cannot read yet.' : `${record.id} has no sequence.`);
  const protein = length?.[2].toLowerCase() === 'aa';
  const invalid = [...record.sequence].findIndex(c => !isGenBankResidue(c, protein));
  if (invalid !== -1) finding('refuse', 'invalid-residue', `The sequence contains "${record.sequence[invalid]}" at ${protein ? 'residue' : 'base'} ${invalid + 1}.`);
  if (length && Number(length[1]) !== record.sequence.length) finding('refuse', 'length-mismatch', `LOCUS says ${length[1]} ${length[2]}, but ORIGIN has ${record.sequence.length} residues.`);
  const table: Readonly<Record<string, KeyRule>> = protein ? FEATURE_TABLE.protein : FEATURE_TABLE.nucleotide;
  for (const feature of record.features) {
    const report: FindingSink = (tier, code, message, line) => finding(tier, code, message, line, { key: feature.type, name: feature.name });
    const rule = Object.hasOwn(table, feature.type) ? table[feature.type] : undefined;
    if (!rule) report('warning', 'unknown-feature-key', `Unknown feature key ${feature.type}.`);
    else {
      let mandatory = [...rule.mandatory];
      if (!protein && feature.type === 'assembly_gap' && !['within scaffold', 'repeat within scaffold', 'contamination'].includes(feature.metadata?.gap_type ?? '')) mandatory = mandatory.filter(q => q !== 'linkage_evidence');
      if (!protein && feature.type === 'old_sequence' && (feature.metadata?.citation !== undefined || feature.metadata?.compare !== undefined)) mandatory = [];
      for (const qualifier of mandatory) if (feature.metadata?.[qualifier] === undefined) report(protein ? 'warning' : 'refuse', 'mandatory-qualifier', `${feature.type} has no /${qualifier}.`);
      for (const qualifier of Object.keys(feature.metadata ?? {})) {
        if (!rule.mandatory.includes(qualifier) && !rule.optional.includes(qualifier) && !(protein && (FEATURE_TABLE.flatFileOnly as readonly string[]).includes(qualifier))) report('warning', 'wrong-key-qualifier', `/${qualifier} is not allowed on ${feature.type}.`);
      }
    }
    if (feature.translationExceptions?.length) {
      const result = conceptualTranslation(feature, record);
      for (const evidence of result.exceptions ?? []) {
        if (evidence.status === 'malformed') report('refuse', 'malformed-qualifier', codeBreakMessage(evidence));
        else if (evidence.status === 'dropped' || evidence.status === 'deferred') report('warning', 'unusable-code-break', codeBreakMessage(evidence));
      }
      const dropped = new Set(result.exceptions?.filter(e => e.status === 'dropped').map(e => e.occurrence));
      feature.translationExceptions = feature.translationExceptions.filter((_, i) => !dropped.has(i));
    }
    if (feature.type === 'CDS') {
      if (!validCodonStart(feature.metadata?.codon_start)) report('warning', 'invalid-frame', `/codon_start=${feature.metadata?.codon_start ?? ''} is invalid; translation is suppressed.`);
      if (!isNcbiGeneticCode(featureTranslTable(feature))) report('warning', 'unknown-genetic-code', `/transl_table=${feature.metadata?.transl_table ?? ''} is not an NCBI genetic code; translation is suppressed.`);
    }
  }
}

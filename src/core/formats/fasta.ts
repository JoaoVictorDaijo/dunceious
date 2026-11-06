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

import type { SeqRecord, SequenceDetails, DetailKey } from '@/src/domain/bio/types';
import { detectMoleculeType } from '@/src/domain/bio';
import { emptyReport, detailsForExport, type ExportResult } from '../exportReport';
import { parseModifiers, DETAIL_TO_MODIFIER, MODIFIER_TO_DETAIL, DEPRECATED_MODIFIERS } from './ncbiModifiers';

export type FastaRecord = Pick<SeqRecord, 'id' | 'name' | 'sequence' | 'features' | 'definition' | 'fastaModifiers'> & {
  moleculeType: 'dna' | 'rna' | 'protein';
  header: string;
  details: SequenceDetails;
};

export function parseFasta(content: string): FastaRecord[] {
  const results: FastaRecord[] = [];
  let currentId = '';
  let currentRest = '';
  let currentSeq = '';
  const flush = () => {
    if (!currentId) return;
    const modifiers = parseModifiers(currentRest);
    results.push({
      id: currentId, name: currentId, sequence: currentSeq, features: [], moleculeType: detectMoleculeType(currentSeq),
      header: modifiers.text, definition: modifiers.text, details: modifiers.details, fastaModifiers: modifiers.unknown,
    });
  };
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('>')) {
      flush();
      const header = trimmed.slice(1).trim();
      currentId = header.split(/\s+/)[0];
      currentRest = header.slice(currentId.length).trim();
      currentSeq = '';
    } else if (trimmed) currentSeq += trimmed;
  }
  flush();
  return results;
}

export type FastaExportOptions = {
  residues: 'original' | 'aligned';
  header: 'id' | 'details';
  slice?: { start: number; end: number };
};

function cleanHeaderValue(value: string): string {
  return value.replace(/[[\]\r\n]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Selection windows use alignment columns for aligned rows and own positions for unaligned rows. */
export function exportToFasta(records: SeqRecord[], options: FastaExportOptions = { residues: 'original', header: 'id' }): ExportResult {
  const report = emptyReport();
  const alignedWidth = records.find(record => record.alignedSequence)?.alignedSequence?.length;
  const render = (rows: SeqRecord[]) => rows.flatMap(record => {
    const slice = options.slice;
    const residues = slice || options.residues === 'aligned' ? record.alignedSequence ?? record.sequence : record.sequence;
    const end = slice ? Math.min(residues.length, slice.end, record.alignedSequence && options.residues === 'aligned' ? alignedWidth ?? Infinity : Infinity) : residues.length;
    const window = slice ? residues.slice(Math.max(0, slice.start), Math.max(0, end)) : residues;
    const sequence = options.residues === 'original' && slice ? window.replace(/-/g, '') : window;
    if (!sequence.length) { report.emptyRowsOmitted.push(record.id); return []; }
    if (/^-+$/.test(sequence)) report.gapOnlyRows.push(record.id);
    let header = record.id;
    if (options.header === 'details') {
      const details = detailsForExport(record, report);
      for (const [key, value] of Object.entries(details)) {
        const cleaned = cleanHeaderValue(value);
        if (cleaned) header += ` [${DETAIL_TO_MODIFIER[key as DetailKey]}=${cleaned}]`;
      }
      const source = record.features.find(feature => feature.type === 'source')?.metadata;
      const written = new Set<string>();
      for (const key of ['isolate', 'strain']) {
        const value = source?.[key];
        if (!value || !cleanHeaderValue(value)) continue;
        header += ` [${key}=${cleanHeaderValue(value)}]`;
        written.add(key);
      }
      for (const [key, value] of Object.entries(record.fastaModifiers ?? {})) {
        if (DEPRECATED_MODIFIERS.has(key.toLowerCase().replace(/_/g, '-'))) {
          report.deprecatedModifiersOmitted++;
          continue;
        }
        if (Object.hasOwn(MODIFIER_TO_DETAIL, key.toLowerCase()) || written.has(key.toLowerCase())) continue;
        if (cleanHeaderValue(key) && cleanHeaderValue(value)) header += ` [${cleanHeaderValue(key)}=${cleanHeaderValue(value)}]`;
      }
    }
    if (slice) header += ` [Slice: ${slice.start}-${slice.end}]`;
    return `>${header}\n${sequence.match(/.{1,60}/g)?.join('\n') || ''}`;
  }).join('\n\n');
  if (options.residues !== 'aligned') return { text: render(records), report };
  const aligned = records.filter(record => record.alignedSequence !== undefined);
  const unaligned = records.filter(record => record.alignedSequence === undefined);
  report.unalignedRows = unaligned.map(record => record.id);
  return { text: render(aligned), ...(unaligned.length ? { unalignedText: render(unaligned) } : {}), report };
}

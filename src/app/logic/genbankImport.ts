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

import type { GenBankFinding, SeqRecord } from '@/src/domain/bio/types';
import type { BatchIdMap } from '@/src/workers/protocol';
import { sanitizeId } from './idHelpers';

export interface ImportDiagnosticFile {
  filename: string;
  findings: GenBankFinding[];
  recordIds?: string[];
}

/** A refused alias must block annotation fallbacks, including existing workspace records. */
export function refusedGenBankIds(records: SeqRecord[]): BatchIdMap {
  const result: BatchIdMap = Object.create(null);
  for (const record of records) for (const alias of [record.id, record.accession, record.version]) {
    if (alias) { result[alias] = null; result[sanitizeId(alias)] = null; }
  }
  return result;
}

export function importDetails(files: ImportDiagnosticFile[]): string {
  return files.map(file => `${file.filename}\n${file.findings.map(f => `Record ${f.record.index} (${f.record.name})${f.feature ? ` / ${f.feature.key} ${f.feature.name}` : ''}${f.line ? ` / line ${f.line}` : ''}: ${f.message}`).join('\n')}`).join('\n\n');
}

export function importLog(file: ImportDiagnosticFile, refused: boolean): string {
  const records = new Set(file.findings.map(f => f.record.index)).size;
  const groups = [...new Set(file.findings.map(f => f.code))].join(', ');
  return refused ? `${file.filename} not opened: ${file.findings.length} problems in ${records} records (${groups})` : `${file.filename} opened with ${file.findings.length} import notes (${groups})`;
}

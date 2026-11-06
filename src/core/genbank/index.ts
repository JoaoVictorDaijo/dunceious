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

/**
 * Public API for the modular GenBank parser.
 *
 * Re-exports the primary parsing function for downstream code that imports
 * from this module.
 */

import { validateRecord } from './validation';
import type { GenBankFinding } from './findings';
import type { SeqRecord } from '@/src/domain/bio/types';
import { splitRecords } from './recordSplitter';
import { toSeqRecord } from './toSeqRecord';

export { splitRecords } from './recordSplitter';
export { parseHeader } from './headerParser';
export { parseLocation } from './locationParser';
export { parseQualifiers } from './qualifierParser';
export { parseFeatures } from './featureParser';
export { toSeqRecord } from './toSeqRecord';

/** GenBank 274.0 / INSDC 11.4: collect all findings; the worker enforces whole-file refusal. */
export function parseGenBank(content: string): { records: SeqRecord[]; findings: GenBankFinding[] } {
  const findings: GenBankFinding[] = [];
  const names = new Set<string>();
  let offset = 0;
  const pieces = splitRecords(content);
  const records = pieces.map((piece, index) => {
    const position = content.indexOf(piece, offset);
    const lineOffset = content.slice(0, position).split('\n').length - 1;
    offset = position + piece.length;
    const name = piece.match(/^LOCUS\s+(\S+)/m)?.[1] ?? `Record ${index + 1}`;
    const finding: import('./findings').FindingSink = (tier, code, message, line, feature) => findings.push({ tier, code, message, record: { name, index: index + 1 }, feature, line: line === undefined ? undefined : line + lineOffset });
    if (!/^\s*\/\/[ \t]*(?:\r?\n|$)/.test(content.slice(offset))) {
      const message = index < pieces.length - 1
        ? `Record ${name} has no // before the next LOCUS.`
        : `The file ends inside record ${index + 1} without //; it may be cut short.`;
      finding('refuse', 'missing-terminator', message);
    }
    const record = toSeqRecord(piece, finding);
    validateRecord(record, piece.split(/\r?\n/), finding);
    if (names.has(name)) finding('warning', 'duplicate-locus', `${name} is repeated; its internal ID will be renamed on import.`);
    names.add(name);
    return record;
  });
  if (new Set(records.filter((_, i) => /\s\d+\s+(bp|aa)(?=\s|$)/i.test(pieces[i])).map(r => r.moleculeType === 'protein' ? 'protein' : 'nucleotide')).size > 1) findings.push({ tier: 'refuse', code: 'molecule-mixture', record: { name: records[0].id, index: 1 }, message: 'This file mixes protein and nucleotide records.' });
  return { records, findings };
}

export { exportToGenBank } from './serialize';

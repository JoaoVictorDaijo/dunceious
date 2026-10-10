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

import { describe, expect, it } from 'vitest';
import { buildSubmission, remapAlignment } from '@/src/core/alignment';
import { handleBioMessage } from '@/src/workers/handlers/bio';
import { applyFastaResponse, applyFastaAndLog } from '../bioResponse';
import type { SeqRecord } from '@/src/domain/bio/types';

const records: SeqRecord[] = [
  { id: 'seq1', name: 'seq1', sequence: 'AC', features: [] },
  { id: 'seq1 (1)', name: 'seq1 (1)', sequence: 'AGC', features: [] },
];
describe('remote alignment through the existing worker pipe', () => {
  it('preserves generated IDs containing spaces without changing sequences', () => {
    const result = remapAlignment('>s2\nAGC\n>s1\nA-C', buildSubmission(records));
    if (!result.ok) throw new Error(result.reason);
    const logs: string[] = [];
    const applied = applyFastaAndLog(records, result.records, true, message => logs.push(message));
    expect(logs).toEqual(['External alignment applied successfully (3 bp).']);
    expect(applied.kind).toBe('overlay');
    expect(applied.next.map(r => [r.id, r.sequence, r.alignedSequence])).toEqual([
      ['seq1', 'AC', 'A-C'], ['seq1 (1)', 'AGC', 'AGC'],
    ]);
  });
  it('retains first-token matching for external FASTA descriptions', () => {
    const message = handleBioMessage({ type: 'PARSE_FASTA', content: '>seq1 external description\nA-C\n>other description\nAGC', asAlignment: true });
    if (message.type !== 'FASTA_SUCCESS') throw new Error('Expected FASTA response');
    const result = applyFastaResponse([records[0], { ...records[1], id: 'other' }], message.alignedData, true);
    expect(result.kind).toBe('overlay');
    expect(result.next.map(r => r.alignedSequence)).toEqual(['A-C', 'AGC']);
  });
  it('leaves normal batch parsing unchanged', () => {
    const response = handleBioMessage({ type: 'PARSE_FASTA', content: '>seq1 external description\nAC' });
    expect(response).toMatchObject({ type: 'FASTA_SUCCESS', alignedData: [{ id: 'seq1', name: 'seq1' }] });
  });
});

describe('shared FASTA outcome logs', () => {
  it.each([
    ['>seq1\nAC\n', true, 'ERROR: Sequence mismatch. Missing: [seq1 (1)], Extra: []'],
    ['>seq1\nAC\n>seq1-other\nACG', true, 'ERROR: Sequence mismatch. Missing: [seq1 (1)], Extra: [seq1-other]'],
    ['>a\nAC', false, 'Batch ingestion complete: 1 records added.'],
  ])('preserves logging for %s', (content, asAlignment, expected) => {
    const message = handleBioMessage({ type: 'PARSE_FASTA', content });
    if (message.type !== 'FASTA_SUCCESS') throw new Error('Expected FASTA');
    const logs: string[] = []; applyFastaAndLog(records, message.alignedData, asAlignment, message => logs.push(message));
    expect(logs).toEqual([expected]);
  });
  it('logs empty and unequal-length overlay rejection without changing records', () => {
    for (const [sequences, expected] of [
      [['', ''], 'ERROR: Aligned sequences cannot be empty.'],
      [['AC', 'AGC'], 'ERROR: Aligned sequences must have identical lengths. Found: 2, 3'],
    ] as const) {
      const logs: string[] = [];
      const result = applyFastaAndLog(records, records.map((record, i) => ({ ...record, sequence: sequences[i] })), true, message => logs.push(message));
      expect(result.next).toBe(records); expect(logs).toEqual([expected]);
    }
  });
});

/*
 * Dunceious
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
import { preflightAlignment, buildSubmission, remapAlignment } from '@/src/core/alignment';
import { handleBioMessage } from '@/src/workers/handlers/bio';
import { applyFastaResponse, applyFastaAndLog } from '../bioResponse';
import { processTransposition } from '@/src/domain/bio/coordinate';
import { exportToFasta } from '@/src/core/formats/fasta';
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
  it('applies a protein result whose loaded terminal stop the preflight stripped and restored', () => {
    const proteins: SeqRecord[] = [
      { id: 'p1', name: 'p1', sequence: 'MKX*', features: [], moleculeType: 'protein' },
      { id: 'p2', name: 'p2', sequence: 'MX', features: [], moleculeType: 'protein' },
    ];
    const preflight = preflightAlignment(proteins, 'mafft');
    if (!preflight.ok) throw new Error('Expected preflight to pass');
    const result = remapAlignment('>s1\nMKX\n>s2\nM-X\n', preflight.submission);
    if (!result.ok) throw new Error(result.reason);
    const applied = applyFastaResponse(proteins, result.records, true);
    expect(applied.kind).toBe('overlay');
    expect(applied.next.map(r => r.alignedSequence)).toEqual(['MKX*', 'M-X-']);
  });
  it('retains first-token matching for external FASTA descriptions', () => {
    const message = handleBioMessage({ type: 'PARSE_FASTA', filename: 'fixture.fa', content: '>seq1 external description\nA-C\n>other description\nAGC', asAlignment: true });
    if (message.type !== 'FASTA_SUCCESS') throw new Error('Expected FASTA response');
    const result = applyFastaResponse([records[0], { ...records[1], id: 'other' }], message.alignedData, true);
    expect(result.kind).toBe('overlay');
    expect(result.next.map(r => r.alignedSequence)).toEqual(['A-C', 'AGC']);
  });
  it('leaves normal batch parsing unchanged', () => {
    const response = handleBioMessage({ type: 'PARSE_FASTA', filename: 'fixture.fa', content: '>seq1 external description\nAC' });
    expect(response).toMatchObject({ type: 'FASTA_SUCCESS', filename: 'fixture.fa', alignedData: [{ id: 'seq1', name: 'seq1' }] });
  });
});

describe('shared FASTA outcome logs', () => {
  it.each([
    ['>seq1\nAC\n', true, 'ERROR: Sequence mismatch. Missing: [seq1 (1)], Extra: []'],
    ['>seq1\nAC\n>seq1-other\nACG', true, 'ERROR: Sequence mismatch. Missing: [seq1 (1)], Extra: [seq1-other]'],
    ['>a\nAC', false, 'Batch ingestion complete: 1 records added.'],
    ['>seq1\nA-G\n>seq1 (1)\nAGC', true, 'ERROR: Aligned residues differ from the loaded sequence ("-" removed from both, case ignored): [seq1]'],
    ['>seq1\nA.C\n>seq1 (1)\nAGC', true, 'ERROR: Alignment gaps must be written as "-"; "." found in: [seq1]'],
  ])('preserves logging for %s', (content, asAlignment, expected) => {
    const message = handleBioMessage({ type: 'PARSE_FASTA', filename: 'fixture.fa', content });
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


it('restores a terminal protein stop before overlay so its annotation and aligned FASTA survive', () => {
  const protein: SeqRecord[] = [
    { id: 'stop', name: 'stop', sequence: 'MK*', moleculeType: 'protein', features: [{ name: 'terminal', type: 'Region', start: 2, end: 3, strand: 1 }] },
    { id: 'plain', name: 'plain', sequence: 'MK', moleculeType: 'protein', features: [] },
  ];
  const preflight = preflightAlignment(protein, 'mafft');
  if (!preflight.ok) throw new Error('Expected valid protein preflight');
  expect(preflight.submission.fasta).toBe('>s1\nMK\n>s2\nMK\n');
  const response = remapAlignment('>s2\nMK\n>s1\nMK\n', preflight.submission);
  if (!response.ok) throw new Error(response.reason);
  const overlay = applyFastaResponse(protein, response.records, true);
  expect(overlay.kind).toBe('overlay');
  expect(overlay.next.map(record => [record.sequence, record.alignedSequence])).toEqual([['MK*', 'MK*'], ['MK', 'MK-']]);
  expect(processTransposition(overlay.next)[0].features[0]).toMatchObject({ start: 2, end: 3, segments: [{ start: 2, end: 3 }] });
  expect(exportToFasta(overlay.next, { residues: 'aligned', header: 'id' }).text).toBe('>stop\nMK*\n\n>plain\nMK-');
});

it.each([
  { source: ['MK*', 'M*'], expected: ['M-K--*', '--M--*'] },
  { source: ['MK', 'M*'], expected: ['M-K---', '--M--*'] },
  { source: ['MK', 'M'], expected: ['M-K--', '--M--'] },
])('preserves internal and terminal alignment gaps when restoring stops: $source', ({ source, expected }) => {
  const preflight = preflightAlignment(source.map((sequence, i) => ({ id: `p${i}`, sequence, moleculeType: 'protein' })), 'mafft');
  if (!preflight.ok) throw new Error('Expected valid protein preflight');
  const result = remapAlignment('>s1\nM-K--\n>s2\n--M--\n', preflight.submission);
  if (!result.ok) throw new Error(result.reason);
  expect(result.records.map(record => record.sequence)).toEqual(expected);
});

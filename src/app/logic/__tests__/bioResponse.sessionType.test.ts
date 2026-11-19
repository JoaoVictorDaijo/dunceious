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

import { describe, it, expect } from 'vitest';
import { applyFastaAndLog, applyFastaResponse, applyParseResponse } from '../bioResponse';
import type { BioFeature, SeqRecord } from '@/src/domain/bio/types';
import { handleBioMessage } from '@/src/workers/handlers/bio';

const rec = (record: Partial<SeqRecord>): SeqRecord => ({
  id: 'record', name: 'record', sequence: 'ACGT', features: [], ...record,
});

describe('one molecule category per workspace, checked on every parsed record', () => {
  const parsed = (content: string) => {
    const response = handleBioMessage({ type: 'PARSE_FASTA', filename: 'in.fa', content });
    if (response.type !== 'FASTA_SUCCESS') throw new Error(`unexpected ${response.type}`);
    return response.alignedData;
  };
  const dna = [rec({ id: 'kept', sequence: 'ACGT', moleculeType: 'dna' })];
  // The first three records match the workspace category.
  const mixedFile = '>d1\nACGT\n>d2\nACGT\n>d3\nACGT\n>p1\nMEEPQSDPSV\n';

  it.each([
    ['a mixed file into an empty workspace', [] as SeqRecord[], mixedFile, { incoming: 'mixed', loaded: null }],
    ['a mixed file into a nucleotide workspace', dna, mixedFile, { incoming: 'mixed', loaded: 'nucleotide' }],
    ['a peptide file into a nucleotide workspace', dna, '>p1\nMEEPQSDPSV\n', { incoming: 'protein', loaded: 'nucleotide' }],
  ])('refuses %s and leaves the workspace untouched', (_case, prev, content, conflict) => {
    expect(applyFastaResponse(prev, parsed(content), false, 'in.fa')).toEqual({ next: prev, kind: 'reject-session-type', conflict });
  });

  it('accepts DNA and RNA together as one nucleotide category', () => {
    const result = applyFastaResponse(dna, parsed('>r\nACGU\n>d\nACGT\n'), false, 'in.fa');
    expect(result.kind).toBe('batch');
    expect(result.next.map(r => r.moleculeType)).toEqual(['dna', 'rna', 'dna']);
  });

  it('checks GenBank records the same way', () => {
    const protein = rec({ id: 'p', sequence: 'MEEP', moleculeType: 'protein' });
    expect(applyParseResponse(dna, [protein], 'p.gb')).toEqual({ next: dna, kind: 'reject-session-type', conflict: { incoming: 'protein', loaded: 'nucleotide' } });
    const added = applyParseResponse(dna, [rec({ id: 'n', sequence: 'ACGT', moleculeType: 'dna' })], 'n.gb');
    expect(added.kind).toBe('batch');
    expect(added.next.map(r => r.id)).toEqual(['kept', 'n']);
  });

  it('logs the refusal with the file name', () => {
    const logs: string[] = [];
    applyFastaAndLog([], parsed(mixedFile), false, message => logs.push(message), 'mixed.fa');
    applyFastaAndLog(dna, parsed('>p1\nMEEPQSDPSV\n'), false, message => logs.push(message), 'p.fa');
    expect(logs).toEqual([
      'ERROR: mixed.fa was not loaded: it mixes nucleotide and peptide records, and a workspace holds one molecule type.',
      'ERROR: p.fa was not loaded: its peptide records do not match the nucleotide workspace.',
    ]);
  });
});

describe('alignment overlay refuses a record that appears more than once', () => {
  const fa = (id: string, sequence: string) => ({ id, name: id, sequence, features: [] as BioFeature[], moleculeType: 'dna' as const });
  const prev = [rec({ id: 'a', sequence: 'ACGT' }), rec({ id: 'b', sequence: 'ACGT' })];

  it.each([
    ['differently gapped rows', [fa('a', 'AC-GT'), fa('a', 'ACGT-'), fa('b', 'ACGT-')]],
    ['identical rows', [fa('a', 'ACGT-'), fa('a', 'ACGT-'), fa('b', 'ACGT-')]],
  ])('for %s, leaving the workspace untouched', (_case, rows) => {
    expect(applyFastaResponse(prev, rows, true)).toEqual({ next: prev, kind: 'reject-duplicate', ids: ['a'] });
  });

  it('compares IDs after header resolution, so "seq 1" and "seq 2" are different records', () => {
    const spaced = [rec({ id: 'seq 1', sequence: 'ACGT' }), rec({ id: 'seq 2', sequence: 'ACGT' })];
    const rows = [{ ...fa('seq', 'ACGT-'), header: '1' }, { ...fa('seq', 'AC-GT'), header: '2' }];
    expect(applyFastaResponse(spaced, rows, true).kind).toBe('overlay');
  });

  it('logs the repeated IDs', () => {
    const logs: string[] = [];
    applyFastaAndLog(prev, [fa('a', 'ACGT'), fa('a', 'ACGT'), fa('b', 'ACGT')], true, message => logs.push(message));
    expect(logs).toEqual(['ERROR: Each record may appear only once in an alignment; repeated: [a]']);
  });
});

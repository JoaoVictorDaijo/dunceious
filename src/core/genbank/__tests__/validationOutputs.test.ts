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

import { parseProject, serializeProject } from '@/src/app/logic/projectFile';
import { it, expect } from 'vitest';
import { extractCodingSequence, extractFeatureSequence, isFeatureBroken } from '@/src/domain/bio/sequence';
import { sliceRecordsBySelection } from '@/src/domain/bio/intervals';
import { genBankExportProblem } from '@/src/domain/bio/genbankValidation';
import { exportToGff3 } from '@/src/core/formats/gff3';
import { parseGenBank, parseLocation } from '../index';
import { handleBioMessage } from '@/src/workers/handlers/bio';
import { refusedGenBankIds } from '@/src/app/logic/genbankImport';
import type { BioFeature, SeqRecord } from '@/src/domain/bio/types';

const feature = (frame: string): BioFeature => ({ type: 'CDS', name: 'C', start: 0, end: 9, strand: 1, metadata: { codon_start: frame } });
const record = (sequence = 'ATGAAATAA', features: BioFeature[] = []): SeqRecord => ({ id: 'X', name: 'X', sequence, features });
it.each(['', '0', '4', '2junk'])('suppresses every invalid-frame computation (%s)', frame => {
  const f = feature(frame);
  expect(extractCodingSequence(f, 'ATGAAATAA')).toEqual({ codingSeq: '', alignedIndices: [] });
  expect(isFeatureBroken({ ...f, translation: 'M*K' }, 'ATGAAATAA')).toBe(false);
  expect(exportToGff3([record(undefined, [f])]).text.split('\n').filter(l => l.split('\t')[2] === 'CDS').map(l => l.split('\t')[7])).toEqual(['.']);
  expect(genBankExportProblem(record(undefined, [f]))).toContain('invalid /codon_start');
});
it('accepts valid frame and residue writer inputs, refuses invalid residues and code', () => {
  expect(extractCodingSequence(feature('2'), 'ATGAAATAA').codingSeq).toBe('TGAAATAA');
  expect(genBankExportProblem(record('ACRGT'))).toBeNull();
  for (const sequence of ['AC*GT', 'ACRGT?', 'AC-GT', 'AC.GT']) expect(genBankExportProblem(record(sequence))).toContain('non-residue');
  for (const code of ['', '99']) expect(genBankExportProblem(record(undefined, [{ ...feature('1'), metadata: { transl_table: code } }]))).toContain('invalid /transl_table');
});
it('preserves nested joins and standard-derived nested complement extraction', () => {
  expect(parseLocation('join(1..5,complement(join(10..20,30..40)))').segments).toHaveLength(3);
  const seq = 'CA'.repeat(60);
  for (const [loc, expected] of [['complement(join(complement(1..2),5..6))', 'TGCA'], ['complement(join(complement(1..2),complement(5..6)))', 'CACA']]) {
    const parsed = parseLocation(loc);
    expect(extractFeatureSequence(parsed, seq).featureSeq).toBe(expected);
  }
});
it('returns atomic refusal with categories and preserves all raw and sanitised aliases', () => {
  const response = handleBioMessage({ type: 'PARSE_GENBANK', filename: 'bad.gb', content: 'LOCUS foo;bar 5 aa\nACCESSION   AB123\nVERSION     AB123.1\nORIGIN\n 1 MKUX\n//', requestId: 4, workspaceRevision: 7 });
  expect(response).toMatchObject({ type: 'PARSE_REFUSED', categories: ['protein'], workspaceRevision: 7, requestId: 4 });
  if (response.type !== 'PARSE_REFUSED') throw new Error('wrong response');
  expect(refusedGenBankIds(response.records)).toEqual({ 'foo;bar': null, foo_bar: null, AB123: null, 'AB123.1': null });
});
it('returns warning findings alongside successful records', () => {
  expect(handleBioMessage({ type: 'PARSE_GENBANK', filename: 'notes.gb', content: 'LOCUS X 4 bp DNA\nFEATURES\n     CDS             1..4\n                     /codon_start=4\nORIGIN\n 1 acgt\n//' })).toMatchObject({ type: 'PARSE_SUCCESS', findings: [expect.objectContaining({ code: 'invalid-frame' })] });
  expect(parseGenBank('LOCUS X 4 aa\nORIGIN\n 1 MKUX\n//').findings).toEqual([]);
});

it('preserves an invalid frame on clipping while rebasing a valid one', () => {
  for (const [frame, expected] of [['4', '4'], ['2', '1']]) {
    const clipped = sliceRecordsBySelection([record(undefined, [feature(frame)])], 1, 8)[0];
    expect(clipped.features[0].metadata?.codon_start).toBe(expected);
  }
});

it('accepts nested joins and extracts their full standard-defined meaning', () => {
  const result = parseGenBank('LOCUS N 40 bp DNA\nFEATURES\n     gene            join(1..5,complement(join(10..20,30..40)))\nORIGIN\n 1 acgtacgtacgtacgtacgtacgtacgtacgtacgtacgt\n//');
  expect(result.findings).toEqual([]);
  expect(extractFeatureSequence(result.records[0].features[0], result.records[0].sequence).featureSeq).toBe('ACGTAACGTACGTACGACGTACGTACG');
});

it('preserves inert qualifiers and empty invalid frame/code values through a project round trip', () => {
  const records = [record(undefined, [{ ...feature(''), metadata: { codon_start: '', transl_table: '' }, unknownQualifiers: { phase: '1', label: 'private' } }])];
  const restored = parseProject(serializeProject({ records, featureColors: {}, showAnnotations: true, showTranslation: true, showConservation: false }));
  expect(restored.ok).toBe(true);
  if (!restored.ok) throw new Error(restored.message);
  expect(restored.project.records).toEqual(records);
  expect(genBankExportProblem(restored.project.records[0])).toContain('invalid /codon_start');
});

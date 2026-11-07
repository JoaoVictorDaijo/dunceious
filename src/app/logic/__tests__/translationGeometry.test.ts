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


import { expect, it } from 'vitest';
import type { BioFeature, FeatureSegment, SeqRecord } from '@/src/domain/bio/types';
import { conceptualTranslation, checkTranslation, geometryCodeBreakEvidence } from '@/src/domain/bio/translation';
import { parseLocation } from '@/src/core/genbank/locationParser';
import { saveEditedFeature } from '../featureManager';
import { parseProject, serializeProject } from '../projectFile';
import { applyAnnotations, logAttachedTranslationWarning } from '../bioResponse';
import { sliceRecordsBySelection } from '@/src/domain/bio/intervals';
import { handleBioMessage } from '@/src/workers/handlers/bio';
import { exportToGenBank } from '@/src/core/genbank/serialize';
import { parseGFF3, exportToGff3 } from '@/src/core/formats/gff3';

const sec = '(pos:4..6,aa:Sec)';
const pyl = '(pos:7..9,aa:Pyl)';
const parts = (...pairs: [number, number, (1 | -1)?][]): FeatureSegment[] => pairs.map(([start, end, strand]) => ({ start, end, ...(strand && { strand }) }));
interface MoveCase {
  name: string; sequence: string; before: FeatureSegment[]; after: FeatureSegment[];
  original: string[]; retained?: string[]; expected: string[]; protein?: string;
  frame?: string; nextFrame?: string; strand?: 1 | -1; circular?: boolean; removed?: boolean;
}
const moveCases: MoveCase[] = [
  { name: 'linear', sequence: 'ATGTGATAAATGTGATAA', before: parts([0,9]), after: parts([9,18]), original: [sec], expected: ['(pos:13..15,aa:Sec)'], protein: 'MU' },
  { name: 'circular origin split', sequence: 'ATGTGATAAATGTGATAA', before: parts([9,18]), after: parts([15,18],[0,6]), original: ['(pos:13..15,aa:Sec)'], expected: ['(pos:1..3,aa:Sec)'], circular: true, protein: '*U' },
  { name: 'circular origin unsplit', sequence: 'ATGTGATAAATGTGATAA', before: parts([15,18],[0,6]), after: parts([3,12]), original: ['(pos:1..3,aa:Sec)'], expected: ['(pos:7..9,aa:Sec)'], circular: true, protein: '*UM' },
  { name: 'minus circular origin split', sequence: 'ATGTGATAAATGTGATAA', before: parts([9,18]), after: parts([15,18],[0,6]), strand: -1, original: ['(pos:complement(13..15),aa:Sec)'], expected: ['(pos:complement(1..3),aa:Sec)'], circular: true, protein: 'SUL' },
  { name: 'swapped strands on repeated skipped visits', sequence: 'AAAATGTGATAAATGTGATAA', before: parts([0,1,1],[0,1,-1],[3,12,1]), after: parts([9,10,-1],[9,10,1],[12,21,1]), frame: '3', original: ['(pos:7..9,aa:Sec)'], expected: [], protein: 'M*', removed: true },
  { name: 'repeated visits with unchanged orientation', sequence: 'AAAATGTGATAAATGTGATAA', before: parts([0,1,1],[0,1,1],[3,12,1]), after: parts([9,10,1],[9,10,1],[12,21,1]), frame: '3', original: ['(pos:7..9,aa:Sec)'], expected: ['(pos:16..18,aa:Sec)'], protein: 'MU' },
  { name: 'frame-skipped part moves differently', sequence: 'AAAATGTGATAAATGTGATAA', before: parts([0,1],[3,12]), after: parts([1,2],[12,21]), frame: '2', original: ['(pos:7..9,aa:Sec)'], expected: [], protein: 'M*', removed: true },
  { name: 'splice reshape', sequence: 'ATGTGATAA', before: parts([0,4],[6,8]), after: parts([1,4],[6,9]), original: ['(pos:join(4,7..8),aa:Sec)'], expected: [], protein: 'C', removed: true },
  { name: 'shortened and reframed', sequence: 'ATGTGATAA', before: parts([0,9]), after: parts([0,1]), nextFrame: '2', original: [sec], expected: [], removed: true },
  { name: 'part count changes away from origin', sequence: 'ATGTGATAAATGTGATAA', before: parts([0,9]), after: parts([3,6],[6,12]), original: [sec], expected: [sec], protein: 'U*M' },
  { name: 'deleted earlier row', sequence: 'ATGAAACCCTAAATGAAACCCTAA', before: parts([0,12]), after: parts([12,24]), original: [sec,pyl], retained: [pyl], expected: ['(pos:19..21,aa:Pyl)'], protein: 'MKO' },
  { name: 'deleted row with duplicate survivors', sequence: 'ATGAAACCCTAAATGAAACCCTAA', before: parts([0,12]), after: parts([12,24]), original: [sec,pyl,pyl], retained: [pyl,pyl], expected: ['(pos:19..21,aa:Pyl)','(pos:19..21,aa:Pyl)'], protein: 'MKO' },
  { name: 'new duplicate cannot reuse a previous occurrence', sequence: 'ATGAAACCCTAAATGAAACCCTAA', before: parts([0,12]), after: parts([12,24]), original: [sec,pyl], retained: [pyl,pyl], expected: ['(pos:19..21,aa:Pyl)'], protein: 'MKO', removed: true },
];
it.each(moveCases)('compares the explicit move shape: $name', row => {
  const feature = (segments: FeatureSegment[], values: string[], frame: string): BioFeature => ({ type: 'CDS', name: 'c', start: segments[0].start, end: segments.at(-1)!.end, strand: row.strand ?? 1, segments, metadata: { codon_start: frame }, translationExceptions: values });
  const original = feature(row.before, row.original, row.frame ?? '1');
  const record: SeqRecord = { id: 'r', name: 'r', sequence: row.sequence, isCircular: row.circular, features: [original] };
  const snapshot = JSON.stringify(record);
  const notices: string[] = [];
  const saved = saveEditedFeature([record], 'r', 0, feature(row.after, row.retained ?? row.original, row.nextFrame ?? row.frame ?? '1'), message => notices.push(message))[0];
  expect(saved.features[0].translationExceptions).toEqual(row.expected);
  if (row.protein !== undefined) expect(conceptualTranslation(saved.features[0], saved)).toMatchObject({ status: 'ok', residues: row.protein });
  else expect(conceptualTranslation(saved.features[0], saved)).toMatchObject({ status: 'unavailable', reason: 'empty' });
  expect(notices.some(message => message.includes('removed before Save'))).toBe(Boolean(row.removed));
  if (row.protein === 'MKO') expect(saved.features[0].metadata).toMatchObject({ translation: 'MKO', _translationSource: 'computed' });
  expect(JSON.stringify(record)).toBe(snapshot);
});

const state = (records: SeqRecord[]) => ({ records, featureColors: {}, showAnnotations: true, showTranslation: true, showConservation: false });
const recordWith = (values: string[]): SeqRecord => ({ id: 'r', name: 'r', sequence: 'ATGTGATAA', features: [{ type: 'CDS', name: 'c', start: 0, end: 9, strand: 1, segments: parts([0,9]), metadata: { transl_table: '999', translation: 'MU', _translationSource: 'imported' }, translationExceptions: values }] });
const genbank = (values: string[]) => `LOCUS       r 9 bp DNA linear
FEATURES             Location/Qualifiers
     CDS             1..9
                     /gene="c"
                     /transl_table=999
${values.map(raw => '                     /transl_except=' + raw).join('\n')}
                     /translation="MU"
ORIGIN
        1 atgtgataa
//
`;
it.each([
  { name: 'conflict', values: [sec,'(pos:4..6,aa:Pyl)'], expected: [], losses: 2 },
  { name: 'identical duplicate', values: [sec,sec], expected: [sec,sec], losses: 0 },
])('normalizes $name independently of table 999 at every ingress and Save', ({values,expected,losses}) => {
  const record = recordWith(values);
  const snapshot = JSON.stringify(record);
  expect(conceptualTranslation(record.features[0], record)).toMatchObject({ status: 'unavailable', reason: 'invalid-code' });
  const imported = handleBioMessage({ type: 'PARSE_GENBANK', filename: 'r.gb', content: genbank(values) });
  expect(imported.type).toBe('PARSE_SUCCESS');
  if (imported.type !== 'PARSE_SUCCESS') throw new Error('unexpected refusal');
  expect(imported.records[0].features[0].translationExceptions).toEqual(expected);
  if (!imported.findings) throw new Error('missing import findings');
  expect(imported.findings.filter(f => f.message.includes('conflicting residues'))).toHaveLength(losses);
  const logs: string[] = [];
  const loaded = parseProject(serializeProject(state([record])), message => logs.push(message));
  expect(loaded.ok).toBe(true);
  if (!loaded.ok) throw new Error(loaded.message);
  expect(loaded.project.records[0].features[0].translationExceptions).toEqual(expected);
  const rows = parseGFF3('r\t.\tCDS\t1\t9\t.\t+\t0\tID=c;translation=MU;transl_table=999;transl_except=' + values.map(value => value.replace(',', '%2C')).join(','));
  const attached = applyAnnotations([{ ...record, features: [] }], rows.features);
  expect(attached.refusal).toBeUndefined();
  expect(attached.next[0].features[0].translationExceptions).toEqual(expected);
  logAttachedTranslationWarning([], attached.next, message => logs.push(message));
  expect((logs.join(' ').match(/conflicting residues/g) ?? []).length).toBe(losses * 2);
  const notices: string[] = [];
  const saved = saveEditedFeature([{ ...record, features: [{ ...record.features[0], translationExceptions: [] }] }], 'r', 0, record.features[0], message => notices.push(message))[0];
  expect(saved.features[0].translationExceptions).toEqual(expected);
  expect(notices.filter(message => message.includes('conflicting residues'))).toHaveLength(losses);
  expect(conceptualTranslation(saved.features[0], saved)).toMatchObject({ status: 'unavailable', reason: 'invalid-code' });
  expect(saved.features[0].metadata?.translation).toBeUndefined();
  const normalized = loaded.project.records;
  expect(exportToGenBank(normalized)).toMatchObject({ text: '', report: { genBankRecordsOmitted: [{ reason: expect.stringContaining('invalid /transl_table') }] } });
  const writable = normalized.map(r => ({ ...r, features: r.features.map(f => ({ ...f, metadata: { ...f.metadata, transl_table: '1' } })) }));
  expect((exportToGenBank(writable).text.match(/\/transl_except=/g) ?? [])).toHaveLength(expected.length);
  expect(parseGFF3(exportToGff3(normalized).text).features.r[0].translationExceptions ?? []).toEqual(expected);
  expect(JSON.stringify(record)).toBe(snapshot);
});
it.each([109,105])('uses geometry for selection and project round-trip with table 999, end %s', end => {
  const record = recordWith(['(pos:104..106,aa:Sec)']);
  record.sequence = 'N'.repeat(100) + 'ATGTGATAA';
  record.features[0] = { ...record.features[0], start: 100, end: 109, segments: parts([100,109]) };
  const snapshot = JSON.stringify(record);
  const sliced = sliceRecordsBySelection([record], 100, end);
  expect(sliced.records[0].features[0].translationExceptions).toEqual(end === 109 ? [sec] : []);
  if (end === 109) expect(sliced.losses).toEqual([]);
  else expect(sliced.losses).toMatchObject([{ feature: 'c' }, { raw: '(pos:104..106,aa:Sec)', reason: expect.stringMatching(/lost entry bases 106/) }]);
  const loaded = parseProject(serializeProject(state(sliced.records)), () => {});
  expect(loaded.ok).toBe(true);
  if (!loaded.ok) throw new Error(loaded.message);
  expect(loaded.project.records[0].features[0].translationExceptions).toEqual(end === 109 ? [sec] : []);
  expect(conceptualTranslation(loaded.project.records[0].features[0], loaded.project.records[0])).toMatchObject({ status: 'unavailable', reason: 'invalid-code' });
  expect(JSON.stringify(record)).toBe(snapshot);
});
it('writers trust normalized arrays and keep defensive GenBank shape errors independent of table 999', () => {
  const raw = '(pos:5..7,aa:Sec)';
  const record = recordWith([raw]);
  expect(exportToGenBank([record])).toMatchObject({ text: '', report: { genBankRecordsOmitted: [{ reason: expect.stringContaining('invalid /transl_table') }] } });
  const writable = { ...record, features: record.features.map(f => ({ ...f, metadata: { ...f.metadata, transl_table: '1' } })) };
  expect(() => exportToGenBank([writable])).toThrow(/CDS c.*5\.\.7.*off-frame/);
  const text = exportToGff3([record]).text;
  const value = text.match(/transl_except=([^;\n]+)/)![1];
  expect(decodeURIComponent(value)).toBe(raw);
  expect(record.features[0].translationExceptions).toEqual([raw]);
});
it('preserves protein-record raw breaks without nucleotide geometry or conflict claims', () => {
  const record = { ...recordWith([sec,'(pos:4..6,aa:Pyl)','(pos:OTHER.1:4..6,aa:Sec)']), moleculeType: 'protein' as const };
  const checked = checkTranslation(record.features[0], record);
  expect(checked.translationExceptions).toEqual(record.features[0].translationExceptions);
  expect(geometryCodeBreakEvidence(checked, record).every(e => e.codonIndex === undefined)).toBe(true);
  expect(conceptualTranslation(checked, record)).toMatchObject({ status: 'unavailable', reason: 'protein-record' });
});

it.each([
  { name: 'all named bases survive but codon membership changes', end: 10, table: '1', values: ['(pos:1..3,aa:Sec)'], kept: [], protein: 'MI', removed: [{ occurrence: 0, raw: '(pos:1..3,aa:Sec)', reason: expect.stringContaining('off-frame') }] },
  { name: 'clipped break still names a codon', end: 9, table: '1', values: ['(pos:1..3,aa:Sec)'], kept: ['(pos:1..3,aa:Sec)'], protein: 'U', removed: [] },
  { name: 'original occurrence and qualified literal survive prior filtering', end: 10, table: '1', values: ['(pos:10..12,aa:Met)', '(pos:R.1:1..3,aa:Sec)'], kept: [], protein: 'MI', removed: [{ occurrence: 0, raw: '(pos:10..12,aa:Met)', reason: expect.stringContaining('lost entry bases 11, 12') }, { occurrence: 1, raw: '(pos:R.1:1..3,aa:Sec)', reason: expect.stringContaining('off-frame') }] },
  { name: 'post-transform validation is independent of table eligibility', end: 10, table: '999', values: ['(pos:1..3,aa:Sec)'], kept: [], protein: undefined, removed: [{ occurrence: 0, raw: '(pos:1..3,aa:Sec)', reason: expect.stringContaining('off-frame') }] },
])('revalidates circular selection before storing its protein: $name', row => {
  const source: SeqRecord = { id: 'r', name: 'r', accession: 'R', version: 'R.1', moleculeType: 'dna', sequence: 'TGATAANNNATG', isCircular: true, features: [{ type: 'CDS', name: 'c', start: 9, end: 6, strand: 1, operator: 'join', segments: parts([9,12],[0,6]), locationString: 'join(10..12,1..6)', metadata: { codon_start: '1', transl_table: row.table, translation: 'MU', _translationSource: 'imported' }, translationExceptions: row.values }] };
  const snapshot = JSON.stringify(source);
  if (row.table === '1') expect(conceptualTranslation(source.features[0], source)).toMatchObject({ residues: 'MU' });
  const selected = sliceRecordsBySelection([source], 0, row.end);
  expect(selected.records[0].features[0].translationExceptions).toEqual(row.kept);
  expect(selected.losses.filter(loss => loss.occurrence !== undefined)).toMatchObject(row.removed);
  expect(selected.losses.filter(loss => loss.occurrence !== undefined)).toHaveLength(row.removed.length);
  expect(selected.records[0].features[0].metadata?.translation).toBe(row.protein);
  expect(selected.records[0].features[0].metadata?._translationSource).toBe(row.protein === undefined ? 'removed' : 'computed');
  expect(selected.records[0].features[0].metadata?.codon_start).toBe('1');
  const opened = parseProject(serializeProject(state(selected.records)), () => {});
  expect(opened.ok).toBe(true);
  if (!opened.ok) throw new Error(opened.message);
  expect(opened.project.records[0].features[0].translationExceptions).toEqual(row.kept);
  if (row.protein !== undefined) expect(conceptualTranslation(opened.project.records[0].features[0], opened.project.records[0])).toMatchObject({ status: 'ok', residues: row.protein });
  else expect(conceptualTranslation(opened.project.records[0].features[0], opened.project.records[0])).toMatchObject({ status: 'unavailable', reason: 'invalid-code' });
  expect(JSON.stringify(source)).toBe(snapshot);
});

it('validates a retained break using the adjusted selection frame', () => {
  const source: SeqRecord = { id: 'r', name: 'r', sequence: 'ATGTGATAA', features: [{ type: 'CDS', name: 'c', start: 0, end: 9, strand: 1, segments: parts([0,9]), metadata: { codon_start: '1', translation: 'MU', _translationSource: 'imported' }, translationExceptions: [sec] }] };
  const snapshot = JSON.stringify(source);
  const selected = sliceRecordsBySelection([source], 1, 9);
  expect(selected.records[0].sequence).toBe('TGTGATAA');
  expect(selected.records[0].features[0]).toMatchObject({
    translationExceptions: ['(pos:3..5,aa:Sec)'],
    segments: [{ start: 0, end: 8, partialStart: true }],
    metadata: { codon_start: '3', translation: 'U', _translationSource: 'computed' },
  });
  const opened = parseProject(serializeProject(state(selected.records)), () => {});
  expect(opened.ok).toBe(true);
  if (!opened.ok) throw new Error(opened.message);
  expect(conceptualTranslation(opened.project.records[0].features[0], opened.project.records[0])).toMatchObject({ status: 'ok', residues: 'U' });
  expect(selected.losses.filter(loss => loss.occurrence !== undefined)).toEqual([]);
  expect(JSON.stringify(source)).toBe(snapshot);
});

it.each([
  ['ATGCCCTAA', [{ start: 0, end: 4, strand: 1 as const }, { start: 6, end: 9, strand: 1 as const }], 'order(1..4,7..9)'],
  ['ATGCCCAAATTT', [{ start: 0, end: 3, strand: 1 as const }, { start: 6, end: 12, strand: 1 as const }], 'order(1..3,7..12)'],
])('retains nested order through geometry edits on %s', (sequence, segments, location) => {
  const original: BioFeature = { type: 'CDS', name: 'ordered', ...parseLocation('complement(complement(order(1..3,7..9)))') };
  expect(original.operator).toBe('order');
  const record: SeqRecord = { id: 'r', name: 'r', sequence, features: [original] };
  const saved = saveEditedFeature([record], 'r', 0, { ...original, segments, end: segments[1].end })[0];
  expect(saved.features[0].metadata?.translation).toBeUndefined();
  expect(conceptualTranslation(saved.features[0], saved)).toMatchObject({ status: 'unavailable', reason: 'nonlocal-location' });
  expect(exportToGenBank([saved]).text).toContain(location);
});

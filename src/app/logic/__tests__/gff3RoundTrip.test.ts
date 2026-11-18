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
import { exportToGff3, parseGFF3 } from '@/src/core/formats/gff3';
import { describeSelectionLoss } from '@/src/core/exportReport';
import { parseGenBank, exportToGenBank } from '@/src/core/genbank';
import { sliceRecordsBySelection } from '@/src/domain/bio/intervals';
import { extractFeatureSequence } from '@/src/domain/bio/sequence';
import { conceptualTranslation } from '@/src/domain/bio/translation';
import type { SeqRecord } from '@/src/domain/bio/types';
import { saveEditedFeature } from '../featureManager';
import { applyAnnotations } from '../bioResponse';
import { parseProject, serializeProject } from '../projectFile';

function attachGff(record: SeqRecord, text: string): SeqRecord {
  const { features, details } = parseGFF3(text);
  const result = applyAnnotations([{ ...record, features: [] }], features, details);
  expect(result.refusal).toBeUndefined();
  expect(result.totalAdded).toBe(1);
  return result.next[0];
}

it.each([
  { sequence: 'AAATAACCCATG', start: 9, end: 6, strand: 1, protein: 'MK', partial: false, first: ['10', '12', '.', '+', '0'], second: ['1', '6', '.', '+', '0'] },
  { sequence: 'AAATAACCCCTG', start: 9, end: 6, strand: 1, protein: 'LK', partial: true, first: ['10', '12', '.', '+', '0'], second: ['1', '6', '.', '+', '0'] },
  { sequence: 'ATTTCATCCCTT', start: 10, end: 7, strand: -1, protein: 'MK', partial: true, first: ['11', '12', '.', '-', '2'], second: ['1', '7', '.', '-', '0'] },
] as const)('writes and reattaches in-bounds wrapped CDS rows for $sequence', ({ sequence, start, end, strand, protein, partial, first, second }) => {
  const record: SeqRecord = { id: 'r', name: 'r', sequence, isCircular: true, features: [{
    type: 'CDS', name: 'c', start, end, strand,
    segments: [{ start, end, ...(partial && { partialStart: true, partialEnd: true }) }],
  }] };
  const { text } = exportToGff3([record]);
  const rows = text.trimEnd().split('\n').slice(3).map(row => row.split('\t'));
  expect(rows.map(row => row.slice(3, 8))).toEqual([first, second]);
  if (partial) {
    expect(rows[0][8].split(';')).toEqual(expect.arrayContaining(['partial=true', 'start_range=.,' + (start + 1)]));
    expect(rows[1][8].split(';')).toEqual(expect.arrayContaining(['partial=true', 'end_range=' + end + ',.']));
  }
  const attached = attachGff(record, text);
  const feature = attached.features.find(feature => feature.type === 'CDS')!;
  expect(feature.segments).toEqual([
    { start, end: sequence.length, ...(partial && { partialStart: true }) },
    { start: 0, end, ...(partial && { partialEnd: true }) },
  ]);
  expect(conceptualTranslation(feature, attached)).toMatchObject({ residues: protein });
});

it.each([
  ['+', 'GTGAAATAA', '11', 'start_range=.,1', 'VK'],
  ['-', 'TTATTTCAC', '11', 'end_range=9,.', 'VK'],
  ['+', 'ATGAAATGA', '27', 'end_range=9,.', 'MKW'],
  ['-', 'TCATTTCAT', '27', 'start_range=.,1', 'MKW'],
])('reads and writes open genomic boundaries on strand %s for %s', (strand, sequence, table, range, residues) => {
  const row = ['r', 's', 'CDS', '1', '9', '.', strand, '0', 'ID=c;transl_table=' + table + ';partial=true;' + range];
  const record = attachGff({ id: 'r', name: 'r', sequence, features: [] }, row.join('\t'));
  expect(conceptualTranslation(record.features[0], record)).toMatchObject({ residues });
  const { text } = exportToGff3([record]);
  expect(text).toMatch(/;partial=true(?:;|\n)/);
  expect(text).toContain(';' + range);
  const reread = attachGff(record, text);
  const feature = reread.features.find(feature => feature.type === 'CDS')!;
  expect(conceptualTranslation(feature, reread)).toMatchObject({ residues });
});

it('reattaches a mixed-strand GenBank selenocysteine exception', () => {
  const { records, findings } = parseGenBank([
    'LOCUS       r 9 bp DNA linear',
    'FEATURES             Location/Qualifiers',
    '     CDS             join(1..3,complement(4..6),complement(7..9))',
    '                     /transl_except=(pos:4..6,aa:Sec)',
    'ORIGIN',
    '        1 atgtcatta',
    '//',
  ].join('\n'));
  expect(findings.filter(finding => finding.tier === 'refuse')).toEqual([]);
  const [record] = records;
  const attached = attachGff(record, exportToGff3(records).text);
  const feature = attached.features.find(feature => feature.type === 'CDS')!;
  expect(feature.strand).toBe(-1);
  expect(conceptualTranslation(feature, attached)).toMatchObject({ residues: 'MU' });
});

it('retains a curated translation supplied only on the second CDS row', () => {
  const record = attachGff({ id: 'r', name: 'r', sequence: 'ATGAAATAA', features: [] },
    'r\ts\tCDS\t1\t3\t.\t+\t0\tID=c\nr\ts\tCDS\t4\t9\t.\t+\t0\tID=c;translation=MQ');
  expect(record.features[0].metadata).toMatchObject({ translation: 'MQ', _translationSource: 'imported',
    _translationCheck: expect.stringContaining('"differing":[1]') });
  expect(conceptualTranslation(record.features[0], record)).toMatchObject({ residues: 'MK' });
});

it('still reads private partial-end markers in existing CDS files', () => {
  const record = attachGff({ id: 'r', name: 'r', sequence: 'GTGAAATAA', features: [] },
    'r\ts\tCDS\t1\t9\t.\t+\t0\tID=c;transl_table=11;insdc_partial_start=%3C');
  expect(conceptualTranslation(record.features[0], record)).toMatchObject({ residues: 'VK' });
});

it('omits a clipped one-part order CDS from GFF3 and GenBank', () => {
  const { records } = parseGenBank(`LOCUS       x 12 bp DNA linear
FEATURES             Location/Qualifiers
     CDS             order(1..6,10..12)
                     /gene="ordered"
ORIGIN
        1 ATGAAACCCTAA
//`);
  const { records: selected, losses } = sliceRecordsBySelection(records, 0, 6);
  const gff = parseGFF3(exportToGff3(selected).text);
  const gb = parseGenBank(exportToGenBank(selected).text);
  expect(gff.features.x?.some(feature => feature.type === 'CDS') ?? false).toBe(false);
  expect(gb.records[0].sequence).toBe('ATGAAA');
  expect(gb.records[0].features.some(feature => feature.type === 'CDS')).toBe(false);
  expect(losses.map(describeSelectionLoss)).toEqual([
    'x: CDS ordered: CDS omitted; one part of an order() CDS gives no defined product or frame',
  ]);
});

it('preserves the order marker of a legacy one-part ordered CDS reopened from a project', () => {
  const record: SeqRecord = { id: 'r', name: 'r', sequence: 'ATGAAA', features: [{
    type: 'CDS', name: 'ordered', start: 0, end: 6, strand: 1, operator: 'order',
    segments: [{ start: 0, end: 6, partialEnd: true }],
  }] };
  const project = parseProject(serializeProject({
    records: [record], featureColors: {}, showAnnotations: true, showTranslation: true, showConservation: false,
  }));
  if (!project.ok) throw new Error(project.message);
  const { text } = exportToGff3(project.project.records);
  expect(text).toContain('insdc_operator=order');
  const attached = attachGff(record, text);
  const feature = attached.features.find(feature => feature.type === 'CDS')!;
  expect(feature.operator).toBe('order');
  expect(conceptualTranslation(feature, attached)).toMatchObject({
    status: 'unavailable', reason: 'nonlocal-location',
  });
});

function genBank(sequence: string, location: string, qualifier = '', circular = false, type = 'CDS'): string {
  return `LOCUS       r ${sequence.length} bp DNA ${circular ? 'circular' : 'linear'}
FEATURES             Location/Qualifiers
     ${type.padEnd(16)}${location}
                     /gene="test"
${qualifier ? '                     ' + qualifier + '\n' : ''}     source          1..${sequence.length}
                     /organism="synthetic construct"
                     /mol_type="genomic DNA"
ORIGIN
        1 ${sequence}
//
`;
}

function reopenGenBank(text: string): SeqRecord {
  const { records, findings } = parseGenBank(text);
  expect(findings.filter(finding => finding.tier === 'refuse')).toEqual([]);
  return records[0];
}

it.each([
  ['join(complement(9..12),4..5)', [1, 0, 2], [8, 5], 'ATTTAGAA'],
  ['complement(join(complement(join(4..5,6..7)),9..12))', [3, 2, 0, 1], [3, 2], 'ATTTAGAAAC'],
])('preserves written and evaluation order after splitting a minus wrap in %s', (location, ranks, span, bases) => {
  const record = reopenGenBank(genBank('ATGAAACCCTAA', location, '', true, 'misc_feature'));
  const feature = record.features[0];
  const [edited] = saveEditedFeature([record], 'r', 0, {
    ...feature, locationString: undefined,
    segments: [{ ...feature.segments![0], end: 2 }, ...feature.segments!.slice(1)],
  }, () => {});
  const gff = attachGff(edited, exportToGff3([edited]).text);
  const gb = reopenGenBank(exportToGenBank([edited]).text);
  for (const reopened of [gff, gb]) {
    const imported = reopened.features.find(f => f.type === 'misc_feature')!;
    expect(imported.writtenOrder).toEqual(ranks);
    expect([imported.start, imported.end]).toEqual(span);
    expect(extractFeatureSequence(imported, reopened.sequence).featureSeq).toBe(bases);
  }
});

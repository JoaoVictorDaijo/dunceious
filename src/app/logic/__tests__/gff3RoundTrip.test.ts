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
import { featureFocusTarget } from '../focusTarget';
import { featureSequenceViews } from '../viewModel';
import { applyAnnotations } from '../bioResponse';
import { describeExport } from '../exportPlan';
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

it.each([
  { row: 'x\tRefSeq\tCDS\t2\t10\t.\t+\t0\tID=g;transl_table=11;partial=true;start_range=.,4',
    imported: 'start_range=.,4', oppositeEdit: { end: 11 }, boundaryEdit: { start: 2 },
    edited: 'start_range=.,3', reset: { start: 1 }, resetRange: 'start_range=.,2',
    clip: [2, 12], clipped: 'start_range=.,1', rebased: 'start_range=.,3',
    excludeLimit: [0, 3], regenerated: 'start_range=.,2' },
  { row: 'x\tRefSeq\tCDS\t1\t9\t.\t-\t0\tID=g;transl_table=11;partial=true;end_range=7,.',
    imported: 'end_range=7,.', oppositeEdit: { start: 1 }, boundaryEdit: { end: 8 },
    edited: 'end_range=8,.', reset: { end: 9 }, resetRange: 'end_range=9,.',
    clip: [0, 8], clipped: 'end_range=8,.', rebased: 'end_range=6,.',
    excludeLimit: [7, 12], regenerated: 'end_range=2,.' },
])('retains the imported ambiguity $imported until that boundary moves', fixture => {
  const { row, imported, oppositeEdit, boundaryEdit, edited, reset, resetRange, clip, clipped, rebased, excludeLimit, regenerated } = fixture;
  const record = attachGff({ id: 'x', name: 'x', sequence: 'AGTGAAATAACA', features: [] }, row);
  const result = reopenProject(record);
  const edit = (input: SeqRecord, bounds: { start?: number; end?: number }) => {
    const feature = input.features[0];
    return saveEditedFeature([input], 'x', 0, { ...feature, segments: [{ ...feature.segments![0], ...bounds }] });
  };
  const moved = edit(result, boundaryEdit);
  expect(exportToGff3([result]).text).toContain(';' + imported);
  expect(exportToGff3(edit(result, oppositeEdit)).text).toContain(';' + imported);
  expect(exportToGff3(moved).text).toContain(';' + edited);
  expect(exportToGff3(edit(moved[0], reset)).text).toContain(';' + resetRange);
  expect(exportToGff3(sliceRecordsBySelection([result], clip[0], clip[1]).records).text).toContain(';' + clipped);
  expect(exportToGff3(sliceRecordsBySelection([result], 1, 12).records).text).toContain(';' + rebased);
  expect(exportToGff3(sliceRecordsBySelection([result], excludeLimit[0], excludeLimit[1]).records).text).toContain(';' + regenerated);
});

it('keeps landmark and wrapped GFF3 boundary uncertainty on the corresponding rows', () => {
  const record = attachGff({ id: 'x', name: 'x', sequence: 'AGTGAAATAACA', features: [], isCircular: true }, [
    'x\tRefSeq\tregion\t1\t12\t.\t+\t.\tgbkey=Src;Is_circular=true;partial=true;start_range=.,2',
    'x\tRefSeq\tCDS\t9\t16\t.\t-\t0\tID=g;transl_table=11;partial=true;start_range=.,10;end_range=14,.',
  ].join('\n'));
  const { text } = exportToGff3([record]);
  const rows = text.trimEnd().split('\n').slice(2).map(row => row.split('\t')[8].split(';').filter(attr => /^(start|end)_range=/.test(attr)));
  expect(rows).toEqual([['start_range=.,2'], ['start_range=.,10'], ['end_range=2,.']]);
});

it.each([
  ['.,13', 'start_range=.,9', [
    'x: g: start_range=.,13 cannot be kept on the GFF3 row that owns the boundary after splitting at the origin.',
    'x: g: end_range=11,. cannot be kept on the GFF3 row that owns the boundary after splitting at the origin.',
  ]],
  ['.,10', 'start_range=.,10', [
    'x: g: end_range=11,. cannot be kept on the GFF3 row that owns the boundary after splitting at the origin.',
  ]],
] as const)('reports the original GFF3 limits lost on a circular split with start_range=%s', (start, startRange, warnings) => {
  const record = attachGff({ id: 'x', name: 'x', sequence: 'AGCTGACCTGAA', features: [], isCircular: true }, [
    '##gff-version 3',
    '##sequence-region x 1 12',
    'x\t.\tregion\t1\t12\t.\t+\t.\tID=x;gbkey=Src;Is_circular=true',
    `x\t.\tgene\t9\t16\t.\t+\t.\tID=g;partial=true;start_range=${start};end_range=11,.`,
  ].join('\n'));
  const reopened = reopenProject(record);
  const { text, report } = exportToGff3([reopened]);
  expect(text.trimEnd().split('\n').slice(-2)).toEqual([
    `x\t.\tgene\t9\t12\t.\t+\t.\tID=x.1;Name=g;partial=true;${startRange}`,
    'x\t.\tgene\t1\t4\t.\t+\t.\tID=x.1;Name=g;partial=true;end_range=4,.',
  ]);
  expect.soft(report).toMatchObject({ gff3RangeWarnings: warnings });
  const preview = describeExport([reopened], 'gff3');
  for (const warning of warnings) expect.soft(preview.summary).toContain(warning);
});

it('reattaches a mixed-strand GenBank selenocysteine exception', () => {
  const { records, findings } = parseGenBank([
    'LOCUS       r 9 bp DNA linear',
    'FEATURES             Location/Qualifiers',
    '     CDS             join(1..3,complement(4..6),complement(7..9))',
    '                     /transl_except=(pos:complement(4..6),aa:Sec)',
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

function reopenProject(record: SeqRecord): SeqRecord {
  const result = parseProject(serializeProject({
    records: [record], featureColors: {}, showAnnotations: true, showTranslation: true, showConservation: false,
  }));
  if (!result.ok) throw new Error(result.message);
  return result.project.records[0];
}

it.each([
  ['(pos:4..6,aa:Sec)', 'MKU'],
  ['(pos:complement(10..12),aa:Sec)', 'MU*'],
])('preserves explicit mixed-strand code break %s after extending across the origin', (exception, residues) => {
  const record = reopenGenBank(genBank('CATTGATAATTT', 'join(complement(10..12),4..9)', '/transl_except=' + exception, true));
  const feature = record.features[0];
  const [edited] = saveEditedFeature([record], 'r', 0, {
    ...feature, locationString: undefined,
    segments: [{ ...feature.segments![0], end: 3 }, feature.segments![1]],
  }, () => {});
  const selected = sliceRecordsBySelection([edited], 0, 12);
  expect(selected.losses).toEqual([]);
  const exported = exportToGenBank(selected.records);
  expect(exported.text.split('\n').filter(line => line.includes('/transl_except='))).toEqual([
    '                     /transl_except=' + exception,
  ]);
  for (const reopened of [edited, reopenGenBank(exported.text), attachGff(edited, exportToGff3([edited]).text), reopenProject(edited)]) {
    expect(conceptualTranslation(reopened.features.find(f => f.type === 'CDS')!, reopened)).toMatchObject({ status: 'ok', residues });
  }
});

it.each([
  ['ATGTGATAA', '1..9'],
  ['TTATCACAT', 'complement(1..9)'],
])('keeps the single-strand bare code break on %s at %s', (sequence, location) => {
  const record = reopenGenBank(genBank(sequence, location, '/transl_except=(pos:4..6,aa:Sec)'));
  const { text } = exportToGenBank([record]);
  expect(text.split('\n').filter(line => line.includes('/transl_except='))).toEqual([
    '                     /transl_except=(pos:4..6,aa:Sec)',
  ]);
  const reopened = reopenGenBank(text);
  expect(conceptualTranslation(reopened.features.find(f => f.type === 'CDS')!, reopened)).toMatchObject({ status: 'ok', residues: 'MU' });
});

it('refuses a bare code break on the minus part of a mixed-strand CDS', () => {
  const { findings } = parseGenBank(genBank('ATGTCATTA', 'join(1..3,complement(4..6),complement(7..9))', '/transl_except=(pos:4..6,aa:Sec)'));
  expect(findings.filter(finding => finding.tier === 'refuse')).toEqual([
    expect.objectContaining({ code: 'malformed-qualifier', message: expect.stringContaining('contrary-orientation code break') }),
  ]);
});


it('rebases a bare forward exception on a linear mixed CDS with a minus majority', () => {
  const record = reopenGenBank(genBank('CTGATTTTTAC', 'join(2..4,complement(5..7),complement(8..10))', '/transl_except=(pos:2..4,aa:Sec)'));
  const selected = sliceRecordsBySelection([record], 1, 10);
  expect(selected.losses).toEqual([]);
  const exported = exportToGenBank(selected.records);
  expect(exported.text).toContain('/transl_except=(pos:1..3,aa:Sec)\n');
  const reopened = reopenGenBank(exported.text);
  expect(conceptualTranslation(reopened.features.find(f => f.type === 'CDS')!, reopened)).toMatchObject({ status: 'ok', residues: 'UK' });
});

it('preserves both open boundaries on an attached full-length GFF3 source region', () => {
  const record: SeqRecord = { id: 'r', name: 'r', sequence: 'ATGAAATAA', features: [] };
  const { features, details } = parseGFF3('r\ts\tregion\t1\t9\t.\t+\t.\tID=r;gbkey=Src;organism=synthetic%20construct;mol_type=genomic%20DNA;partial=true;start_range=.,1;end_range=9,.');
  const attached = applyAnnotations([record], features, details);
  expect(attached.refusal).toBeUndefined();
  const { text } = exportToGff3([reopenProject(attached.next[0])]);
  const source = text.split('\n').find(line => line.split('\t')[2] === 'region')!;
  expect(source.split('\t')[8].split(';')).toEqual(expect.arrayContaining(['partial=true', 'start_range=.,1', 'end_range=9,.']));
  const reread = parseGFF3(text);
  expect(reread.details.r.feature.segments).toEqual([{ start: 0, end: 9, partialStart: true, partialEnd: true }]);
  const selected = sliceRecordsBySelection(attached.next, 0, 9);
  const genbank = exportToGenBank(selected.records).text;
  expect(genbank).toContain('     source          <1..>9\n');
  expect(reopenGenBank(genbank).features[0].segments).toEqual([{ start: 0, end: 9, partialStart: true, partialEnd: true }]);
});

it.each(['selection', 'edit'] as const)('keeps forward Sec after a minus-majority CDS becomes forward-only by %s', operation => {
  const record = reopenGenBank(genBank('ATGTGACCCGGGTTT', 'join(1..6,complement(10..12),complement(13..15))', '/transl_except=(pos:4..6,aa:Sec)'));
  const feature = record.features[0];
  const result = operation === 'selection' ? sliceRecordsBySelection([record], 0, 6).records : saveEditedFeature([record], 'r', 0, {
    ...feature, segments: [{ start: 0, end: 6, strand: 1 }], locationString: undefined, writtenOrder: undefined,
  });
  const cds = result[0].features.find(part => part.type === 'CDS')!;
  expect(cds.translationExceptions).toEqual(['(pos:4..6,aa:Sec)']);
  expect(conceptualTranslation(cds, result[0])).toMatchObject({ status: 'ok', residues: 'MU' });
});

it.each(['GFF3', 'project'])('omits the one-part ordered CDS from GenBank after reopening %s', format => {
  const seed = reopenGenBank(genBank('ATGAAATAA', '1..9', '', false, 'misc_feature'));
  const record = attachGff(seed, '##gff-version 3\nr\t.\tCDS\t1\t9\t.\t+\t0\tID=c;insdc_operator=order\n');
  record.features.unshift(seed.features.find(feature => feature.type === 'source')!);
  const restored = format === 'project' ? reopenProject(record) : record;
  const result = exportToGenBank([restored]);
  const reopened = reopenGenBank(result.text);
  expect(reopened.features.map(feature => feature.type)).toEqual(['source']);
  expect(result.report).toMatchObject({
    genBankFeaturesOmitted: ['r: CDS c: CDS omitted; one part of an order() CDS gives no defined product or frame'],
  });
});

it.each([
  { location: 'join(complement(9..12),AB123.1:1..2,4..5)', remoteIndex: 2, remoteStrand: 1, ranks: [1, 0, 2],
    segments: [{ start: 0, end: 2, strand: -1 }, { start: 8, end: 12, strand: -1 }, { start: 3, end: 5, strand: 1 }] },
  { location: 'join(complement(9..12),complement(AB123.1:1..2),4^5,4..5)', remoteIndex: 2, remoteStrand: -1, ranks: [1, 0, 2, 3],
    segments: [{ start: 0, end: 2, strand: -1 }, { start: 8, end: 12, strand: -1 }, { start: 4, end: 4, strand: 1 }, { start: 3, end: 5, strand: 1 }] },
] as const)('keeps the edited local wrap and remote evaluation position in $location', ({ location, remoteIndex, remoteStrand, ranks, segments }) => {
  const record = reopenGenBank(genBank('ATGAAACCCTAA', location, '', true, 'misc_feature'));
  const original = record.features[0];
  const [edited] = saveEditedFeature([record], 'r', 0, {
    ...original, locationString: undefined, segments: [{ ...original.segments![0], end: 2 }, ...original.segments!.slice(1)],
  });
  expect(edited.features[0]).toMatchObject({ start: 8, end: 5 });
  const projected = reopenProject(edited);
  const selected = sliceRecordsBySelection([projected], 0, 12);
  expect(selected.losses).toEqual([]);
  const gb = reopenGenBank(exportToGenBank(selected.records).text);
  const gff = attachGff(projected, exportToGff3(selected.records).text);
  for (const reopened of [gb, gff]) {
    expect(reopened.features.find(feature => feature.type === 'misc_feature')).toMatchObject({
      start: 8, end: 5, segments, writtenOrder: ranks,
      remoteParts: [{ accession: 'AB123.1', start: 0, end: 2, index: remoteIndex, strand: remoteStrand }],
    });
  }
});

it('preserves written order and the remote position after flipping an inherited strand and wrapping a part', () => {
  const record = reopenGenBank(`LOCUS       x 12 bp DNA circular
FEATURES             Location/Qualifiers
     source          1..12
                     /organism="synthetic construct"
                     /mol_type="genomic DNA"
     misc_feature    join(9..12,AB123.1:1..2,4..5)
ORIGIN
        1 ACGTACGTACGT
//
`);
  const [edited] = saveEditedFeature([record], 'x', 1, {
    ...record.features[1], strand: -1, locationString: undefined,
    segments: [{ start: 8, end: 2 }, { start: 3, end: 5 }],
  });
  expect(edited.features[1]).toMatchObject({ start: 8, end: 5 });

  const projected = reopenProject(edited);
  const selected = sliceRecordsBySelection([projected], 0, 12);
  const genbank = reopenGenBank(exportToGenBank(selected.records).text);
  const gff = attachGff(record, exportToGff3(selected.records).text);
  const expected = {
    start: 8, end: 5, writtenOrder: [1, 0, 2],
    segments: [{ start: 0, end: 2, strand: -1 }, { start: 8, end: 12, strand: -1 }, { start: 3, end: 5, strand: -1 }],
    remoteParts: [{ accession: 'AB123.1', start: 0, end: 2, strand: 1, index: 2 }],
  };
  for (const reopened of [genbank, gff]) {
    const feature = reopened.features.find(part => part.type === 'misc_feature')!;
    expect.soft(feature).toMatchObject(expected);
    expect.soft(featureFocusTarget(reopened, feature)).toMatchObject({ start: 8, end: 5 });
    expect.soft(featureSequenceViews(reopened, feature)).toMatchObject({ feature: null, region: 'ACGTACGTA', regionLength: 9 });
  }
  const [clipped] = sliceRecordsBySelection([edited], 0, 10).records;
  expect(clipped.features[1]).toMatchObject({
    start: 0, end: 10, writtenOrder: [1, 0, 2],
    segments: [{ start: 0, end: 2, strand: -1 }, { start: 8, end: 10, strand: -1, partialEnd: true }, { start: 3, end: 5, strand: -1 }],
    remoteParts: [{ accession: 'AB123.1', start: 0, end: 2, strand: 1, index: 2 }],
  });
});

it.each([
  ['join(7..9,1..3,3^4)', 1],
  ['complement(join(7..9,1..3,3^4))', -1],
])('reopens the circular envelope with a gap before the origin for %s', (location, strand) => {
  const record = reopenGenBank(`LOCUS       x 12 bp DNA circular
FEATURES             Location/Qualifiers
     misc_feature    ${location}
ORIGIN
        1 agtgaaataaca
//
`);
  expect(record.features[0]).toMatchObject({ start: 6, end: 3 });
  const { text } = exportToGff3([record]);
  const reopened = attachGff(record, text);
  const feature = reopened.features.find(part => part.type === 'misc_feature')!;
  expect(feature).toMatchObject({
    start: 6, end: 3, strand, segments: [{ start: 6, end: 9 }, { start: 0, end: 3 }, { start: 3, end: 3 }],
  });
  expect(featureFocusTarget(reopened, feature)).toMatchObject({ start: 6, end: 3 });
  expect(featureSequenceViews(reopened, feature)).toMatchObject({ region: 'ATAACAAGT', regionLength: 9 });

  const [header, directive, landmark, high, low, site] = text.trimEnd().split('\n');
  for (const rows of [[low, site, high], [site, high, low]]) {
    const rotated = parseGFF3([header, directive, landmark, ...rows].join('\n'));
    expect(rotated.features.x[0]).toMatchObject({ start: 0, end: 9 });
  }
});

it.each([
  ['join(7..9,1..3,3^4)', 1],
  ['complement(join(7..9,1..3,3^4))', -1],
] as const)('uses linear extrema for the descending join %s', (location, strand) => {
  const record = reopenGenBank(genBank('AGTGAAATAACA', location, '', false, 'misc_feature'));
  const feature = record.features[0];
  const [selected] = sliceRecordsBySelection([record], 0, 12).records;
  const [edited] = saveEditedFeature([record], 'r', 0, {
    ...feature, locationString: undefined,
    segments: [{ start: 6, end: 9 }, { start: 0, end: 2 }, { start: 3, end: 3 }],
  });
  const gb = reopenGenBank(exportToGenBank([edited]).text);
  const gff = attachGff(record, exportToGff3([record]).text);
  const projected = reopenProject(record);
  for (const reopened of [record, selected, edited, gb, gff, projected]) {
    const annotation = reopened.features.find(part => part.type === 'misc_feature')!;
    expect.soft(annotation).toMatchObject({ start: 0, end: 9, strand });
    expect.soft(featureFocusTarget(reopened, annotation)).toMatchObject({ start: 0, end: 9 });
    expect.soft(featureSequenceViews(reopened, annotation)).toMatchObject({ region: 'AGTGAAATA', regionLength: 9 });
  }
});

it.each([
  { location: 'join(9..12,AB123.1:1..2,1..5)', strand: 1, segments: [{ start: 8, end: 12 }, { start: 0, end: 5 }] },
  { location: 'complement(join(9..12,AB123.1:1..2,12^1,1..5))', strand: -1,
    segments: [{ start: 8, end: 12 }, { start: 12, end: 12 }, { start: 0, end: 5 }] },
] as const)('recovers the local circular envelope in GFF3 for $location', ({ location, strand, segments }) => {
  const record = reopenGenBank(genBank('ATGAAACCCTAA', location, '', true, 'misc_feature'));
  const reopened = attachGff(record, exportToGff3([record]).text);
  expect(reopened.features.find(feature => feature.type === 'misc_feature')).toMatchObject({
    start: 8, end: 5, strand, segments,
    remoteParts: [{ accession: 'AB123.1', start: 0, end: 2, index: 1, strand }],
  });
});

it.each([
  { location: 'complement(join(AB123.1:1..2,complement(join(9..12,1..2))))', circular: true,
    span: { start: 8, end: 2 }, region: 'CTAAAT', ranks: [0, 1] },
  { location: 'complement(join(AB123.1:1..2,complement(join(complement(9..12),12^1,complement(1..2)))))', circular: true,
    span: { start: 8, end: 2 }, region: 'CTAAAT', ranks: [0, 1, 2] },
  { location: 'complement(join(complement(join(2..4,5^6,7..9))))', circular: false,
    span: { start: 1, end: 9 }, region: 'TGAAACCC', ranks: [0, 1, 2] },
  { location: 'complement(join(complement(join(complement(2..4),complement(7..9)))))', circular: false,
    span: { start: 1, end: 9 }, region: 'TGAAACCC', ranks: [0, 1] },
] as const)('keeps nested identity ranks for focus, region and project reopen in $location', ({ location, circular, span, region, ranks }) => {
  const record = reopenGenBank(genBank('ATGAAACCCTAA', location, '', circular, 'misc_feature'));
  const annotation = record.features[0];
  expect(featureFocusTarget(record, annotation)).toMatchObject(span);
  expect(featureSequenceViews(record, annotation)).toMatchObject({
    region, regionLength: region.length, regionStart: span.start, regionEnd: span.end,
  });
  expect(annotation.writtenOrder).toEqual(ranks);

  const legacy = { ...record, features: [{ ...annotation, writtenOrder: undefined }, ...record.features.slice(1)] };
  const reopened = reopenProject(legacy);
  const selected = sliceRecordsBySelection([reopened], 0, 12).records[0];
  expect(selected.features[0].writtenOrder).toEqual(ranks);
  expect(featureFocusTarget(selected, selected.features[0])).toMatchObject(span);

  const roundTrip = attachGff(record, exportToGff3([record]).text);
  const converted = roundTrip.features.find(feature => feature.type === 'misc_feature')!;
  expect(featureFocusTarget(roundTrip, converted)).toMatchObject(span);
});

const twoSources = (secondLocation: string) => `LOCUS       x 12 bp DNA linear
FEATURES             Location/Qualifiers
     source          1..6
                     /organism="synthetic construct"
                     /mol_type="genomic DNA"
     source          ${secondLocation}
                     /organism="synthetic construct"
                     /mol_type="genomic DNA"
ORIGIN
        1 atgaaaccctaa
//
`;
const openSourceEnd = '##gff-version 3\nx\t.\tregion\t1\t12\t.\t+\t.\tID=landmark;gbkey=Src;partial=true;end_range=12,.\n';

it('attaches an open landmark end to the second source endpoint', () => {
  const record = reopenGenBank(twoSources('7..12'));
  const { features, details } = parseGFF3(openSourceEnd);
  const attached = applyAnnotations([record], features, details);
  expect(attached.refusal).toBeUndefined();
  expect(attached.next[0].features.map(feature => feature.segments)).toEqual([
    [{ start: 0, end: 6 }], [{ start: 6, end: 12, partialEnd: true }],
  ]);
  expect(exportToGenBank(attached.next).text).toContain('     source          7..>12\n');
});

it('writes the open endpoint of the second source on the GFF3 landmark', () => {
  const record = reopenGenBank(twoSources('7..>12'));
  expect(exportToGff3([record]).text).toContain('partial=true;end_range=12,.');
});

it('reports a landmark bound that matches no source endpoint', () => {
  const record = reopenGenBank(twoSources('7..11'));
  const { features, details } = parseGFF3(openSourceEnd);
  const attached = applyAnnotations([record], features, details);
  expect(attached.refusal).toBeUndefined();
  expect(attached).toMatchObject({
    warnings: ['x: Open source region end at base 12 could not be kept because no source interval ends there.'],
  });
  expect(exportToGff3(attached.next).text).not.toContain('end_range=12,.');
});

it('refuses a circular Src landmark on the linear record of a descending GenBank join', () => {
  const record = reopenGenBank(`LOCUS       x 12 bp DNA linear
FEATURES             Location/Qualifiers
     source          1..12
                     /organism="synthetic construct"
                     /mol_type="genomic DNA"
     CDS             join(7..9,1..3)
ORIGIN
        1 ATGCCCTAATTT
//
`);
  const { features, details } = parseGFF3([
    '##gff-version 3',
    '##sequence-region x 1 12',
    'x\tRefSeq\tregion\t1\t12\t.\t+\t.\tID=x;gbkey=Src;Is_circular=true',
  ].join('\n'));
  const result = applyAnnotations([record], features, details);
  expect(result).toMatchObject({ totalAdded: 0, refusal: 'GFF3 landmark x declares Is_circular=true, but sequence x is linear.' });
  expect(result.next[0]).toBe(record);
  expect(result.next[0].features[1]).toMatchObject({ start: 0, end: 9, locationString: 'join(7..9,1..3)' });
});

it('refuses a plain circular landmark on a linear sequence and attaches it to a circular sequence', () => {
  const record: SeqRecord = { id: 'x', name: 'x', sequence: 'AGCTGACCTGAA', features: [] };
  const { features, details } = parseGFF3([
    '##gff-version 3',
    '##sequence-region x 1 12',
    'x\t.\tregion\t1\t12\t.\t+\t.\tID=x;Is_circular=true',
    'x\t.\tgene\t7\t15\t.\t+\t.\tID=wrap',
  ].join('\n'));
  const result = applyAnnotations([record], features, details);
  expect(result).toMatchObject({ totalAdded: 0, refusal: 'GFF3 landmark x declares Is_circular=true, but sequence x is linear.' });
  expect(result.next[0]).toBe(record);
  expect(result.next[0].features).toEqual([]);

  const circular = applyAnnotations([{ ...record, isCircular: true }], features, details);
  expect(circular.refusal).toBeUndefined();
  expect(circular.totalAdded).toBe(2);
  expect(featureSequenceViews(circular.next[0], circular.next[0].features[1])).toMatchObject({
    feature: 'CCTGAAAGC', region: 'CCTGAAAGC', regionLength: 9, regionStart: 6, regionEnd: 3,
  });
});

it('drops and counts a GFF3 Parent pointing to an omitted remote-only feature', () => {
  const record = reopenGenBank(genBank('ATGAAATAA', 'AB123.1:10..20', '', false, 'misc_feature'));
  record.features[0].metadata = { ID: 'remote' };
  record.features.push({ name: 'dependent', type: 'gene', start: 0, end: 9, strand: 1, metadata: { Parent: 'remote' } });

  const { text, report } = exportToGff3([record]);
  expect(text).not.toContain('Parent=');
  expect(report).toMatchObject({ droppedAttributes: 1, remoteOnlyOmitted: 1, gff3Written: { annotations: 1 } });
});

it('drops an ambiguous GFF3 relationship without provenance even if only one target is emitted', () => {
  const record = reopenGenBank(genBank('ATGAAATAA', 'AB123.1:10..20', '', false, 'misc_feature'));
  record.features[0].metadata = { ID: 'shared' };
  record.features.push(
    { name: 'target', type: 'gene', start: 0, end: 9, strand: 1, metadata: { ID: 'shared' } },
    { name: 'dependent', type: 'gene', start: 3, end: 6, strand: 1, metadata: { Derives_from: 'shared' } },
  );

  const { text, report } = exportToGff3([record]);
  expect(text).toContain('ID=r.2;Name=target');
  expect(text).toContain('ID=r.3;Name=dependent\n');
  expect(report).toMatchObject({ droppedAttributes: 1, remoteOnlyOmitted: 1, gff3Written: { annotations: 2 } });
});

it.each([
  ['Parent', 'ID=x.2;Name=Child;Parent=x.1'],
  ['Derives_from', 'ID=x.2;Name=Child;Derives_from=x.1'],
])('resolves %s before omitting a remote-only target and through project reopen', (key, linked) => {
  const record: SeqRecord = { id: 'x', name: 'x', sequence: 'ATGAAATAACCC', features: [] };
  const first = parseGFF3([
    '##gff-version 3',
    'x\tRefSeq\tgene\t1\t6\t.\t+\t.\tID=g;Name=Original;insdc_remote=1:AB123.1:1..3',
    `x\tRefSeq\tmRNA\t1\t6\t.\t+\t.\tID=t;${key}=g;Name=Child`,
  ].join('\n'));
  const fileA = applyAnnotations([record], first.features, first.details).next[0];
  const second = parseGFF3('##gff-version 3\nx\tRefSeq\tgene\t7\t12\t.\t+\t.\tID=g;Name=Unrelated');
  const attachSecond = (target: SeqRecord) => applyAnnotations([target], second.features, second.details).next[0];
  const withBoth = exportToGff3([reopenProject(attachSecond(fileA))]);
  expect.soft(withBoth.text).toContain(linked + '\n');
  expect.soft(withBoth.report.droppedAttributes).toBe(0);

  const [edited] = saveEditedFeature([fileA], 'x', 0, { ...fileA.features[0], locationString: undefined, segments: [] });
  const { text, report } = exportToGff3([reopenProject(attachSecond(edited))]);
  expect(text.trimEnd().split('\n').slice(-2)).toEqual([
    'x\tRefSeq\tmRNA\t1\t6\t.\t+\t.\tID=x.2;Name=Child',
    'x\tRefSeq\tgene\t7\t12\t.\t+\t.\tID=x.3;Name=Unrelated',
  ]);
  expect(report).toMatchObject({ droppedAttributes: 1, remoteOnlyOmitted: 1 });
});

it('resolves a GFF3 source relationship only for the source represented by the landmark row', () => {
  const record = reopenGenBank(twoSources('7..12'));
  record.features[0].metadata!.ID = 'first';
  record.features[1].metadata!.ID = 'second';
  record.features.push({
    name: 'dependent', type: 'gene', start: 6, end: 9, strand: 1,
    metadata: { Parent: 'second', Derives_from: 'first' },
  });

  const { text, report } = exportToGff3([record]);
  expect(text).not.toContain('Parent=');
  expect(text).toContain('Derives_from=x.0');
  expect(report.droppedAttributes).toBe(1);
});

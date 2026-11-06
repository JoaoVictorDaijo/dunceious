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
import { parseGenBank, exportToGenBank } from '@/src/core/genbank';
import { parseGFF3, exportToGff3 } from '@/src/core/formats/gff3';
import { saveEditedFeature } from '../featureManager';
import { conceptualTranslation } from '@/src/domain/bio/translation';
const gb = (second = '(pos:7..9,aa:Pyl)') => `LOCUS       r 15 bp DNA linear
ACCESSION   R
VERSION     R.1
FEATURES             Location/Qualifiers
     CDS             1..15
                     /gene="c"
                     /transl_except=(pos:R.1:4..6,aa:Sec)
                     /transl_except=${second}
                     /translation="MUOP"
ORIGIN
        1 atgtgatagccctaa
//
`;
it('preserves repeated GenBank assertions and supplied protein through export/reimport', () => {
  const { records, findings } = parseGenBank(gb());
  expect(findings.filter(f => f.tier === 'refuse')).toEqual([]);
  expect(records[0]).toMatchObject({ accession: 'R', version: 'R.1', features: [{ translationExceptions: ['(pos:R.1:4..6,aa:Sec)', '(pos:7..9,aa:Pyl)'], metadata: { translation: 'MUOP' } }] });
  expect(conceptualTranslation(records[0].features[0], records[0])).toMatchObject({ residues: 'MUOP' });
  const reread = parseGenBank(exportToGenBank(records).text).records[0];
  expect(reread.features.find(f => f.type === 'CDS')?.translationExceptions).toEqual(records[0].features[0].translationExceptions);
});
it('refuses malformed shape with CDS, literal and rule', () => {
  const result = parseGenBank(gb('(pos:7..8,aa:Pyl)'));
  expect(result.findings.filter(f => f.tier === 'refuse')).toEqual(expect.arrayContaining([expect.objectContaining({ message: expect.stringMatching(/CDS c.*7\.\.8.*incomplete codon/) })]));
});
it('GFF3 aggregates rows and repeated attributes, emits the canonical list once', () => {
  const features = parseGFF3('r\t.\tCDS\t1\t9\t.\t+\t0\tID=c;transl_except=(pos:4..6%2Caa:Sec)\nr\t.\tCDS\t13\t18\t.\t+\t0\tID=c;transl_except=(pos:7..9%2Caa:Pyl)').features.r;
  expect(features[0].translationExceptions).toEqual(['(pos:4..6,aa:Sec)', '(pos:7..9,aa:Pyl)']);
  const record = { id: 'r', name: 'r', sequence: 'ATGTGATAGNNNCCCTAA', features };
  expect(conceptualTranslation(features[0], record)).toMatchObject({ residues: 'MUOP' });
  const text = exportToGff3([record]).text;
  expect(text.match(/transl_except=/g)).toHaveLength(1);
  expect(parseGFF3(text).features.r[0].translationExceptions).toEqual(features[0].translationExceptions);
});
it('reframe removes inherited unusable break with a notice before returning saved protein', () => {
  const feature = { type: 'CDS', name: 'c', start: 0, end: 10, strand: 1 as const, segments: [{ start: 0, end: 10, partialStart: true as const }], metadata: { codon_start: '2', translation: 'MU', _translationSource: 'imported' }, translationExceptions: ['(pos:5..7,aa:Sec)'] };
  const record = { id: 'r', name: 'r', sequence: 'AATGTGATAA', features: [feature] };
  const notices: string[] = [];
  const saved = saveEditedFeature([record], 'r', 0, { ...feature, metadata: { ...feature.metadata, codon_start: '1' } }, message => notices.push(message));
  expect(notices.join(' ')).toMatch(/5\.\.7.*off-frame/);
  expect(saved[0].features[0]).toMatchObject({ translationExceptions: [], metadata: { translation: 'NVI', _translationSource: 'computed' } });
  expect(record.features[0].translationExceptions).toEqual(['(pos:5..7,aa:Sec)']);
});
it('defensive writer refuses malformed assertion without creating a forged qualifier', () => {
  const records = parseGenBank(gb()).records;
  records[0].features[0].translationExceptions = ['garbage'];
  expect(() => exportToGenBank(records)).toThrow(/CDS c.*garbage.*expected/);
});

it('slices code breaks on copies and reports the clipped CDS and each lost occurrence', async () => {
  const { sliceRecordsBySelection } = await import('@/src/domain/bio/intervals');
  const record = parseGenBank(gb()).records[0];
  const full = sliceRecordsBySelection([record], 0, 15);
  expect(full.losses).toEqual([]);
  expect(full.records[0].features[0].translationExceptions).toEqual(['(pos:4..6,aa:Sec)', '(pos:7..9,aa:Pyl)']);
  const clipped = sliceRecordsBySelection([record], 0, 5);
  expect(clipped.records[0].features[0]).toMatchObject({ translationExceptions: [], segments: [{ start: 0, end: 5, partialEnd: true }] });
  expect(clipped.records[0].features[0].metadata?.translation).toBeUndefined();
  expect(clipped.losses).toMatchObject([{ record: 'r', feature: 'c' }, { occurrence: 0, raw: '(pos:R.1:4..6,aa:Sec)' }, { occurrence: 1, raw: '(pos:7..9,aa:Pyl)' }]);
  expect(record.features[0].metadata?.translation).toBe('MUOP');
  expect(record.features[0].translationExceptions).toEqual(['(pos:R.1:4..6,aa:Sec)', '(pos:7..9,aa:Pyl)']);
});
it('ordinary text quotes and slash fragments round-trip with bounded safe continuations', () => {
  const records = parseGenBank(gb()).records;
  const note = 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda say "Sec" /translation="FAKE"';
  records[0].features[0].metadata!.note = note;
  const text = exportToGenBank(records).text;
  expect(text.split('\n').filter(line => line.startsWith('                     ')).every(line => line.length <= 80)).toBe(true);
  const cds = parseGenBank(text).records[0].features.find(f => f.type === 'CDS')!;
  expect(cds.metadata?.note).toBe(note);
  expect(cds.metadata?.translation).toBe('MUOP');
});

it('real worker refuses malformed code breaks before success and preserves exact identities on allowed input', async () => {
  const { handleBioMessage } = await import('@/src/workers/handlers/bio');
  const allowed = handleBioMessage({ type: 'PARSE_GENBANK', filename: 'c.gb', content: gb() });
  expect(allowed.type).toBe('PARSE_SUCCESS');
  if (allowed.type !== 'PARSE_SUCCESS') throw new Error('import refused');
  expect(allowed.records[0]).toMatchObject({ accession: 'R', version: 'R.1' });
  expect(JSON.parse(allowed.records[0].features[0].metadata!._translationCheck)).toMatchObject({ residues: 'MUOP', comparison: { differing: [] } });
  const denied = handleBioMessage({ type: 'PARSE_GENBANK', filename: 'c.gb', content: gb('(pos:7..8,aa:Pyl)') + gb() });
  expect(denied).toMatchObject({ type: 'PARSE_REFUSED', findings: expect.arrayContaining([expect.objectContaining({ tier: 'refuse', message: expect.stringMatching(/CDS c.*7\.\.8.*incomplete codon/) })]) });
});
it('format-2 round-trip strips forged caches and rechecks the adjusted product', async () => {
  const { serializeProject, parseProject } = await import('../projectFile');
  const records = parseGenBank(gb()).records;
  records[0].features[0].metadata!._translationCheck = '{"status":"ok","residues":"FAKE"}';
  const text = serializeProject({ records, featureColors: {}, showAnnotations: true, showTranslation: true, showConservation: false });
  expect(text).not.toContain('_translationCheck');
  const loaded = parseProject(text);
  expect(loaded.ok).toBe(true);
  if (!loaded.ok) throw new Error('project refused');
  expect(loaded.project.records[0].features[0]).toMatchObject({ translationExceptions: ['(pos:R.1:4..6,aa:Sec)', '(pos:7..9,aa:Pyl)'], metadata: { translation: 'MUOP', _translationSource: 'imported' } });
  expect(JSON.parse(loaded.project.records[0].features[0].metadata!._translationCheck)).toMatchObject({ residues: 'MUOP' });
});
it('reverse invalidation drops explicit contrary orientation; inherited minus remains usable', () => {
  const original = { type: 'CDS', name: 'c', start: 0, end: 9, strand: -1 as const, segments: [{ start: 0, end: 9 }], translationExceptions: ['(pos:complement(1..3),aa:Sec)'], metadata: { translation: 'LFU', _translationSource: 'imported' } };
  const record = { id: 'r', name: 'r', sequence: 'ATGAAATAA', features: [original] };
  const notices: string[] = [];
  const saved = saveEditedFeature([record], 'r', 0, { ...original, strand: 1 }, message => notices.push(message));
  expect(saved[0].features[0]).toMatchObject({ translationExceptions: [], metadata: { translation: 'MK', _translationSource: 'computed' } });
  expect(notices.join(' ')).toMatch(/complement.*orientation.*removed before Save/);
});

it('attachment drops unusable breaks with visible notices while /exception suppresses only mismatch', async () => {
  const { checkTranslation, translationWarning } = await import('@/src/domain/bio/translation');
  const record = parseGenBank(gb()).records[0];
  const feature = { ...record.features[0], translationExceptions: ['(pos:40..42,aa:Sec)', '(pos:4..6,aa:Sec)', '(pos:7..9,aa:Pyl)'], metadata: { ...record.features[0].metadata, exception: 'RNA editing' } };
  const checked = checkTranslation(feature, record);
  expect(checked.translationExceptions).toEqual(['(pos:4..6,aa:Sec)', '(pos:7..9,aa:Pyl)']);
  expect(translationWarning([{ ...record, features: [checked] }])).toMatch(/CDS c.*40\.\.42.*outside CDS/);
  expect(checked.metadata?.translation).toBe('MUOP');
});
it('note-only OTHER refresh preserves the supplied protein and refreshes the diagnostic', () => {
  const feature = { type: 'CDS', name: 'c', start: 0, end: 9, strand: 1 as const, segments: [{ start: 0, end: 9 }], translationExceptions: ['(pos:4..6,aa:OTHER)'], metadata: { translation: 'MW', _translationSource: 'imported' } };
  const record = { id: 'r', name: 'r', sequence: 'ATGTGATAA', features: [feature] };
  const saved = saveEditedFeature([record], 'r', 0, { ...feature, metadata: { ...feature.metadata, note: 'unusual amino acid' } });
  expect(saved[0].features[0].metadata).toMatchObject({ translation: 'MW', _translationSource: 'imported' });
  expect(JSON.parse(saved[0].features[0].metadata!._translationCheck)).toMatchObject({ residues: 'MX', comparison: { differing: [] } });
  expect(JSON.parse(saved[0].features[0].metadata!._translationCheck).exceptions[0].warnings).toBeUndefined();
});

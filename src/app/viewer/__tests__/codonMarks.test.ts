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


import { expect, it, vi } from 'vitest';
import { cachedCodonMarks, codonMarks } from '../codonMarks';
import { sliceRecordsBySelection } from '@/src/domain/bio/intervals';
import { parseProject, serializeProject } from '@/src/app/logic/projectFile';
import { checkTranslation, checkedTranslation, conceptualTranslation } from '@/src/domain/bio/translation';
import type { BioFeature } from '@/src/domain/bio/types';

it.each([
 ['ATGAGATAA', 'MK', undefined, ['ordinary', 'difference', 'terminal']],
 ['ATGTGAGCTTAA', 'MXA', undefined, ['ordinary', 'hidden-stop', 'ordinary', 'terminal']],
 ['ATGTGAGCTTAA', 'M*A', undefined, ['ordinary', 'early-stop', 'ordinary', 'terminal']],
 ['GTGAAATAA', 'XK', undefined, ['substitution', 'ordinary', 'terminal']],
 ['ATGTGAGCTTAA', 'MUA', '(pos:4..6,aa:Sec)', ['ordinary', 'substitution', 'ordinary', 'terminal']],
 ['ATGTGAGCTTAA', 'MWA', '(pos:4..6,aa:Sec)', ['ordinary', 'difference', 'ordinary', 'terminal']],
 ['ATGTA', 'M', '(pos:4..5,aa:TERM)', ['ordinary', 'terminal']],
 ['ATGGC', 'MV', undefined, ['ordinary', 'difference']],
 ['ATGAAATAA', 'M', undefined, ['ordinary', 'terminal']],
] as const)('projects hand-derived gc.prt marks for %s / %s', (sequence, translation, raw, states) => {
 const feature: BioFeature = { type: 'CDS', name: 'c', start: 0, end: sequence.length, strand: 1,
   segments: [{ start: 0, end: sequence.length }], metadata: { translation, transl_table: '11' }, translationExceptions: raw ? [raw] : undefined };
 const marks = codonMarks(feature, { sequence, moleculeType: 'dna' });
 expect(marks.cells.map(c => c.state)).toEqual(states);
 expect(marks.cells.map(c => c.residue).join('')).toBe(translation.length < 2 && sequence === 'ATGAAATAA' ? 'M_' : sequence === 'ATGTA' ? 'M_' : translation + (sequence.endsWith('TAA') ? '_' : ''));
 expect(marks.cells.every(c => c.description.includes('strand, codon'))).toBe(true);
 if (raw) expect(marks.cells[1].description).toContain(raw);
});

it('keeps compatible ambiguity and end uncertainty ordinary, and gates protein records', () => {
 const feature: BioFeature = { type: 'CDS', name: '<curated>', start: 0, end: 6, strand: 1,
   segments: [{ start: 0, end: 6 }], metadata: { translation: 'MY', transl_table: '28' } };
 const view = codonMarks(feature, { sequence: 'ATGTAN', moleculeType: 'dna' });
 expect(view.cells[1].state).toBe('ordinary');
 expect(view.cells[1].description).toContain('End uncertain: TAN');
 expect(view.cells[1].description).toContain('Y (Tyr)');
 expect(view.comparison?.differing).toEqual([]);
 expect(codonMarks(feature, { sequence: 'ATGTAN', moleculeType: 'protein' }).cells).toEqual([]);
});
it('defensively explains malformed direct inputs that strict imports refuse', () => {
 const feature: BioFeature = { type: 'CDS', name: 'c', start: 0, end: 9, strand: 1,
   segments: [{ start: 0, end: 9 }], metadata: { translation: 'M', transl_table: '11' },
   translationExceptions: ['(pos:4..5,aa:Sec)'] };
 const view = codonMarks(feature, { sequence: 'ATGAAATAA', moleculeType: 'dna' });
 expect(view.cells.map(c => [c.residue, c.state])).toEqual([['M', 'unverified']]);
 expect(view.cells[0].description).toContain('Cannot check against DNA');
 expect(view.comparison).toBeUndefined();
});
it('puts reverse stop evidence in biological order and lists only actual fragment bases', () => {
 const feature: BioFeature = { type: 'CDS', name: 'reverse', start: 0, end: 9, strand: -1,
   segments: [{ start: 0, end: 9 }], metadata: { translation: 'MW', transl_table: '11' } };
 const view = codonMarks(feature, { sequence: 'TTATCACAT', moleculeType: 'dna' });
 expect(view.cells[1]).toMatchObject({ indices: [5, 4, 3], residue: 'W', state: 'hidden-stop' });
 expect(view.cells[1].description).toContain('reverse strand, codon 2, bases 6, 5, 4');
});

it('reuses biological evidence across display-only transposition with the same source and metadata', () => {
 const metadata = { translation: 'MK', transl_table: '11' };
 const feature: BioFeature = { type: 'CDS', name: 'c', start: 0, end: 9, strand: 1, segments: [{ start: 0, end: 9 }], metadata };
 const record = { sequence: 'ATGAGATAA', moleculeType: 'dna' as const };
 const original = cachedCodonMarks(feature, record);
 const mapped: BioFeature = { ...feature, start: 2, end: 14, segments: [{ start: 2, end: 14 }], biological: { start: 0, end: 9, strand: 1, segments: [{ start: 0, end: 9 }] } };
 expect(cachedCodonMarks(mapped, record)).toBe(original);
 expect(original.cells[1]).toMatchObject({ residue: 'K', state: 'difference', indices: [3, 4, 5] });
 const edited = { ...mapped, metadata: { ...metadata, translation: 'MR' } };
 expect(cachedCodonMarks(edited, record).cells[1].state).toBe('ordinary');
});

it.each([
 ['conflicts', ['(pos:4..6,aa:Sec)', '(pos:4..6,aa:Pyl)'], 'conflicting residues'],
 ['foreign identity', ['(pos:X.1:4..6,aa:Sec)'], 'accession'],
] as const)('uses DNA after normalized %s drops, keeping raw notice evidence', (_kind, entries, reason) => {
 const record = { sequence: 'ATGTGATAA', moleculeType: 'dna' as const, accession: 'R', version: 'R.1' };
 const f: BioFeature = { type: 'CDS', name: 'c', start: 0, end: 9, strand: 1, segments: [{ start: 0, end: 9 }],
   metadata: { translation: 'MU', transl_table: '11' }, translationExceptions: [...entries] };
 const normalized = checkTranslation(f, record);
 expect(normalized.translationExceptions).toEqual([]);
 const view = codonMarks(normalized, record);
 expect(view.cells.map(c => [c.residue, c.state])).toEqual([['M', 'ordinary'], ['U', 'hidden-stop'], ['_', 'terminal']]);
 expect(view.comparison?.differing).toEqual([1]);
 if (_kind === 'conflicts') {
   for (const raw of entries) expect(view.cells[1].description).toContain(raw);
   expect(view.cells[1].description).toContain(reason);
 } else {
   expect(view.cells[1].description).not.toContain(entries[0]);
 }
 expect(view.summary).toContain(`${entries.length} dropped translation exception`);
 expect(view.summary).toContain('Complete diagnostics in feature details');
 expect(checkedTranslation(normalized, record).exceptions?.every(e => e.status === 'dropped')).toBe(true);
});
it.each([undefined, 'MU'])('keeps mapped invalid-code exceptions unapplied in the explicit assumed view; stored=%s', translation => {
 const record = { sequence: 'ATGTGATAA', moleculeType: 'dna' as const };
 const raw = '(pos:4..6,aa:Sec)';
 const f: BioFeature = { type: 'CDS', name: 'c', start: 0, end: 9, strand: 1, segments: [{ start: 0, end: 9 }],
   metadata: { transl_table: '999', ...(translation ? { translation } : {}) }, translationExceptions: [raw] };
 const normalized = checkTranslation(f, record);
 expect(checkedTranslation(normalized, record)).toMatchObject({ status: 'unavailable', reason: 'invalid-code',
   exceptions: [{ raw, status: 'deferred', bases: [3, 4, 5], codonIndex: 1, possible: 'U' }] });
 const view = codonMarks(normalized, record);
 expect(view.assumed?.residues).toBe('M**');
 expect(view.summary).toContain('1 deferred translation exception');
 expect(view.exceptionDescriptions.get(1)?.text).toContain('was not applied');
 expect(view.exceptionDescriptions.get(1)?.text).toContain(raw);
 expect(view.cells.map(c => [c.residue, c.state])).toEqual(translation ? [['M', 'unverified'], ['U', 'unverified']] : []);
 expect(view.comparison).toBeUndefined();
});

it('blocks malformed and unmapped deferrals from an invalid-code assumed view', () => {
 const f: BioFeature = { type: 'CDS', name: 'c', start: 0, end: 9, strand: 1, segments: [{ start: 0, end: 9 }], metadata: { transl_table: '999' } };
 for (const status of ['malformed', 'deferred'] as const) {
   const view = codonMarks(f, { sequence: 'ATGTGATAA', moleculeType: 'dna' }, { status: 'unavailable', reason: 'invalid-code',
     exceptions: [{ feature: 'c', occurrence: 0, raw: '(pos:4..6,aa:Sec)', status, reason: 'geometry unavailable' }] });
   expect(view.assumed).toBeUndefined();
   expect(view.cells).toEqual([]);
   expect(view.comparison).toBeUndefined();
 }
});

it('projects the recomputed clipped JSON product after reopen without source exceptions or stale full protein', () => {
 const source = { id: 'r', name: 'r', sequence: 'N'.repeat(100) + 'ATGTGATAGCCCTAA', moleculeType: 'dna' as const,
   features: [{ type: 'CDS', name: 'c', start: 100, end: 115, strand: 1 as const, segments: [{ start: 100, end: 115 }],
     metadata: { translation: 'MUOP', _translationSource: 'imported', transl_table: '11' },
     translationExceptions: ['(pos:104..106,aa:Sec)', '(pos:107..109,aa:Pyl)'] }] };
 const snapshot = JSON.stringify(source);
 const sliced = sliceRecordsBySelection([source], 100, 105);
 expect(sliced.losses.filter(loss => loss.occurrence !== undefined).map(loss => loss.raw)).toEqual(['(pos:104..106,aa:Sec)', '(pos:107..109,aa:Pyl)']);
 const loaded = parseProject(serializeProject({ records: sliced.records, featureColors: {}, showAnnotations: true, showTranslation: true, showConservation: false }));
 expect(loaded.ok).toBe(true);
 if (!loaded.ok) throw new Error(loaded.message);
 const record = loaded.project.records[0];
 const f = record.features[0];
 expect(record.sequence).toBe('ATGTG');
 expect(f.metadata?.translation).toBe('M');
 expect(Number(f.metadata?.codon_start ?? '1')).toBe(1);
 expect(f.translationExceptions).toEqual([]);
 const view = codonMarks(f, record);
 expect(view.cells.map(c => [c.residue, c.state])).toEqual([['M', 'ordinary']]);
 expect(view.comparison).toEqual({ differing: [], storedExtra: '', storedShortBy: 0 });
 expect(JSON.stringify(source)).toBe(snapshot);
});

it('normalizes a long stored protein once and keeps dense-stop tooltips local and compact', () => {
 const stops = 1000;
 const record = { sequence: 'ATG' + 'TGA'.repeat(stops) + 'TAA', moleculeType: 'dna' as const };
 const supplied = 'M ' + 'X '.repeat(stops);
 const f: BioFeature = { type: 'CDS', name: 'dense', start: 0, end: record.sequence.length, strand: 1,
   segments: [{ start: 0, end: record.sequence.length }], metadata: { translation: supplied, transl_table: '11' } };
 const evidence = conceptualTranslation(f, record);
 const replace = vi.spyOn(String.prototype, 'replace');
 const includes = vi.spyOn(Array.prototype, 'includes');
 try {
   const view = codonMarks(f, record, evidence);
   const scans = replace.mock.calls.filter(([pattern], i) => String(pattern) === '/\\s/g' && String(replace.mock.contexts[i]) === supplied).length;
   const membershipScans = includes.mock.contexts.filter(context => Array.isArray(context) && context.length === stops).length;
   expect(scans).toBe(1);
   expect(membershipScans).toBe(0);
   expect(view.summary).toContain('1000 internal stops');
   expect(view.summary.length).toBeLessThan(500);
   expect(view.cells).toHaveLength(1002);
   expect(view.cells.every(c => c.description.length < 1400)).toBe(true);
   expect(view.cells[0].description).not.toContain('Internal stop at codon 1001');
   expect(view.cells[1000]).toMatchObject({ residue: 'X', state: 'hidden-stop' });
 } finally { replace.mockRestore(); includes.mockRestore(); }
});
it('indexes exception membership once and explicitly bounds repeated local diagnostic previews', () => {
 const record = { sequence: 'ATGTGAGCTTAA', moleculeType: 'dna' as const };
 const raw = `(pos:${' '.repeat(2000)}4..6,aa:Sec)`;
 const f: BioFeature = { type: 'CDS', name: 'duplicates', start: 0, end: 12, strand: 1, segments: [{ start: 0, end: 12 }],
   metadata: { translation: 'MUA', transl_table: '11' }, translationExceptions: Array(256).fill(raw) };
 const evidence = conceptualTranslation(f, record);
 const filter = vi.spyOn(Array.prototype, 'filter');
 try {
   const view = codonMarks(f, record, evidence);
   expect(filter.mock.contexts.filter(context => context === evidence.exceptions).length).toBeLessThanOrEqual(1);
   expect(view.cells[1].description).toContain('2 of 256');
   expect(view.cells[1].description).toContain('feature details');
   expect(view.cells[1].description).toContain('preview; complete value');
   expect(view.cells[1].description).not.toContain(raw);
   expect(view.cells[1].description.length).toBeLessThan(1400);
   expect(view.cells[0].description).not.toContain(raw);
   expect(view.cells[1]).toMatchObject({ residue: 'U', state: 'substitution' });
 } finally { filter.mockRestore(); }
});

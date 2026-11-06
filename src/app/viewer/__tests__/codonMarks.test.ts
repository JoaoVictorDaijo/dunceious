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
import { cachedCodonMarks, codonMarks } from '../codonMarks';
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
it('explains unusable exceptions without verified marks or a computed tail', () => {
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

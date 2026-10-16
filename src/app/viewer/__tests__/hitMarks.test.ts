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

import { describe, it, expect } from 'vitest';
import { hitMarks, visibleMarks, SEARCH_QUERY_LANE_HEIGHT } from '../hitMarks';
import { computeRecordLayouts } from '../layout';
import type { CompletedSearch } from '../../logic/searchState';
import type { SeqRecord, SearchResult } from '@/src/domain/bio/types';

const record = (sequence: string, moleculeType: SeqRecord['moleculeType'] = 'dna'): SeqRecord =>
  ({ id: 'r', name: 'r', sequence, features: [], moleculeType });
const hit = (cigar: string, end: number, strand: 1 | -1 = 1): SearchResult =>
  ({ sequence: '', recordId: 'r', start: 0, end, strand, cigar });
const search = (query: string): CompletedSearch => ({ query, mode: 'whole', alphabet: 'nucleotide', options: { minIdentity: 80, strand: 'both', maxResults: 100 } });

describe('forward column layout', () => {
  it('maps differences and insertions across alignment gaps without marking the gap', () => {
    const r = record('AC-GT');
    const h = hit('1=1X1I1D1=', 5);
    const s = search('ATAT');
    const marks = hitMarks(h, r, s);
    expect(marks.marks).toEqual([
      { column: 0, cls: 'identical', recordBase: 'A', queryLetter: 'A', recordAmbiguity: false },
      { column: 1, cls: 'mismatch', recordBase: 'C', queryLetter: 'T', recordAmbiguity: false },
      { column: 3, cls: 'deletion', recordBase: 'G', queryLetter: null, recordAmbiguity: false },
      { column: 4, cls: 'identical', recordBase: 'T', queryLetter: 'T', recordAmbiguity: false },
    ]);
    expect(marks.insertions).toEqual([{ afterColumn: 1, bases: 'A', flankStart: 2, flankEnd: 3 }]);
    expect(hitMarks(h, r, s)).toBe(marks);
    expect(visibleMarks([h], h, r, s, 3, 5).marks.map(m => m.column)).toEqual([3, 4]);
  });
  it('keeps T and U distinct on a reverse mixed-alphabet record', () => {
    expect(hitMarks(hit('2=', 2, -1), record('TU', 'rna'), search('AA')).marks.map(m => [m.cls, m.queryLetter]))
      .toEqual([['identical', 'T'], ['identical', 'U']]);
  });
  it('complements T-written RNA in its own alphabet and reverses query placement', () => {
    expect(hitMarks(hit('2=', 2, -1), record('TA', 'rna'), search('TA')).marks.map(m => m.queryLetter)).toEqual(['T', 'A']);
  });
  it('lets the active hit win overlaps, otherwise uses results order', () => {
    const r = record('AC'); const first = hit('2=', 2); const second = hit('2X', 2, -1);
    expect(visibleMarks([first, second], second, r, search('AC'), 0, 2).marks.map(m => m.queryLetter)).toEqual(['G', 'T']);
    expect(visibleMarks([first, second], undefined, r, search('AC'), 0, 2).marks.map(m => m.queryLetter)).toEqual(['A', 'C']);
  });
  it('reserves the query lane only on records with hits at every zoom', () => {
    const r = record('AC');
    const opts = { showAnnotations: false, showTracks: false, translationVisible: false };
    const plain = computeRecordLayouts([r], opts)[0];
    const marked = computeRecordLayouts([r], { ...opts, searchResultsByRecord: { r: [hit('2=', 2)] } })[0];
    expect(marked.height - plain.height).toBe(SEARCH_QUERY_LANE_HEIGHT);
    expect(marked.seqBaseY - plain.seqBaseY).toBe(SEARCH_QUERY_LANE_HEIGHT);
  });
  it('draws nothing for the empty IUPAC path', () => {
    expect(hitMarks(hit('', 0), record('AC'), { ...search('--'), mode: 'iupac' })).toEqual({ marks: [], insertions: [] });
  });
});

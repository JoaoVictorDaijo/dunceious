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
import { cigarSpans } from '@/src/domain/bio/cigar';
import type { SearchableRecord } from '@/src/domain/bio/types';
import { runExactSearch } from '../exact';
import { runFuzzySearch } from '../fuzzy';
import { iupacPath } from '../editPath';
import { ungappedSpan } from '../hitPaths';
import { hitColumns, hitCounts } from '../hitColumns';

describe('paths on every hit', () => {
  it('writes identity rather than IUPAC acceptance into the path', () => {
    expect(iupacPath('aNRt', 'ANAu')).toBe('2=2X');
  });
  const cases: Array<{ query: string; record: SearchableRecord; protein?: boolean }> = [
    { query: 'ACGTAC', record: { id: 'r', sequence: 'GGACGTTCGGGTACGTCC' } },
    { query: 'ACGTAC', record: { id: 'r', sequence: 'unused', alignedSequence: '--GGAC-GTTC-GGGTAC-GTCC--' } },
    { query: 'acgTac', record: { id: 'r', sequence: '--ggac-gttc-gggtac-gtcc--' } },
    { query: 'ACGTAC', record: { id: 'r', sequence: 'AC*TA1GGGTACGT' } },
    { query: 'ACNAC', record: { id: 'r', sequence: 'ACNACGTGNT' } },
    { query: 'NBXAC', record: { id: 'r', sequence: 'NDAACNNXAC', moleculeType: 'protein' }, protein: true },
    { query: 'AUAC', record: { id: 'r', sequence: '--A-UAC-GUAU--', moleculeType: 'rna' } },
    { query: 'TAAC', record: { id: 'r', sequence: '--T-AAC-GTTA--', moleculeType: 'rna' } },
  ];
  it.each(cases)('validates all paths for $query in $record.sequence', ({ query, record, protein = false }) => {
    for (const mode of ['whole', 'iupac'] as const) {
      const hits = mode === 'whole'
        ? runFuzzySearch(query, [record], protein, 'both', record.moleculeType, 60, 100)
        : runExactSearch(query, [record], protein, 'both', record.moleculeType);
      if (mode === 'whole') expect(hits.length).toBeGreaterThan(0);
      for (const hit of hits) {
        const span = ungappedSpan(hit, record, record.moleculeType);
        expect(cigarSpans(hit.cigar!)).toEqual({ query: query.length, record: span.length });
        const columns = hitColumns({ cigar: hit.cigar!, query, span, mode, alphabet: protein ? 'protein' : 'nucleotide' });
        for (const col of columns) {
          if (col.op === '=' || col.op === 'X') {
            expect(col.op).toBe(col.queryBase!.toUpperCase() === col.recordBase!.toUpperCase() ? '=' : 'X');
          }
        }
        if (mode === 'whole') {
          const counts = hitCounts(columns);
          expect(counts.mismatch + counts.insertion + counts.deletion).toBe(hit.edits);
        }
      }
    }
  });
  it.each([
    ['NR', '--a-g--', '2X'], ['acGT', '--aC-gT--', '4='],
    ['AUG', '--A-Ug--', '3='], ['TA', '--T-A--', '2='],
  ])('builds an exact path for %s through record gaps', (query, sequence, cigar) => {
    const record = { id: 'r', sequence };
    const hits = runExactSearch(query, [record], false, 'fwd');
    expect(hits).toHaveLength(1);
    expect(hits[0].cigar).toBe(cigar);
    expect(cigarSpans(hits[0].cigar)).toEqual({ query: query.length, record: query.length });
  });
  it('keeps a hand-worked reverse path through aligned gaps in query orientation', () => {
    const record = { id: 'r', sequence: 'GTTCGT', alignedSequence: '--GT-TCG-T--' };
    const hits = runFuzzySearch('ACGAAC', [record], false, 'rev', 'dna', 100, 100);
    expect(hits).toMatchObject([{ start: 2, end: 10, strand: -1, cigar: '6=', edits: 0 }]);
    expect(ungappedSpan(hits[0], record, 'dna')).toBe('ACGAAC');
  });
  it('uses the whole record alphabet for reverse slices of mixed TU RNA', () => {
    const record = { id: 'r', sequence: 'TU', moleculeType: 'rna' as const };
    const hit = { start: 0, end: 1, strand: -1 as const, sequence: 'T', recordId: 'r', cigar: '1=' };
    expect(ungappedSpan(hit, record, 'rna')).toBe('A');
    expect(ungappedSpan({ ...hit, start: 1, end: 2 }, record, 'rna')).toBe('A');
  });
  it('does not collapse T-written RNA to a U alphabet', () => {
    const record = { id: 'r', sequence: '--TA--', moleculeType: 'rna' as const };
    const hits = runExactSearch('TA', [record], false, 'rev', 'rna');
    expect(hits).toMatchObject([{ cigar: '2=', strand: -1 }]);
    expect(ungappedSpan(hits[0], record, 'rna')).toBe('TA');
  });
});

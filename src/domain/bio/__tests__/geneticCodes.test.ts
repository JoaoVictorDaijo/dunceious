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

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { detectEarlyStop, featureTranslTable, isNcbiGeneticCode, translateSequence } from '@/src/domain/bio/sequence';

// Independent oracle: Biopython's NCBI codon tables, not Dunceious's own data.
const oracle = JSON.parse(
  readFileSync(new URL('./fixtures/ncbi-genetic-codes.biopython.json', import.meta.url), 'utf8'),
) as { tables: Record<string, { name: string; codons: Record<string, string> }> };

const ids = Object.keys(oracle.tables).map(Number);

describe('NCBI genetic codes', () => {
  it('knows exactly the 27 NCBI tables', () => {
    expect(ids).toHaveLength(27);
    for (const id of ids) expect(isNcbiGeneticCode(id)).toBe(true);
    for (const id of [0, 7, 8, 17, 18, 19, 20, 34, NaN]) expect(isNcbiGeneticCode(id)).toBe(false);
  });

  it.each(ids)('translates every codon of table %i like the NCBI table', id => {
    for (const [codon, residue] of Object.entries(oracle.tables[id].codons)) {
      expect(translateSequence(codon, id), `table ${id} ${codon}`).toBe(residue);
      expect(translateSequence(codon.replace(/T/g, 'U'), id), `table ${id} RNA ${codon}`).toBe(residue);
    }
  });

  it('reads ciliate TAA/TAG as glutamine, not stops (table 6)', () => {
    expect(translateSequence('ATGTAATAGTGA', 6)).toBe('MQQ_');
    expect(detectEarlyStop('ATGTAATAGTGA', 6)).toBe(false);
  });

  it('claims no residue and no stop under an id that is not an NCBI code', () => {
    expect(translateSequence('ATGTAA', 7)).toBe('??');
    expect(translateSequence('ATGTAA', NaN)).toBe('??');
    expect(detectEarlyStop('TAATAATAA', 7)).toBe(false);
  });
});

describe('featureTranslTable', () => {
  it('defaults to the standard code when the qualifier is absent', () => {
    expect(featureTranslTable({})).toBe(1);
    expect(featureTranslTable({ metadata: {} })).toBe(1);
  });
  it('reads the integer value', () => {
    expect(featureTranslTable({ metadata: { transl_table: '11' } })).toBe(11);
    expect(featureTranslTable({ metadata: { transl_table: ' 4 ' } })).toBe(4);
  });
  it('keeps an invalid value invalid instead of falling back to table 1', () => {
    expect(featureTranslTable({ metadata: { transl_table: 'abc' } })).toBeNaN();
    expect(featureTranslTable({ metadata: { transl_table: '11a' } })).toBeNaN();
    expect(isNcbiGeneticCode(featureTranslTable({ metadata: { transl_table: '7' } }))).toBe(false);
  });
});

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

import { describe, expect, it } from 'vitest';
import { initiatorResidue, translateSequence } from '../index';

describe('initiatorResidue', () => {
  // Literal gc.prt 4.6 sncbieaa rows, in TCAG order, are independent of the generated tables.
  it.each([
    [1, '---M------**--*----M---------------M----------------------------'],
    [11, '---M------**--*----M------------MMMM---------------M------------'],
  ] as const)('matches the literal Starts row for table %i', (table, starts) => {
    const bases = 'TCAG';
    for (let index = 0; index < 64; index++) {
      const codon = bases[Math.floor(index / 16)] + bases[Math.floor(index / 4) % 4] + bases[index % 4];
      expect(initiatorResidue(codon, table), codon).toBe(starts[index] === 'M' ? 'M' : undefined);
    }
  });

  it('claims no initiator for ambiguity, incomplete triplets or unknown tables', () => {
    for (const codon of ['NTG', 'ATN', '', 'AT', 'ATGG']) expect(initiatorResidue(codon, 11)).toBeUndefined();
    expect(initiatorResidue('ATG', 999)).toBeUndefined();
  });

  it('normalizes RNA and case without changing context-free translation', () => {
    expect(initiatorResidue('gug', 11)).toBe('M');
    expect(translateSequence('GTG', 11)).toBe('V');
    expect(translateSequence('TTGCTGATA', 11)).toBe('LLI');
  });
});

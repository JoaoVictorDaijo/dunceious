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
import { conceptualTranslation } from '../translation';
import type { BioFeature } from '../types';

it.each([
  ['GTGAAATAA', undefined, 'MK', ['V', 'K', '*'], ['M', 'K', '*'], [6, 7, 8]],
  ['ATGTGA', '(pos:4..6,aa:Sec)', 'MU', ['M', '*'], ['M', '*'], undefined],
  ['ATGTA', '(pos:4..5,aa:TERM)', 'M', ['M', '*Y'], ['M', '*Y'], [3, 4]],
  ['ATGGC', undefined, 'MA', ['M', 'A'], ['M', 'A'], undefined],
] as const)('preserves literal PR2 product and records provenance for %s', (sequence, raw, residues, ordinary, contextual, terminal) => {
  const feature: BioFeature = { name: 'c', type: 'CDS', start: 0, end: sequence.length, strand: 1,
    segments: [{ start: 0, end: sequence.length }], metadata: { transl_table: '11' },
    translationExceptions: raw ? [raw] : undefined };
  const result = conceptualTranslation(feature, { sequence, moleculeType: 'dna' });
  expect(result).toMatchObject({ status: 'ok', residues, internalStops: [], threePrimeIndeterminate: false });
  if (result.status !== 'ok') throw new Error('expected product');
  expect(result.codons.map(c => c.ordinary)).toEqual(ordinary);
  expect(result.codons.map(c => c.contextual)).toEqual(contextual);
  expect(result.codons.find(c => c.terminalRemoved)?.alignedIndices).toEqual(terminal);
  if (raw) expect(result.exceptions).toMatchObject([{ raw, status: 'applied', codonIndex: 1 }]);
});

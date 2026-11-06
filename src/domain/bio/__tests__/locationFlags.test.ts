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
import * as locationFlags from '../locationFlags';
import { isNestedComplementLocation } from '../locationFlags';

describe('isNestedComplementLocation', () => {
  // The parser reverses a list only when an outer complement wraps join/order and one of the list's
  // own elements is complement(…); the detector must name exactly those locations.
  it.each([
    ['complement(join(complement(1..2),5..6))', true],
    ['complement(order(complement(1..2),complement(5..6)))', true],
    [' complement( join( complement(<1..2), 5..>6 ) ) ', true],
    ['complement(join(1..10,21..30))', false],
    ['join(complement(21..30),1..10)', false],
    ['complement(join(1..2,join(complement(5..6),8..9)))', false],
    ['complement(join(AB1:complement(1..2),5..6))', false],
    ['complement(1..2)', false],
  ])('%s → %s', (locationString, nested) => {
    expect(isNestedComplementLocation({ locationString })).toBe(nested);
  });

  it('is false for a feature without location text', () => {
    expect(isNestedComplementLocation({})).toBe(false);
  });
});

it.each([
  ['<1..9', true, false],
  ['1..>9', false, true],
  ['complement(1..>9)', true, false],
  ['complement(<1..9)', false, true],
  ['join(<1..3,7..9)', true, false],
  ['join(1..3,<7..9)', false, false],
  ['join(<1..3,7..>9)', true, true],
  ['join(complement(7..>9),1..3)', true, false],
  ['join(complement(<7..9),1..3)', false, false],
  ['complement(join(1..3,7..>9))', true, false],
  ['complement(join(<1..3,7..9))', false, true],
  ['complement(join(complement(<1..3),7..9))', false, false],
  ['complement(join(1..3,complement(<7..9)))', true, false],
  ['complement(complement(<1..9))', true, false],
  [' join( AB1:<1..3, complement(7..9) ) ', true, false],
  [undefined, false, false],
] as const)('reads the biological terminal markers for %s', (locationString, five, three) => {
  expect(locationFlags.isFivePrimePartialLocation).toBeTypeOf('function');
  expect(locationFlags.isFivePrimePartialLocation({ locationString })).toBe(five);
  expect(locationFlags.isThreePrimePartialLocation({ locationString })).toBe(three);
});

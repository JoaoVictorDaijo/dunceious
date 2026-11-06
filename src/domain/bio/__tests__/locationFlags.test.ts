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
import type { BioFeature } from '../types';
import { isBetweenBasesSite, isJoinedLocation, isNestedComplementLocation, isOrderLocation } from '../locationFlags';

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

// LOC-1/LOC-2: only join makes intervals one sequence. The operator survives edits that clear the
// location text, so an edited order() feature must still read as not joined.
describe('isJoinedLocation and isOrderLocation', () => {
  const two = [{ start: 0, end: 3 }, { start: 10, end: 13 }];
  it.each<[Pick<BioFeature, 'operator' | 'segments' | 'locationString'>, boolean, boolean]>([
    [{ operator: 'join' as const, segments: two }, true, false],
    [{ operator: 'order' as const, segments: two }, false, true],
    [{ operator: 'order' as const, segments: two, locationString: undefined }, false, true],
    [{ segments: two, locationString: 'order(1..3,11..13)' }, false, true],
    [{ segments: two }, true, false],
    [{ operator: 'join' as const, segments: [two[0]] }, false, false],
  ])('%o → joined %s, order %s', (feature, joined, order) => {
    expect(isJoinedLocation(feature)).toBe(joined);
    expect(isOrderLocation(feature)).toBe(order);
  });
});

// LOC-5: a site is zero bases; an edit that gives it a width ends the site.
describe('isBetweenBasesSite', () => {
  it.each([
    [{ betweenBases: true as const, start: 10, end: 10 }, true],
    [{ betweenBases: true as const, start: 10, end: 12 }, false],
    [{ start: 10, end: 10 }, false],
  ])('%o → %s', (feature, site) => {
    expect(isBetweenBasesSite(feature)).toBe(site);
  });
});

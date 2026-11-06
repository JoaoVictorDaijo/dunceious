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
import { parseLocation } from '@/src/core/genbank/locationParser';
import type { BioFeature } from '../types';
import { definesOneSequence, isBetweenBasesSite, isJoinedLocation, isNestedComplementLocation, isOrderLocation } from '../locationFlags';

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

// #245: local intervals of a location with remote parts are not one sequence of this record.
describe('definesOneSequence and isJoinedLocation – remote parts', () => {
  const remote = { remoteParts: [{ accession: 'J00194.1', start: 99, end: 202, strand: 1 as const, index: 1 }] };
  it('is false for a location with a remote part', () => {
    expect(definesOneSequence({ segments: [{ start: 0, end: 100 }], ...remote })).toBe(false);
    expect(isJoinedLocation({ operator: 'join', segments: [{ start: 0, end: 10 }, { start: 20, end: 30 }], ...remote })).toBe(false);
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
  // The markers are read from the parsed per-end flags, so they hold after an edit clears the text.
  const feature = locationString === undefined ? {} : parseLocation(locationString);
  expect(locationFlags.isFivePrimePartialLocation(feature)).toBe(five);
  expect(locationFlags.isThreePrimePartialLocation(feature)).toBe(three);
});

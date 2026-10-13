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

import { it, expect } from 'vitest';
import { parseModifiers, DETAIL_TO_MODIFIER, DEPRECATED_MODIFIERS } from '../ncbiModifiers';

it('fields canonical modifiers and preserves unknown values and cleaned text', () => {
  expect(parseModifiers('[organism=MERS-CoV] [collection-date=2014] [strain=K1] camel sample')).toEqual({
    details: { organism: 'MERS-CoV', collectionDate: '2014' }, unknown: { strain: 'K1' }, text: 'camel sample',
  });
});

it.each(['collection-date', 'collection_date'])('reads the date modifier %s', key => {
  expect(parseModifiers(`[${key}=2014]`).details).toEqual({ collectionDate: '2014' });
});

it.each(['geo-loc-name', 'geo_loc_name', 'country'])('reads location modifier %s', key => {
  expect(parseModifiers(`[${key}=Saudi Arabia:Riyadh]`).details).toEqual({ location: 'Saudi Arabia:Riyadh' });
});

it('keeps unknown modifier values verbatim and keeps text surrounding modifiers', () => {
  expect(parseModifiers('camel [custom= a=b ] sample [host=Camelus dromedarius]')).toEqual({
    details: { host: 'Camelus dromedarius' }, unknown: { custom: ' a=b ' }, text: 'camel sample',
  });
});

it('uses published NCBI spellings and flags current deprecated modifiers', () => {
  expect(DETAIL_TO_MODIFIER).toEqual({ organism: 'organism', host: 'host', location: 'geo-loc-name', collectionDate: 'collection-date' });
  expect(DEPRECATED_MODIFIERS.has('acronym')).toBe(true);
  expect(DEPRECATED_MODIFIERS.has('identified-by')).toBe(true);
  expect(DEPRECATED_MODIFIERS.has('strain')).toBe(false);
});

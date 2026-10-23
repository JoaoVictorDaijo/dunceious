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

import type { BioFeature } from './types';

// The structured location reads `order` as `join` and drops `<`/`>`, so both flags come from the
// raw INSDC text, which an edited feature no longer carries.
// FIXME(#225, #226): read both from the parsed location once the parser keeps them.

/** `order()` (INSDC FT 11.4 §3.4.2.2): nothing is implied about joining the intervals (LOC-2). */
export function isOrderLocation(feature: Pick<BioFeature, 'locationString'>): boolean {
  return /\border\(/.test(feature.locationString ?? '');
}

/** `<` or `>` (INSDC FT 11.4 §3.4.2.1): an end lies beyond the stated base (LOC-4). */
export function isPartialLocation(feature: Pick<BioFeature, 'locationString'>): boolean {
  return /[<>]/.test(feature.locationString ?? '');
}

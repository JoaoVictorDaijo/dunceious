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
import { getFeatureStrand } from '../strand';

describe('known and unavailable feature direction', () => {
  it.each([1, -1] as const)('retains explicit strand %s', strand => {
    expect(getFeatureStrand({ strand })).toBe(strand);
  });
  it.each(['.', '?'])('preserves GFF %s over its legacy numeric placeholder', raw => {
    expect(getFeatureStrand({ strand: 1, metadata: { _gffStrand: raw } })).toBe(raw);
  });
  it('does not treat unrelated metadata as direction', () => {
    expect(getFeatureStrand({ strand: -1, metadata: { note: 'unknown', _gffStrand: '+' } })).toBe(-1);
  });
});

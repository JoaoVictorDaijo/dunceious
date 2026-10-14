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
import { listBounds, sectionsAt } from '../hubListGeometry';

const entries = [
  { type: 'header', key: 'first', sectionKey: 'first', size: 141 },
  { type: 'row', key: 'first:0', sectionKey: 'first', size: 44 },
  { type: 'header', key: 'second', sectionKey: 'second', size: 141 },
  { type: 'row', key: 'second:0', sectionKey: 'second', size: 44 },
];
const keys = new Set(['first', 'second']);

describe('hub list geometry', () => {
  it('distinguishes the reading-line current section from the top-edge bar', () => {
    const { starts } = listBounds(entries, 180);
    expect(starts).toEqual([0, 141, 185, 326]);
    expect(sectionsAt(entries, starts, keys, 180, 45, null)).toEqual({ barIndex: 0, bar: 'first', current: 'second', jumpLanding: null });
  });
});

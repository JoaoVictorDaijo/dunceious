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
import { centeredScroll, pixelToColumn, selectionExtent } from '../coordinates';

const selection = (start: number, end: number) => ({ start, end, recordIds: ['synthetic'] });

describe('alignment viewport coordinates', () => {
  it.each([0.001, 0.125, 0.3, 1, 1.2, 12.5, 150])('roundtrips boundaries at %s CSS pixels per column', zoom => {
    for (const column of [0, 1, 7, 300, 9999, 10000]) {
      const scroll = 137.25;
      expect(pixelToColumn(column * zoom - scroll, scroll, zoom, 10000)).toBe(column);
    }
  });
  it.each([0.3, 1, 8.66, 150])('floors inside cells and clamps outside the alignment at zoom %s', zoom => {
    expect(pixelToColumn(20.9 * zoom, 0, zoom, 100)).toBe(20);
    expect(pixelToColumn(-100, 0, zoom, 100)).toBe(0);
    expect(pixelToColumn(101 * zoom, 0, zoom, 100)).toBe(100);
  });
  it('centers the complete half-open interval, including a single column', () => {
    expect(centeredScroll(100, 200, 10, 800)).toBe(1100);
    expect(centeredScroll(100, 101, 150, 800)).toBe(14675);
  });
  it('fits both arms of a wrap in the existing linear viewport', () => {
    expect(selectionExtent(selection(900, 100), 1000)).toEqual([0, 1000]);
    expect(selectionExtent(selection(100, 900), 1000)).toEqual([100, 900]);
  });
});

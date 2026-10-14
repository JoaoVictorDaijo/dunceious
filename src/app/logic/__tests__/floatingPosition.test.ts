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

import { expect, it } from 'vitest';
import { clampPosition, movePosition, restorePosition } from '../floatingPosition';

const size = { width: 200, height: 48 };
const viewport = { width: 1000, height: 800 };

it.each([
  [{ x: -30, y: -1 }, { x: 0, y: 0 }],
  [{ x: 999, y: 900 }, { x: 800, y: 752 }],
  [{ x: 123.5, y: 456 }, { x: 123.5, y: 456 }],
])('clamps %o to visible bounds', (point, expected) => {
  expect(clampPosition(point, size, viewport)).toEqual(expected);
});

it('anchors oversized content at the origin rather than producing negative coordinates', () => {
  expect(clampPosition({ x: 20, y: 30 }, size, { width: 100, height: 20 })).toEqual({ x: 0, y: 0 });
});

it.each([
  ['ArrowLeft', false, { x: 90, y: 100 }],
  ['ArrowRight', false, { x: 110, y: 100 }],
  ['ArrowUp', false, { x: 100, y: 90 }],
  ['ArrowDown', false, { x: 100, y: 110 }],
  ['ArrowRight', true, { x: 150, y: 100 }],
  ['Enter', true, null],
])('moves with %s (shift=%s)', (key, shift, expected) => {
  expect(movePosition({ x: 100, y: 100 }, key, shift, size, viewport)).toEqual(expected);
});

it('clamps a keyboard step at the edge', () => {
  expect(movePosition({ x: 795, y: 745 }, 'ArrowDown', true, size, viewport)).toEqual({ x: 795, y: 752 });
});

it('restores fitting positions, including an exact edge, and resets invalid positions to the corner', () => {
  expect(restorePosition({ x: 800, y: 752 }, size, viewport)).toEqual({ x: 800, y: 752 });
  expect(restorePosition({ x: 801, y: 400 }, size, viewport)).toEqual({ x: 780, y: 720 });
  expect(restorePosition(null, size, viewport)).toEqual({ x: 780, y: 720 });
  expect(restorePosition(null, size, { width: 210, height: 60 })).toEqual({ x: 0, y: 0 });
});

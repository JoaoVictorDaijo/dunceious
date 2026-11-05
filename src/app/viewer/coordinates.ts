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

import type { SelectionArea } from '@/src/domain/bio/types';

/** Convert viewport CSS pixels to a half-open alignment boundary (not a residue label). */
export function pixelToColumn(x: number, scrollLeft: number, zoom: number, length: number): number {
  if (zoom <= 0 || length <= 0) return 0;
  const column = (x + scrollLeft) / zoom;
  // Undo floating-point roundoff at exact boundaries, without rounding real fractions.
  const nearest = Math.round(column);
  const stable = Math.abs(column - nearest) <= Number.EPSILON * Math.max(1, Math.abs(x) / zoom, Math.abs(scrollLeft) / zoom) * 4
    ? nearest : column;
  return Math.max(0, Math.min(length, Math.floor(stable)));
}

/** A wrapped interval occupies both ends of the existing linear viewport. */
export function selectionExtent(selection: Pick<SelectionArea, 'start' | 'end'>, length: number): [number, number] {
  return selection.start > selection.end ? [0, length] : [selection.start, selection.end];
}

export function centeredScroll(start: number, end: number, zoom: number, viewportWidth: number): number {
  return (start + end) / 2 * zoom - viewportWidth / 2;
}

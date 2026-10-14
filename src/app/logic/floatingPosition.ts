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

export interface FloatingPosition { x: number; y: number }
export interface FloatingSize { width: number; height: number }

export function clampPosition(point: FloatingPosition, size: FloatingSize, viewport: FloatingSize): FloatingPosition {
  return {
    x: Math.max(0, Math.min(point.x, viewport.width - size.width)),
    y: Math.max(0, Math.min(point.y, viewport.height - size.height)),
  };
}

export function restorePosition(point: FloatingPosition | null, size: FloatingSize, viewport: FloatingSize): FloatingPosition {
  if (point) {
    const clamped = clampPosition(point, size, viewport);
    if (point.x === clamped.x && point.y === clamped.y) return point;
  }
  return clampPosition({ x: viewport.width - size.width - 20, y: viewport.height - size.height - 32 }, size, viewport);
}

export function movePosition(point: FloatingPosition, key: string, shift: boolean, size: FloatingSize, viewport: FloatingSize): FloatingPosition | null {
  const step = shift ? 50 : 10;
  switch (key) {
    case 'ArrowLeft': return clampPosition({ ...point, x: point.x - step }, size, viewport);
    case 'ArrowRight': return clampPosition({ ...point, x: point.x + step }, size, viewport);
    case 'ArrowUp': return clampPosition({ ...point, y: point.y - step }, size, viewport);
    case 'ArrowDown': return clampPosition({ ...point, y: point.y + step }, size, viewport);
    default: return null;
  }
}

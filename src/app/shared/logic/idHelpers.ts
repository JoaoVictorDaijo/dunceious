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

/**
 * Generate a unique ID by appending a numeric suffix if the base ID collides
 * with any existing ID (case-insensitive). Preserves the original case of baseId.
 *
 * @param baseId - The desired ID
 * @param existingIds - Array of existing IDs to check against (case-insensitive)
 * @returns The baseId if unique, or baseId with a (n) suffix
 */
export function makeUniqueId(baseId: string, existingIds: string[]): string {
  const existing = new Set(existingIds.map(id => id.toLowerCase()));
  if (!existing.has(baseId.toLowerCase())) return baseId;
  let n = 1;
  while (existing.has(`${baseId.toLowerCase()} (${n})`)) n++;
  return `${baseId} (${n})`;
}

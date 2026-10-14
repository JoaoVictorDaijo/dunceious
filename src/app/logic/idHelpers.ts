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

export function sanitizeId(raw: string): string {
  return raw.replace(/[\s;=&,%[\]()"']/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'seq';
}

/** IDs share one namespace across formats and records, including generated suffixes. */
export function makeUniqueId(baseId: string, existingIds: string[]): string {
  const base = sanitizeId(baseId);
  const existing = new Set(existingIds.map(id => id.toLowerCase()));
  if (!existing.has(base.toLowerCase())) return base;

  let n = 1;
  while (existing.has(`${base.toLowerCase()}_${n}`)) n++;
  return `${base}_${n}`;
}

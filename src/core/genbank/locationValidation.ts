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

import { parseLocation } from './locationParser';

type LocationProblem = { code: string; message: string };
export const guardOrderLocation = (text: string): boolean => /order\(/.test(text);
export const guardBetweenBaseSite = (text: string): boolean => /\^/.test(text);
export const guardRemoteLocation = (text: string): boolean => /[\w.]+:/.test(text);
export const guardOneOfPosition = (text: string): boolean => /\d+\.(?!\.)\d+/.test(text);
export const guardSiteInCompound = (text: string): boolean => /\^/.test(text) && /join\(|order\(|\.\./.test(text);

/** INSDC FT 11.4 §3.4: fully consumed grammar; supported local bounds use residue coordinates. */
export function validateLocation(text: string, length?: number): LocationProblem | null {
  const loc = text.replace(/\s/g, '');
  const malformed = (message = 'cannot be read') => ({ code: 'malformed-location', message });
  if (!loc) return { code: 'missing-location', message: 'has no location' };
  if (/join\(/.test(loc) && /order\(/.test(loc)) return malformed('mixes join and order');
  if (/>\d+\.\.|\.\.<\d+/.test(loc)) return malformed('has an invalid fuzzy endpoint');
  for (const m of loc.matchAll(/(\d+)\^(\d+)/g)) {
    const start = Number(m[1]), end = Number(m[2]);
    if (end !== start + 1 && !(start === length && end === 1)) return malformed('between-base positions do not adjoin');
    if (length !== undefined && (start < 1 || start > length || end < 1 || end > length)) return { code: 'location-out-of-range', message: `is outside the ${length} residue sequence` };
  }
  const guards = [
    [guardSiteInCompound, 'a between-base site in a compound'],
    [guardOrderLocation, 'order'], [guardBetweenBaseSite, 'a between-base site'],
    [guardRemoteLocation, 'a remote location'], [guardOneOfPosition, 'a one-of position'],
  ] as const;
  for (const [guard, style] of guards) if (guard(loc)) return { code: 'unsupported-location', message: `uses ${style}, which Dunceious cannot place yet` };
  try {
    const parsed = parseLocation(loc);
    if (parsed.segments.some(p => p.start < 0 || p.end <= p.start || !Number.isSafeInteger(p.start) || !Number.isSafeInteger(p.end) || (length !== undefined && p.end > length))) return { code: 'location-out-of-range', message: `is outside the ${length ?? ''} residue sequence` };
  } catch { return malformed(); }
  return null;
}

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
/** `n.m` in a base number; an accession's `.version` (`AB123.1:`) is not a position. */
export const guardOneOfPosition = (text: string): boolean => /\d+\.(?!\.)\d+/.test(text.replace(/[^():,]+:/g, ''));
/** A `^` site inside another entry's descriptor: valid INSDC (§3.4.2.1(e)), not supported yet. */
export const guardRemoteSite = (text: string): boolean => /[^():,]+:[<>]?\d+\^/.test(text);
export const guardSiteSpanEnd = (text: string): boolean => /\^/.test(text) && /\.\.\d+\^|\^\d+\.\./.test(text);

/**
 * INSDC FT 11.4 §3.4: fully consumed grammar; supported local bounds use residue coordinates.
 * `order()` (LOC-2), between-base sites (LOC-5) and remote intervals (LOC-8) are read; `n^1` is a
 * site only on a circular molecule of length n (§3.4.2.1).
 */
export function validateLocation(text: string, length?: number, circular = false): LocationProblem | null {
  const loc = text.replace(/\s/g, '');
  const malformed = (message = 'cannot be read') => ({ code: 'malformed-location', message });
  if (!loc) return { code: 'missing-location', message: 'has no location' };
  if (/join\(/.test(loc) && /order\(/.test(loc)) return malformed('mixes join and order');
  if (/>\d+\.\.|\.\.<\d+/.test(loc)) return malformed('has an invalid fuzzy endpoint');
  // Checked before the local site rules, which would test a remote site against this record's length.
  if (guardRemoteSite(loc)) return { code: 'unsupported-location', message: 'uses a between-base site in another record, which Dunceious cannot place yet' };
  for (const m of loc.matchAll(/(\d+)\^(\d+)/g)) {
    const start = Number(m[1]), end = Number(m[2]);
    if (end !== start + 1 && !(start === length && end === 1 && circular)) return malformed('between-base positions do not adjoin');
    if (length !== undefined && (start < 1 || start > length || end < 1 || end > length)) return { code: 'location-out-of-range', message: `is outside the ${length} residue sequence` };
  }
  const localText = loc.replace(/[^():,]+:[^(),]+/g, '');
  for (const range of localText.matchAll(/(\d+)\.\.>?(\d+)/g)) {
    if (Number(range[2]) < Number(range[1])) return { code: 'location-out-of-range', message: 'has a backwards interval' };
  }
  // §3.4.2.1(e): a remote entry is named by accession-number and sequence version.
  for (const m of loc.matchAll(/(?:^|[(,])([^():,]+):/g)) {
    if (!/^[A-Za-z][A-Za-z0-9_]*\.\d+$/.test(m[1])) return malformed(`remote entry ${m[1]} has no sequence version`);
  }
  const guards = [
    [guardSiteSpanEnd, 'a between-base site as a span endpoint'],
    [guardOneOfPosition, 'a one-of position'],
  ] as const;
  for (const [guard, style] of guards) if (guard(loc)) return { code: 'unsupported-location', message: `uses ${style}, which Dunceious cannot place yet` };
  try {
    const parsed = parseLocation(loc);
    // A between-base site is the one zero-length interval; remote intervals are not local segments.
    const empty = (p: { start: number; end: number }) => p.end < p.start || (p.end === p.start && !loc.includes('^'));
    if (parsed.segments.some(p => p.start < 0 || empty(p) || !Number.isSafeInteger(p.start) || !Number.isSafeInteger(p.end) || (length !== undefined && p.end > length))) return { code: 'location-out-of-range', message: `is outside the ${length ?? ''} residue sequence` };
    // §3.4.2: a remote interval may lie beyond this record's length, but it still starts at base 1
    // or later and does not run backwards.
    if (parsed.remoteParts?.some(p => p.start < 0 || p.end <= p.start || !Number.isSafeInteger(p.start) || !Number.isSafeInteger(p.end))) return malformed('has an invalid interval in another record');
  } catch { return malformed(); }
  return null;
}

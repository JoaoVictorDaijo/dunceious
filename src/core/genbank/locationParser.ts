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
 * Parses GenBank feature location strings into structured coordinate data.
 *
 * Supported location forms:
 *   - Simple range:           1..100
 *   - Point site:             50^51
 *   - Single position:        42
 *   - Complement:             complement(1..100)
 *   - Join (linear):          join(1..10,21..30)
 *   - Join (circular wrap):   join(2427..3323,1..1758)  – first segment START > last segment END
 *   - Nested complement:      complement(join(1..10,21..30))
 *   - Fuzzy boundaries (</>): <1..>100  (angle brackets are stripped)
 *
 * All coordinates are converted to 0-based half-open intervals [start, end).
 *
 * Circular wrap-around detection:
 *   When a join() has multiple segments and the first segment's start is
 *   greater than the last segment's end, the feature crosses the origin of a
 *   circular molecule.  In that case:
 *     - `start` is set to the first segment's start (high number)
 *     - `end`   is set to the last  segment's end   (low  number)
 *   so that callers can detect circularity by checking `start > end`.
 */

import type { FeatureSegment } from '@/src/domain/bio/types';

export interface LocationData {
  segments: FeatureSegment[];
  strand: 1 | -1;
  /** 0-based start.  For circular wrap-arounds, start > end. */
  start: number;
  /** 0-based end (exclusive). */
  end: number;
}

export function parseLocation(loc: string): LocationData {
  // Strip fuzzy indicators (<, >) and whitespace
  const cleanLoc = loc.replace(/[<>\s]/g, '');

  const isComplement = cleanLoc.includes('complement');
  const strand: 1 | -1 = isComplement ? -1 : 1;

  const segments: FeatureSegment[] = [];

  // Match coord pairs (n..m or n^m) or single positions
  const pairRe = /(\d+)(?:\.\.|\^)(\d+)|(\d+)/g;
  let match: RegExpExecArray | null;
  while ((match = pairRe.exec(cleanLoc)) !== null) {
    if (match[1] !== undefined && match[2] !== undefined) {
      segments.push({ start: parseInt(match[1]) - 1, end: parseInt(match[2]) });
    } else if (match[3] !== undefined) {
      const val = parseInt(match[3]);
      segments.push({ start: val - 1, end: val });
    }
  }

  let start = 0;
  let end = 0;

  if (segments.length > 0) {
    const firstStart = segments[0].start;
    const lastEnd = segments[segments.length - 1].end;

    // Circular wrap-around: first segment starts *after* last segment ends
    // e.g. join(2427..3323,1..1758) → firstStart=2426, lastEnd=1758
    if (segments.length > 1 && firstStart > lastEnd) {
      // Keep start > end to signal wrap-around to callers
      start = firstStart;
      end = lastEnd;
    } else {
      // Linear: envelope is min start … max end
      start = Math.min(...segments.map(s => s.start));
      end = Math.max(...segments.map(s => s.end));
    }
  }

  return { segments, strand, start, end };
}

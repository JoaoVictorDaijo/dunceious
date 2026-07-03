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

import { smithWaterman } from '@/src/core/search/align';
import { removeGapsWithMap, mapUngappedRangeToAligned, getNonGapSegments } from '@/src/domain/bio';
import type { SearchResult } from '@/src/domain/bio/types';

/**
 * Seeded fuzzy search of one strand of one record: finds short exact seeds of
 * the query, runs `smithWaterman` only inside gap-mapped candidate windows
 * around each seed, and returns de-duplicated hits in aligned-space `[start,
 * end)` coordinates tagged with `recordId`/`strand`.
 *
 * Seed length scales with the query (2–6). The candidate-window set is capped at
 * 256; when no seed matches, it falls back to a single full-length ungapped
 * window so the search never silently returns nothing. `minScore` is forwarded
 * to `smithWaterman`.
 */
export function collectSeededFuzzyHits(
  queryUpper: string,
  seq: string,
  recordId: string,
  strand: 1 | -1,
  minScore: number,
): SearchResult[] {
  const { ungapped, map } = removeGapsWithMap(seq);
  if (!ungapped) return [];

  const queryLen = queryUpper.length;
  const seedLen = Math.max(2, Math.min(6, Math.floor(queryLen / 4) || 2));
  if (queryLen < seedLen) {
    return smithWaterman(queryUpper, ungapped, 2, -1, -3, -1, minScore).map(m => {
      const aligned = mapUngappedRangeToAligned(map, m.start, m.end);
      return {
        start: aligned.start,
        end: aligned.end,
        sequence: seq.substring(aligned.start, aligned.end),
        recordId,
        strand,
        score: m.score,
        segments: getNonGapSegments(seq, aligned.start, aligned.end),
      };
    });
  }

  const flank = Math.max(12, queryLen);
  const candidateWindows: Array<{ start: number; end: number }> = [];
  const seenWindows = new Set<string>();

  for (let offset = 0; offset <= queryLen - seedLen; offset++) {
    const seed = queryUpper.substring(offset, offset + seedLen);
    let pos = ungapped.indexOf(seed);
    while (pos !== -1) {
      const windowStart = Math.max(0, pos - flank);
      const windowEnd = Math.min(ungapped.length, pos + seedLen + flank);
      const key = `${windowStart}:${windowEnd}`;
      if (!seenWindows.has(key)) {
        seenWindows.add(key);
        candidateWindows.push({ start: windowStart, end: windowEnd });
      }
      pos = ungapped.indexOf(seed, pos + 1);
      if (candidateWindows.length >= 256) break;
    }
    if (candidateWindows.length >= 256) break;
  }

  if (candidateWindows.length === 0) {
    // No exact seed hit: fall back to a full ungapped local alignment so we
    // still return something instead of appearing broken.
    candidateWindows.push({ start: 0, end: ungapped.length });
  }

  const hits: SearchResult[] = [];
  const seenHits = new Set<string>();

  for (const window of candidateWindows) {
    const windowSeq = ungapped.substring(window.start, window.end);
    const alignments = smithWaterman(queryUpper, windowSeq, 2, -1, -3, -1, minScore);
    for (const alignment of alignments) {
      const aligned = mapUngappedRangeToAligned(map, window.start + alignment.start, window.start + alignment.end);
      const key = `${recordId}:${strand}:${aligned.start}:${aligned.end}`;
      if (seenHits.has(key)) continue;
      seenHits.add(key);
      hits.push({
        start: aligned.start,
        end: aligned.end,
        sequence: seq.substring(aligned.start, aligned.end),
        recordId,
        strand,
        score: alignment.score,
        segments: getNonGapSegments(seq, aligned.start, aligned.end),
      });
    }
  }

  return hits;
}

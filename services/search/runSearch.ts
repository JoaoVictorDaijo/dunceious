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

import {
  SearchResult,
  reverseComplement,
  getNonGapSegments,
  removeGapsWithMap,
  mapUngappedRangeToAligned,
  smithWaterman,
} from '../searchLogic';
import type { SearchWorkerRequest, SearchWorkerResponse } from '../../src/workers/protocol';
import { runExactSearch } from './exact';

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

/** Pure search-worker body: maps a search request to its response. */
export function runSearch(request: SearchWorkerRequest): SearchWorkerResponse {
  const { requestId, searchQuery, records, mode, options, moleculeType } = request;
  const { minScore = 5, strand = 'both', maxResults = 100 } = options;
  const isProtein = moleculeType === 'protein';

  if (!searchQuery || searchQuery.length < 1) {
    return { requestId, results: [] };
  }

  try {
    let results: SearchResult[] = [];
    const queryUpper = searchQuery.toUpperCase();

    if (mode === 'fuzzy') {
      records.forEach((record) => {
        const seq = record.alignedSequence || record.sequence;
        const L = seq.length;
        if (strand === 'both' || strand === 'fwd') {
          results.push(...collectSeededFuzzyHits(queryUpper, seq, record.id, 1, minScore));
        }
        if (!isProtein && (strand === 'both' || strand === 'rev')) {
          const rcSeq = reverseComplement(seq);
          const revHits = collectSeededFuzzyHits(queryUpper, rcSeq, record.id, -1, minScore);
          revHits.forEach(hit => {
            const start = L - hit.end;
            const end = L - hit.start;
            results.push({
              ...hit,
              start,
              end,
              sequence: seq.substring(start, end),
              segments: getNonGapSegments(seq, start, end),
            });
          });
        }
      });
    } else {
      results = runExactSearch(searchQuery, records, isProtein, strand);
    }

    // Sort results
    if (mode === 'fuzzy') {
      results.sort((a, b) => (b.score || 0) - (a.score || 0) || a.start - b.start);
    } else {
      results.sort((a, b) => a.start - b.start || a.recordId.localeCompare(b.recordId));
    }

    // Apply maxResults limit
    if (results.length > maxResults) {
      results = results.slice(0, maxResults);
    }

    return { requestId, results };
  } catch (error) {
    return { requestId, error: String(error) };
  }
}

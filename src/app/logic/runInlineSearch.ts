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

import { reverseComplement, getNonGapSegments, removeGapsWithMap, mapUngappedRangeToAligned } from '@/src/domain/bio';
import type { SearchResult } from '@/src/domain/bio/types';
import { smithWaterman } from '@/src/core/search/align';
import type { SearchWorkerRequest } from '@/src/workers/protocol';
import { runExactSearch } from '@/src/core/search/exact';

/**
 * Synchronous inline search fallback used when the Web Worker is unavailable.
 *
 * Exact/IUPAC mode delegates to the shared `runExactSearch`, which has no time
 * budget of its own. Fuzzy mode runs Smith-Waterman over the WHOLE ungapped
 * sequence (a lighter, distinct strategy from the worker's seeded
 * `collectSeededFuzzyHits` — intentionally NOT merged) and reads `Date.now()`
 * for a 1800ms time budget; with small inputs the budget never trips, so
 * results are deterministic.
 */
export function runInlineSearch(request: SearchWorkerRequest): SearchResult[] {
  const { searchQuery, records: inputRecords, mode, options, moleculeType } = request;
  const { minScore = 5, strand = 'both', maxResults = 100 } = options;
  const isProtein = moleculeType === 'protein';

  if (!searchQuery || searchQuery.length < 1) return [];

  let results: SearchResult[];

  if (mode !== 'fuzzy') {
    // Delegates to the shared `runExactSearch`, which derives `seq` via the
    // shared worker convention `record.alignedSequence || record.sequence`
    // (distinct from this file's fuzzy-branch `typeof`-guard below). An empty
    // aligned overlay (`alignedSequence: ''`) is rejected upstream by
    // `applyFastaResponse` (`kind: 'reject-empty'`), so a record with an empty
    // `alignedSequence` and a non-empty `sequence` cannot occur here — the
    // derivation difference cannot manifest.
    results = runExactSearch(searchQuery, inputRecords, isProtein, strand);
  } else {
    results = [];
    const queryUpper = searchQuery.toUpperCase();
    const startedAt = Date.now();
    const maxInlineMs = 1800;

    for (const record of inputRecords) {
      if (Date.now() - startedAt > maxInlineMs) break;
      const seq = typeof record.alignedSequence === 'string'
        ? record.alignedSequence
        : (typeof record.sequence === 'string' ? record.sequence : '');
      if (!seq) continue;
      const L = seq.length;

      const { ungapped: ungappedSeq, map: fwdMap } = removeGapsWithMap(seq);

      if ((strand === 'both' || strand === 'fwd') && ungappedSeq.length > 0) {
        const fwdFuzzy = smithWaterman(queryUpper, ungappedSeq, 2, -1, -3, -1, minScore);
        fwdFuzzy.forEach(m => {
          const aligned = mapUngappedRangeToAligned(fwdMap, m.start, m.end);
          results.push({
            start: aligned.start,
            end: aligned.end,
            sequence: seq.substring(aligned.start, aligned.end),
            score: m.score,
            recordId: record.id,
            strand: 1,
            segments: getNonGapSegments(seq, aligned.start, aligned.end),
          });
        });
      }

      if (Date.now() - startedAt > maxInlineMs) break;

      if (!isProtein && (strand === 'both' || strand === 'rev')) {
        const rcSeq = reverseComplement(seq);
        const { ungapped: ungappedRcSeq, map: revMap } = removeGapsWithMap(rcSeq);
        if (ungappedRcSeq.length === 0) continue;

        const revFuzzy = smithWaterman(queryUpper, ungappedRcSeq, 2, -1, -3, -1, minScore);
        revFuzzy.forEach(m => {
          const rcRange = mapUngappedRangeToAligned(revMap, m.start, m.end);
          const start = L - rcRange.end;
          const end = L - rcRange.start;
          results.push({
            score: m.score,
            start,
            end,
            sequence: seq.substring(start, end),
            recordId: record.id,
            strand: -1,
            segments: getNonGapSegments(seq, start, end),
          });
        });
      }
    }
  }

  if (mode === 'fuzzy') {
    results.sort((a, b) => (b.score || 0) - (a.score || 0) || a.start - b.start);
  } else {
    results.sort((a, b) => a.start - b.start || a.recordId.localeCompare(b.recordId));
  }

  return results.length > maxResults ? results.slice(0, maxResults) : results;
}

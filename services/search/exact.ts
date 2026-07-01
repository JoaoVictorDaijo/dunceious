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
  degenerateToRegex,
  reverseComplement,
  getNonGapSegments,
} from '../searchLogic';

/** A record projection carrying the sequence(s) the exact loop scans. */
export interface ExactSearchRecord {
  id: string;
  sequence: string;
  alignedSequence?: string;
}

/**
 * Exact / IUPAC-degenerate regex search over the given records.
 *
 * Shared verbatim between the search worker (`runSearch`) and the inline
 * fallback (`runInlineSearch`); their exact paths were byte-identical. Forward
 * matches use the raw index; reverse matches are remapped onto forward
 * coordinates as `start = L - rcEnd`, `end = L - rcStart`. Proteins skip the
 * reverse strand. Overlapping matches are found via `lastIndex = index + 1`.
 * Results are returned unsorted; the caller sorts/slices.
 */
export function runExactSearch(
  searchQuery: string,
  records: ExactSearchRecord[],
  isProtein: boolean,
  strand: 'fwd' | 'rev' | 'both',
): SearchResult[] {
  const results: SearchResult[] = [];
  const regex = degenerateToRegex(searchQuery, isProtein ? 'protein' : 'nucleotide');

  for (const record of records) {
    const seq = record.alignedSequence || record.sequence;
    if (!seq) continue;
    const L = seq.length;

    // Forward search
    if (strand === 'both' || strand === 'fwd') {
      let match;
      regex.lastIndex = 0;
      while ((match = regex.exec(seq)) !== null) {
        const start = match.index;
        const end = match.index + match[0].length;
        results.push({
          start,
          end,
          sequence: match[0],
          recordId: record.id,
          strand: 1,
          segments: getNonGapSegments(seq, start, end),
        });
        regex.lastIndex = match.index + 1;
      }
    }

    // Reverse search (nucleotide only — proteins have no reverse complement)
    if (!isProtein && (strand === 'both' || strand === 'rev')) {
      const rcSeq = reverseComplement(seq);
      let match;
      regex.lastIndex = 0;
      while ((match = regex.exec(rcSeq)) !== null) {
        const rcStart = match.index;
        const rcEnd = match.index + match[0].length;
        const start = L - rcEnd;
        const end = L - rcStart;
        results.push({
          start,
          end,
          sequence: match[0],
          recordId: record.id,
          strand: -1,
          segments: getNonGapSegments(seq, start, end),
        });
        regex.lastIndex = match.index + 1;
      }
    }
  }

  return results;
}

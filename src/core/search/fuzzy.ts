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

import { residueAlternatives, type ResidueAlphabet } from '@/src/core/search/query';
import {
  reverseComplement,
  getNonGapSegments,
  removeGapsWithMap,
  mapUngappedRangeToAligned,
  detectMoleculeType,
} from '@/src/domain/bio';
import type { SearchResult, SearchableRecord } from '@/src/domain/bio/types';

/** A query occurrence in ungapped text: half-open `[start, end)` plus its edit distance. */
export interface ApproximateMatch {
  start: number;
  end: number;
  edits: number;
}

export interface ApproximateMatchOptions {
  moleculeType: ResidueAlphabet;
  /** Maximum number of matches returned. */
  limit: number;
  /** Rank equally good matches rightmost first, for text that is a reverse complement. */
  fromEnd?: boolean;
}

const WORD_BITS = 32;
const HIGH_BIT = 1 << 31;
const ASCII_CODES = 128;

/**
 * Query bitmasks for Myers' bit-parallel edit distance, split into 32-bit
 * blocks because JavaScript bitwise operators work on 32-bit integers.
 */
interface BitPattern {
  length: number;
  blocks: number;
  /** Bit of the query's last residue inside the last block. */
  lastBit: number;
  /** Per text character code, the blocks' masks of query positions it satisfies. */
  peq: Int32Array[];
}

function buildPattern(query: string, alphabet: ResidueAlphabet): BitPattern {
  const blocks = Math.ceil(query.length / WORD_BITS);
  const none = new Int32Array(blocks);
  const peq: Int32Array[] = new Array(ASCII_CODES).fill(none);
  for (let i = 0; i < query.length; i++) {
    for (const residue of residueAlternatives(query[i], alphabet)) {
      for (const code of [residue.charCodeAt(0), residue.toLowerCase().charCodeAt(0)]) {
        if (code >= ASCII_CODES) continue;
        if (peq[code] === none) peq[code] = new Int32Array(blocks);
        peq[code][i >> 5] |= 1 << (i & 31);
      }
    }
  }
  const lastBit = 1 << ((query.length - 1) & 31);
  return { length: query.length, blocks, lastBit, peq };
}

/**
 * Runs Myers' algorithm (Myers 1999; block form as in edlib) over `length`
 * text positions read through `charAt`, calling `onColumn` with the column
 * count so far and the edit distance of the whole query at that column.
 *
 * `topRow` sets the distance growth along the top DP row: 0 lets a match start
 * anywhere in the text (infix search); 1 anchors it at the first position read.
 */
function scanColumns(
  pattern: BitPattern,
  length: number,
  charAt: (column: number) => number,
  topRow: 0 | 1,
  onColumn: (columns: number, edits: number) => void,
): void {
  const { blocks, lastBit, peq } = pattern;
  const pv = new Int32Array(blocks).fill(-1);
  const mv = new Int32Array(blocks);
  let edits = pattern.length;

  for (let column = 0; column < length; column++) {
    const code = charAt(column);
    const eqs = code < ASCII_CODES ? peq[code] : peq[0];
    let hin: number = topRow;
    for (let b = 0; b < blocks; b++) {
      const high = b === blocks - 1 ? lastBit : HIGH_BIT;
      let eq = eqs[b];
      const p = pv[b];
      const m = mv[b];
      const xv = eq | m;
      if (hin < 0) eq |= 1;
      const xh = (((eq & p) + p) ^ p) | eq;
      let ph = m | ~(xh | p);
      let mh = p & xh;
      const hout = (ph & high) !== 0 ? 1 : (mh & high) !== 0 ? -1 : 0;
      ph <<= 1;
      mh <<= 1;
      if (hin < 0) mh |= 1;
      else if (hin > 0) ph |= 1;
      pv[b] = mh | ~(xv | ph);
      mv[b] = ph & xv;
      hin = hout;
    }
    edits += hin;
    onColumn(column + 1, edits);
  }
}

/**
 * Every column whose whole-query distance is at most `maxEdits`, as sort keys
 * `edits × (text length + 1) + rank`, so ascending order is fewest edits first,
 * then leftmost end (rightmost with `fromEnd`).
 */
function candidateKeys(pattern: BitPattern, text: string, maxEdits: number, fromEnd: boolean): Float64Array {
  const stride = text.length + 1;
  const keys: number[] = [];
  scanColumns(pattern, text.length, column => text.charCodeAt(column), 0, (end, edits) => {
    if (edits <= maxEdits) keys.push(edits * stride + (fromEnd ? stride - 1 - end : end));
  });
  return Float64Array.from(keys).sort();
}

/**
 * The anchored span with the fewest edits among the first `reach` columns;
 * among equally good spans, the one closest to the query's length, so an edge
 * substitution stays a substitution instead of an indel plus a trimmed span.
 */
function closestSpan(
  pattern: BitPattern,
  reach: number,
  charAt: (column: number) => number,
): { columns: number; edits: number } {
  let best = { columns: reach, edits: Infinity, offset: Infinity };
  scanColumns(pattern, reach, charAt, 1, (columns, edits) => {
    const offset = Math.abs(columns - pattern.length);
    if (edits < best.edits || (edits === best.edits && offset < best.offset)) best = { columns, edits, offset };
  });
  return best;
}

/**
 * Lowest identity a fuzzy search honours. Near 50%, random DNA is within the
 * edit budget almost everywhere, so hits are noise and a long query's search
 * time explodes with them.
 */
export const MIN_FUZZY_IDENTITY = 60;

/**
 * Allowed edits for a query of `queryLength` residues at `minIdentity` percent,
 * where identity is `1 − edits / queryLength`. Capped below the query length,
 * since a query that may be edited away entirely matches everywhere.
 */
export function maxEditsForIdentity(queryLength: number, minIdentity: number): number {
  const allowed = Math.floor((queryLength * (100 - minIdentity)) / 100);
  return Math.max(0, Math.min(queryLength - 1, allowed));
}

/**
 * Non-overlapping occurrences of the whole `query` in ungapped `text` within
 * `maxEdits` substitutions, insertions or deletions, best first (fewest edits,
 * then leftmost), at most `options.limit` of them.
 *
 * Selection is greedy: each text end within `maxEdits` is taken in that order
 * with its own best span, and dropped if that span overlaps an accepted match.
 * Runs of repeats therefore split into consecutive copies, but a weaker span
 * squeezed into the gap between two accepted matches is not sought.
 *
 * Query residues follow the IUPAC rules of `residueAlternatives`; text letters
 * compare literally and case-insensitively. The scan is O(⌈|query|/32⌉·|text|)
 * plus one sort key per qualifying end. Each examined end costs two anchored
 * passes over about |query| + edits columns; ends whose span must overlap an
 * accepted match are skipped first, so only low-complexity text at low identity
 * examines many ends without reporting them.
 */
export function findApproximateMatches(
  query: string,
  text: string,
  maxEdits: number,
  options: ApproximateMatchOptions,
): ApproximateMatch[] {
  if (!query || !text || options.limit <= 0) return [];
  const pattern = buildPattern(query, options.moleculeType);
  const reversed = buildPattern(query.split('').reverse().join(''), options.moleculeType);
  const stride = text.length + 1;
  const n = query.length;

  const accepted: ApproximateMatch[] = [];
  const fromEnd = options.fromEnd ?? false;
  for (const key of candidateKeys(pattern, text, maxEdits, fromEnd)) {
    const edits = Math.floor(key / stride);
    const end = fromEnd ? stride - 1 - (key % stride) : key % stride;
    // A span with `edits` edits covers at least n − edits columns, so it would overlap.
    const earliestStart = end - (n - edits);
    if (accepted.some(match => match.start < end && earliestStart < match.end)) continue;

    const back = closestSpan(reversed, Math.min(end, n + edits), column => text.charCodeAt(end - 1 - column));
    const start = end - back.columns;
    const ahead = closestSpan(pattern, Math.min(text.length - start, n + edits), column => text.charCodeAt(start + column));
    const match = { start, end: start + ahead.columns, edits: ahead.edits };
    if (accepted.some(other => match.start < other.end && other.start < match.end)) continue;
    accepted.push(match);
    if (accepted.length >= options.limit) break;
  }
  return accepted.sort((a, b) => a.edits - b.edits || (fromEnd ? b.start - a.start : a.start - b.start));
}

/**
 * Fuzzy search over the given records: occurrences of the whole query with at
 * least `minIdentity` percent identity (see `maxEditsForIdentity`), raised to
 * `MIN_FUZZY_IDENTITY` when lower, in aligned-space `[start, end)` coordinates.
 *
 * Shared by the search worker and the inline fallback. Gaps are removed before
 * matching and mapped back afterwards. Reverse hits search the record's
 * reverse complement, as the exact search does, and are remapped onto forward
 * coordinates; proteins skip the reverse strand. Results are ranked by edits,
 * then position, and capped at `maxResults`.
 */
export function runFuzzySearch(
  searchQuery: string,
  records: SearchableRecord[],
  isProtein: boolean,
  strand: 'fwd' | 'rev' | 'both',
  moleculeType: SearchableRecord['moleculeType'] | undefined,
  minIdentity: number,
  maxResults: number,
): SearchResult[] {
  if (!searchQuery || maxResults <= 0) return [];
  const maxEdits = maxEditsForIdentity(searchQuery.length, Math.max(minIdentity, MIN_FUZZY_IDENTITY));
  const options: ApproximateMatchOptions = { moleculeType: isProtein ? 'protein' : 'nucleotide', limit: maxResults };
  const identityOf = (edits: number) => (100 * (searchQuery.length - edits)) / searchQuery.length;
  const results: SearchResult[] = [];

  for (const record of records) {
    const seq = record.alignedSequence || record.sequence;
    if (!seq) continue;
    const L = seq.length;

    if (strand === 'both' || strand === 'fwd') {
      const { ungapped, map } = removeGapsWithMap(seq);
      for (const match of findApproximateMatches(searchQuery, ungapped, maxEdits, options)) {
        const { start, end } = mapUngappedRangeToAligned(map, match.start, match.end);
        results.push({
          start,
          end,
          sequence: seq.substring(start, end),
          recordId: record.id,
          strand: 1,
          edits: match.edits,
          identity: identityOf(match.edits),
          segments: getNonGapSegments(seq, start, end),
        });
      }
    }

    if (!isProtein && (strand === 'both' || strand === 'rev')) {
      const rcSeq = reverseComplement(seq, record.moleculeType ?? (moleculeType === 'rna' ? 'rna' : detectMoleculeType(seq)));
      const { ungapped, map } = removeGapsWithMap(rcSeq);
      // Rightmost in the reverse complement is leftmost on the forward strand, matching the final ranking.
      for (const match of findApproximateMatches(searchQuery, ungapped, maxEdits, { ...options, fromEnd: true })) {
        const rcRange = mapUngappedRangeToAligned(map, match.start, match.end);
        const start = L - rcRange.end;
        const end = L - rcRange.start;
        results.push({
          start,
          end,
          sequence: seq.substring(start, end),
          recordId: record.id,
          strand: -1,
          edits: match.edits,
          identity: identityOf(match.edits),
          segments: getNonGapSegments(seq, start, end),
        });
      }
    }
  }

  results.sort((a, b) => (a.edits ?? 0) - (b.edits ?? 0) || a.start - b.start);
  return results.slice(0, maxResults);
}

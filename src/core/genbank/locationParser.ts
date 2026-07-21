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
 *   A join() crosses the origin when its first segment starts *after* its last
 *   segment ends AND some segment begins at the origin (0-based start 0). The
 *   origin requirement is what separates a genuine wrap — contiguous around the
 *   origin, so it must include base 1 — from a scattered trans-splice
 *   (e.g. rps12), which is also out-of-order but whose parts sit mid-genome.
 *   For a genuine wrap:
 *     - `start` is set to the first segment's start (high number)
 *     - `end`   is set to the last  segment's end   (low  number)
 *   so that callers can detect circularity by checking `start > end`; a
 *   scattered join gets the ordinary linear envelope (min start … max end).
 *
 *   Accepted limitation: without the genome length, a genuine origin wrap whose
 *   low part does not begin at base 1 (base 1 falling inside an intron) is
 *   indistinguishable from a scattered join and is treated as linear. This is
 *   near-impossible in real annotations and affects glyph layout only.
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

/** Splits a join/order element list on commas that are not inside nested parens. */
function splitTopLevelCommas(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of list) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** Parses a single coordinate element (`n..m`, `n^m`, or `n`) to a half-open range. */
function parseCoord(el: string): { start: number; end: number } {
  const pair = el.match(/(\d+)(?:\.\.|\^)(\d+)/);
  if (pair) return { start: parseInt(pair[1]) - 1, end: parseInt(pair[2]) };
  const single = el.match(/(\d+)/);
  if (single) {
    const val = parseInt(single[1]);
    return { start: val - 1, end: val };
  }
  return { start: 0, end: 0 };
}

export function parseLocation(loc: string): LocationData {
  // Strip fuzzy indicators (<, >) and whitespace
  const cleanLoc = loc.replace(/[<>\s]/g, '');

  // An outer complement(...) wrapping the whole location reverse-complements it,
  // flipping the strand of every inner segment.
  const outer = cleanLoc.match(/^complement\((.*)\)$/);
  const outerComplement = outer !== null;
  const body = outer ? outer[1] : cleanLoc;

  // join(...) / order(...) element list, else a single element.
  const listMatch = body.match(/^(?:join|order)\((.*)\)$/);
  const elements = listMatch ? splitTopLevelCommas(listMatch[1]) : [body];

  let anyInnerComplement = false;
  const parsed = elements.map(el => {
    const inner = el.match(/^complement\((.*)\)$/);
    if (inner) anyInnerComplement = true;
    const elementStrand: 1 | -1 = inner ? -1 : 1;
    const effective: 1 | -1 =
      outerComplement ? (elementStrand === 1 ? -1 : 1) : elementStrand;
    return { ...parseCoord(inner ? inner[1] : el), strand: effective };
  });

  const strands = parsed.map(p => p.strand);
  const mixedStrand = strands.some(s => s !== strands[0]);

  // Per-segment orientation (each segment reverse-complemented on its own, in
  // join order) is required whenever the strands differ, OR when the
  // complements are inner — join(complement(a),complement(b)) means
  // rc(a) then rc(b), which the whole-feature path would reverse. An OUTER
  // complement(join(...)) is the historical uniform case and stays whole-feature.
  const usePerSegment = mixedStrand || (anyInnerComplement && !outerComplement);

  let segments: FeatureSegment[];
  let strand: 1 | -1;

  if (usePerSegment) {
    // Preserve each segment's own strand; the parent strand is the majority
    // (ties resolve to +1). extractCodingSequence orients each segment itself.
    segments = parsed.map(p => ({ start: p.start, end: p.end, strand: p.strand }));
    strand = strands.filter(s => s === -1).length > strands.length / 2 ? -1 : 1;
  } else {
    // Uniform strand with no inner complement: keep the historical shape (no
    // per-segment strand); the whole coding sequence is reverse-complemented
    // downstream when strand = -1.
    segments = parsed.map(p => ({ start: p.start, end: p.end }));
    strand = strands[0] ?? 1;
  }

  let start = 0;
  let end = 0;

  if (segments.length > 0) {
    const firstStart = segments[0].start;
    const lastEnd = segments[segments.length - 1].end;
    const minStart = Math.min(...segments.map(s => s.start));

    // Origin wrap vs. scattered trans-splice: a genuine wrap is contiguous
    // around the origin, so it includes base 1 (minStart === 0); a scattered
    // join is also descending but sits mid-genome. See the file header.
    if (segments.length > 1 && firstStart > lastEnd && minStart === 0) {
      // Keep start > end to signal wrap-around to callers
      start = firstStart;
      end = lastEnd;
    } else {
      // Linear: envelope is min start … max end
      start = minStart;
      end = Math.max(...segments.map(s => s.end));
    }
  }

  return { segments, strand, start, end };
}

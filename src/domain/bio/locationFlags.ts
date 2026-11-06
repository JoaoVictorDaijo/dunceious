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

import type { BioFeature, FeatureSegment } from './types';

/**
 * `order()` (INSDC FT 11.4 §3.4.2.2): nothing is implied about joining the intervals (LOC-2).
 * The raw text answers only for features loaded before `operator` existed.
 */
export function isOrderLocation(feature: Pick<BioFeature, 'operator' | 'locationString'>): boolean {
  if (feature.operator) return feature.operator === 'order';
  return /\border\(/.test(feature.locationString ?? '');
}

/**
 * The intervals form one sequence of this record (LOC-1): more than one segment under `join`, never
 * `order`, and none in another entry. Every reader that connects, concatenates, translates or reads
 * frameshifts across intervals asks this, not the segment count.
 */
export function isJoinedLocation(feature: Pick<BioFeature, 'operator' | 'segments' | 'locationString' | 'remoteParts'>): boolean {
  return (feature.segments?.length ?? 0) > 1 && !isOrderLocation(feature) && !feature.remoteParts?.length;
}

/** One interval, or intervals under `join`, all in this record: the location defines one sequence (LOC-7). */
export function definesOneSequence(feature: Pick<BioFeature, 'operator' | 'segments' | 'locationString' | 'remoteParts'>): boolean {
  if (feature.remoteParts?.length) return false;
  return (feature.segments?.length ?? 0) <= 1 || isJoinedLocation(feature);
}

/** An INSDC `n^n+1` site (LOC-5): zero bases at the boundary `start`, which must equal `end`. */
export function isBetweenBasesSite(feature: Pick<BioFeature, 'betweenBases' | 'start' | 'end'>): boolean {
  return feature.betweenBases === true && feature.start === feature.end;
}

/**
 * An outer `complement()` around a `join()`/`order()` whose top-level elements include a
 * `complement()`: the parser stores its intervals in evaluation order (reversed), not as written
 * (INSDC FT 11.4 §3.4.2.2). Reads the elements as `parseLocation` does, so both agree on the form.
 */
export function isNestedComplementLocation(feature: Pick<BioFeature, 'locationString'>): boolean {
  const list = (feature.locationString ?? '').replace(/[<>\s]/g, '').match(/^complement\((?:join|order)\((.*)\)\)$/);
  if (!list) return false;
  let depth = 0;
  let element = '';
  for (const ch of `${list[1]},`) {
    if (ch === ',' && depth === 0) {
      if (/^complement\(.*\)$/.test(element)) return true;
      element = '';
      continue;
    }
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    element += ch;
  }
  return false;
}

/** `<` or `>` (INSDC FT 11.4 §3.4.2.1) on any interval end: that end lies beyond its base (LOC-4). */
export function isPartialLocation(feature: Pick<BioFeature, 'segments'>): boolean {
  return feature.segments?.some(segment => segment.partialStart || segment.partialEnd) ?? false;
}

/**
 * The intervals in the order the location is evaluated (INSDC FT 11.4 §3.4.2.2), each with the
 * strand it is read on. The parser stores per-strand intervals in evaluation order already; a
 * whole-feature `complement(join(...))` keeps them as written, so it is read in reverse.
 */
function evaluatedIntervals(feature: Partial<Pick<BioFeature, 'strand' | 'segments'>>): { segment: FeatureSegment; strand: 1 | -1 }[] {
  const segments = feature.segments ?? [];
  const strand = feature.strand ?? 1;
  const perSegment = segments.some(segment => segment.strand !== undefined);
  const ordered = !perSegment && strand === -1 ? [...segments].reverse() : segments;
  return ordered.map(segment => ({ segment, strand: segment.strand ?? strand }));
}

/**
 * Whether the 5′ end of the sequence a location defines is partial: the marker on the interval read
 * first, `<` on its start when read forward or `>` on its end when complemented.
 */
export function isFivePrimePartialLocation(feature: Partial<Pick<BioFeature, 'strand' | 'segments'>>): boolean {
  const first = evaluatedIntervals(feature)[0];
  return !!first && !!(first.strand === 1 ? first.segment.partialStart : first.segment.partialEnd);
}

/**
 * Whether the 3′ end is partial: the marker on the interval translated last, `>` on its end when
 * read forward or `<` on its start when complemented. A marker on any other end leaves the 3′ end
 * complete, as the NCBI validator (table2asn 1.29.324) reads it.
 */
export function isThreePrimePartialLocation(feature: Partial<Pick<BioFeature, 'strand' | 'segments'>>): boolean {
  const last = evaluatedIntervals(feature).at(-1);
  return !!last && !!(last.strand === 1 ? last.segment.partialEnd : last.segment.partialStart);
}

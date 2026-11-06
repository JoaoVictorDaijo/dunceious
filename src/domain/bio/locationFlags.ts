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

import type { BioFeature } from './types';

// The structured location drops `<`/`>`, so the partial flags come from the raw INSDC text, which
// an edited feature no longer carries.
// FIXME(#226): read the partial ends from the parsed location once the parser keeps them.

/**
 * `order()` (INSDC FT 11.4 §3.4.2.2): nothing is implied about joining the intervals (LOC-2).
 * The raw text answers only for features loaded before `operator` existed.
 */
export function isOrderLocation(feature: Pick<BioFeature, 'operator' | 'locationString'>): boolean {
  if (feature.operator) return feature.operator === 'order';
  return /\border\(/.test(feature.locationString ?? '');
}

/**
 * The intervals form one sequence (LOC-1): more than one segment under `join`, never `order`.
 * Every reader that connects, concatenates, translates or reads frameshifts across intervals
 * asks this, not the segment count.
 */
export function isJoinedLocation(feature: Pick<BioFeature, 'operator' | 'segments' | 'locationString'>): boolean {
  return (feature.segments?.length ?? 0) > 1 && !isOrderLocation(feature);
}

/** One interval, or intervals under `join`: the location defines one sequence (LOC-7). */
export function definesOneSequence(feature: Pick<BioFeature, 'operator' | 'segments' | 'locationString'>): boolean {
  return (feature.segments?.length ?? 0) <= 1 || isJoinedLocation(feature);
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

/** `<` or `>` (INSDC FT 11.4 §3.4.2.1): an end lies beyond the stated base (LOC-4). */
export function isPartialLocation(feature: Pick<BioFeature, 'locationString'>): boolean {
  return /[<>]/.test(feature.locationString ?? '');
}

/** One interval of a location in translation order, with the strand it is read on. */
interface EvaluatedInterval { strand: 1 | -1; startPartial: boolean; endPartial: boolean }

function splitTopLevel(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of list) {
    if (ch === ',' && depth === 0) {
      out.push(current);
      current = '';
      continue;
    }
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    current += ch;
  }
  out.push(current);
  return out;
}

/**
 * INSDC FT 11.4 §3.4.2.2: `complement()` reverses the order of what it encloses and reads it on
 * the other strand; `join()`/`order()` keep their elements in the order written.
 */
function evaluateIntervals(text: string, strand: 1 | -1): EvaluatedInterval[] {
  const operator = text.match(/^(complement|join|order)\((.*)\)$/);
  if (operator?.[1] === 'complement') return evaluateIntervals(operator[2], strand === 1 ? -1 : 1).reverse();
  if (operator) return splitTopLevel(operator[2]).flatMap(element => evaluateIntervals(element, strand));
  const [first, last = first] = text.replace(/^[^:]*:/, '').split(/\.\.|\^/);
  return [{ strand, startPartial: first.includes('<'), endPartial: last.includes('>') }];
}

/**
 * Whether the 3′ end of the sequence a location defines is partial (INSDC FT 11.4 §3.4.2.1): the
 * marker on the interval translated last, `>` on its end when read forward or `<` on its start
 * when complemented. A marker on any other end leaves the 3′ end complete. False without the raw
 * location text (#226).
 */
export function isThreePrimePartialLocation(feature: Pick<BioFeature, 'locationString'>): boolean {
  const text = (feature.locationString ?? '').replace(/\s/g, '');
  if (!text) return false;
  const terminal = evaluateIntervals(text, 1).at(-1);
  if (!terminal) return false;
  return terminal.strand === 1 ? terminal.endPartial : terminal.startPartial;
}

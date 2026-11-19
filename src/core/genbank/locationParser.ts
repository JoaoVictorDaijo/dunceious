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

/**
 * Parses GenBank feature location strings into structured coordinate data.
 *
 * Supported location forms:
 *   - Simple range:           1..100
 *   - Between-base site:      50^51 (zero length at boundary 50; 1000^1 is kept as boundary 1000,
 *                             valid only when the record is circular and 1000 bases long)
 *   - Single position:        42
 *   - Complement:             complement(1..100)
 *   - Join (linear):          join(1..10,21..30)
 *   - Order:                  order(1..3,11..13) – same segments as join; `operator` tells them apart
 *   - Join (circular wrap):   join(2427..3323,1..1758)  – first segment START > last segment END
 *   - Nested complement:      complement(join(1..10,21..30))
 *   - Partial ends (</>):     <1..>100  (`partialStart`/`partialEnd` on the interval they mark)
 *
 * All coordinates are converted to 0-based half-open intervals [start, end).
 *
 * Circular wrap-around detection:
 *   A join() crosses the origin when its first interval, as written, starts
 *   *after* its last written interval ends AND some interval begins at the
 *   origin (0-based start 0). A nested outer complement stores its segments in
 *   evaluation order, so the test always reads the written order. The
 *   origin requirement is what separates a genuine wrap — contiguous around the
 *   origin, so it must include base 1 — from a scattered trans-splice
 *   (e.g. rps12), which is also out-of-order but whose parts sit mid-genome.
 *   The shared envelope uses the first written descent to cover intervals on both sides
 *   of an inferred wrap (LOC-6 in docs/standards/locations.md).
 */

import type { FeatureSegment, LocationOperator, RemotePart } from '@/src/domain/bio/types';
import type { LocationRecord } from '@/src/domain/bio/featureParts';
import { featureEnvelope } from '@/src/domain/bio/featureEnvelope';
import { maskProteinBondLocations, proteinBondEndpoints } from '@/src/domain/bio/proteinBond';

export interface LocationData {
  segments: FeatureSegment[];
  strand: 1 | -1;
  /** 0-based start.  For circular wrap-arounds, start > end. */
  start: number;
  /** 0-based end (exclusive). */
  end: number;
  operator?: LocationOperator;
  betweenBases?: true;
  /** Written position of each stored segment in evaluation order. */
  writtenOrder?: number[];
  remoteParts?: RemotePart[];
}

/**
 * The boundary of an `n^m` site: n^n+1, or the circular `length^1`. Whether `n^1`
 * fits the record is checked on import (#298), which refuses every site that does not.
 */
function siteBoundary(location: string): number | null {
  const site = location.match(/^(\d+)\^(\d+)$/);
  if (!site) return null;
  const [n, m] = [parseInt(site[1]), parseInt(site[2])];
  return m === n + 1 || (m === 1 && n >= 1) ? n : null;
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
  out.push(cur);
  return out;
}

/** One interval as evaluated: the strand it is read on and its position in the written text. */
type Interval = FeatureSegment & { strand: 1 | -1; written: number; accession?: string };

/**
 * INSDC FT 11.4 §3.4.2.2 at any depth: `complement()` reverses what it encloses and reads it on the
 * other strand; `join()`/`order()` keep their elements in written order. Intervals are numbered in
 * the order the text writes them.
 */
function evaluate(text: string, strand: 1 | -1, counter: { next: number }): Interval[] {
  const operator = text.match(/^(complement|join|order)\((.*)\)$/);
  if (operator?.[1] === 'complement') return evaluate(operator[2], strand === 1 ? -1 : 1, counter).reverse();
  if (operator) return splitTopLevelCommas(operator[2]).flatMap(element => evaluate(element, strand, counter));
  // §3.4.2.1(e): `accession.version:` makes the descriptor apply to that entry's sequence.
  const remote = text.match(/^([^():,]+):(.+)$/);
  const descriptor = remote ? remote[2] : text;
  return [{ ...parseCoord(descriptor), strand, written: counter.next++, ...(remote && { accession: remote[1] }) }];
}

/** Parses a single coordinate element (`n..m`, `n^m`, or `n`) to a half-open range. */
function parseCoord(el: string): Omit<FeatureSegment, 'strand'> {
  // INSDC FT 11.4 §3.4.2.1: '<' marks the start number, '>' the end number (LOC-4).
  const marks = (before: string, after: string) => ({
    ...(before === '<' && { partialStart: true as const }),
    ...(after === '>' && { partialEnd: true as const }),
  });
  const boundary = siteBoundary(el);
  if (boundary !== null) return { start: boundary, end: boundary };
  const pair = el.match(/^([<>]?)(\d+)\.\.([<>]?)(\d+)$/);
  if (pair) return { start: Number(pair[2]) - 1, end: Number(pair[4]), ...marks(pair[1], pair[3]) };
  const single = el.match(/^([<>]?)(\d+)$/);
  if (single) {
    const val = Number(single[2]);
    return { start: val - 1, end: val, ...marks(single[1], single[1]) };
  }
  // Import validation (#298) refuses unreadable text; nothing here invents an interval for it.
  throw new Error(`Unreadable location: ${el}`);
}

function locationOperator(text: string): LocationOperator | undefined {
  const match = text.match(/^(complement|join|order)\((.*)\)$/);
  if (!match) return undefined;
  return match[1] === 'complement' ? locationOperator(match[2]) : match[1] as LocationOperator;
}

export function parseLocation(loc: string, record?: LocationRecord, protein = false): LocationData {
  const cleanLoc = loc.replace(/\s/g, '');
  const bond = protein ? proteinBondEndpoints(cleanLoc) : undefined;
  if (bond) {
    // The first residue anchors the glyph. The retained location text carries the bond itself.
    const segment = { start: bond[0] - 1, end: bond[0] };
    return { segments: [segment], strand: 1, ...segment };
  }
  const masked = protein ? maskProteinBondLocations(cleanLoc) : cleanLoc;
  if (masked !== cleanLoc) {
    parseLocation(masked, record);
    return { segments: [], start: 0, end: 0, strand: 1 };
  }

  const outer = cleanLoc.match(/^complement\((.*)\)$/);
  const outerComplement = outer !== null;
  const body = outer ? outer[1] : cleanLoc;

  const listMatch = body.match(/^(join|order)\((.*)\)$/);
  const operator = locationOperator(cleanLoc);

  const boundary = listMatch ? null : siteBoundary(body);
  if (boundary !== null) {
    const segment = { start: boundary, end: boundary };
    return { segments: [segment], strand: outerComplement ? -1 : 1, ...segment, betweenBases: true };
  }

  const all = evaluate(cleanLoc, 1, { next: 0 });
  const local = all.filter(interval => interval.accession === undefined);
  // Local intervals are numbered among themselves, so `writtenOrder` and the origin test see them
  // alone; remote parts keep their place among all intervals through `index` below.
  const localRank = new Map([...local].sort((a, b) => a.written - b.written).map((interval, rank) => [interval, rank]));
  const evaluated = local.map(interval => ({ ...interval, written: localRank.get(interval)! }));
  const written = [...evaluated].sort((a, b) => a.written - b.written);
  const strands = all.map(p => p.strand);
  const mixedStrand = strands.some(s => s !== strands[0]);

  // A complement() below the outermost one, or mixed strands, needs per-interval orientation, and
  // the intervals are stored in evaluation order (INSDC FT 11.4 §3.4.2.2). Otherwise the historical
  // shape holds: the intervals as written, one strand on the feature, and the whole sequence
  // reverse-complemented downstream when that strand is -1.
  const usePerSegment = body.includes('complement(') || mixedStrand;
  const strip = ({ strand: _strand, written: _written, accession: _accession, ...part }: Interval): FeatureSegment => part;

  let segments: FeatureSegment[];
  let strand: 1 | -1;
  let writtenOrder: number[] | undefined;
  // The order every interval is stored in, remote parts included: evaluation order per strand, else as written.
  const stored = usePerSegment ? all : [...all].sort((a, b) => a.written - b.written);
  const remoteParts: RemotePart[] = stored.flatMap((interval, index) => interval.accession === undefined ? [] : [{
    ...strip(interval), accession: interval.accession, strand: interval.strand, index,
  }]);

  if (usePerSegment) {
    // The parent strand is the majority (ties resolve to +1).
    segments = evaluated.map(interval => ({ ...strip(interval), strand: interval.strand }));
    strand = strands.filter(s => s === -1).length > strands.length / 2 ? -1 : 1;
    // An outer complement can leave the local order unchanged after its inner reversals.
    if (outerComplement || evaluated.some((interval, i) => interval.written !== i)) writtenOrder = evaluated.map(interval => interval.written);
  } else {
    segments = written.map(strip);
    strand = strands[0] ?? 1;
  }

  const { start, end } = featureEnvelope({ start: 0, end: 0, segments, writtenOrder }, record);

  return {
    segments, strand, start, end,
    ...(operator && { operator }),
    ...(writtenOrder && { writtenOrder }),
    ...(remoteParts.length > 0 && { remoteParts }),
  };
}

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
import { isNestedComplementLocation } from './locationFlags';
import { splitWrapAround, type LocationRecord } from './featureParts';

/** A permutation of 0..length-1: one written position per stored segment. */
function isWrittenOrder(order: number[] | undefined, length: number): order is number[] {
  return order?.length === length && new Set(order).size === length && order.every(i => Number.isInteger(i) && i >= 0 && i < length);
}

/**
 * Segments in the order the location writes them, which the origin-crossing geometry, frameshift
 * junctions and connectors read. The parser stores nested locations in evaluation order and records
 * the written order in `writtenOrder`. Features from before that field fall back to their text.
 */
export function writtenOrderSegments(feature: Pick<BioFeature, 'segments' | 'locationString' | 'writtenOrder'>): FeatureSegment[] | undefined {
  const segments = feature.segments;
  if (segments && isWrittenOrder(feature.writtenOrder, segments.length)) {
    const written: FeatureSegment[] = new Array(segments.length);
    feature.writtenOrder.forEach((position, i) => { written[position] = segments[i]; });
    return written;
  }
  return isNestedComplementLocation(feature) ? segments?.slice().reverse() : segments;
}

/** The written order of the segments that remain, ranked again, after the others are removed. */
export function keptWrittenOrder(order: number[] | undefined, kept: number[]): number[] | undefined {
  if (!order) return undefined;
  const positions = kept.map(i => order[i]);
  const ranked = positions.map(position => positions.filter(other => other < position).length);
  return ranked.some((position, i) => position !== i) ? ranked : undefined;
}

/** A split minus interval visits its pieces in reverse written order (INSDC FT 11.4 §3.4.2.2). */
export function expandedWrittenOrder(order: number[] | undefined, stored: FeatureSegment[], split: FeatureSegment[][]): number[] {
  let nextRank = 0;
  const ranks = split.map((): number[] => []);
  const written = stored.map((_, i) => i);
  if (isWrittenOrder(order, stored.length)) written.sort((a, b) => order[a] - order[b]);
  for (const i of written) {
    ranks[i] = split[i].map(() => nextRank++);
    if (stored[i].strand === -1) ranks[i].reverse();
  }
  return ranks.flat();
}

/** Cover both sides of a written origin join, including out-of-order interior parts (LOC-6). */
export function featureEnvelope(
  feature: Pick<BioFeature, 'start' | 'end' | 'segments' | 'writtenOrder' | 'locationString'>,
  record?: LocationRecord,
): FeatureSegment {
  const written = writtenOrderSegments(feature);
  if (!written?.length) return { start: feature.start, end: feature.end };
  if (written.length === 1) return { start: written[0].start, end: written[0].end };
  const parts = record?.isCircular
    ? written.flatMap(part => splitWrapAround(part.start, part.end, record.length))
    : written;
  if (!parts.length) return { start: feature.start, end: feature.end };

  const minStart = Math.min(...parts.map(part => part.start));
  const maxEnd = Math.max(...parts.map(part => part.end));
  const originJoin = parts[0].start > parts[parts.length - 1].end && minStart === 0;
  // An explicit wrap can leave a gap at the origin.
  if (feature.start > feature.end || originJoin) {
    const split = parts.findIndex((part, i) => i > 0 && part.start < parts[i - 1].start);
    if (split > 0) {
      const start = Math.min(...parts.slice(0, split).map(part => part.start));
      const end = Math.max(...parts.slice(split).map(part => part.end));
      if (start > end) return { start, end };
    }
  }
  return { start: minStart, end: maxEnd };
}

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
import { splitWrapAround } from './intervals';

export type FeatureGeometry = Pick<BioFeature, 'start' | 'end' | 'strand' | 'segments'> & Partial<Pick<BioFeature, 'operator' | 'betweenBases' | 'remoteParts'>>;
export type LocationRecord = { length: number; isCircular?: boolean };

export function hasPartialStrands(feature: FeatureGeometry): boolean {
  const parts = feature.segments ?? [];
  return parts.some(part => part.strand !== undefined) && parts.some(part => part.strand === undefined);
}

export function invalidLocationPart(part: Pick<FeatureSegment, 'start' | 'end'>, record: LocationRecord): boolean {
  return !Number.isInteger(part.start) || !Number.isInteger(part.end)
    || part.start < 0 || part.end < 0 || part.start > record.length || part.end > record.length
    || part.start > part.end && (!record.isCircular || part.start === record.length && part.end === 0);
}

/** INSDC FT 11.4 §3.4.2.2: preserve evaluation order, including per-part reverse wraps. */
export function featureParts(feature: FeatureGeometry, record: LocationRecord): FeatureSegment[] {
  const parts = feature.segments?.length || feature.remoteParts?.length ? feature.segments ?? [] : [{ start: feature.start, end: feature.end }];
  return parts.flatMap(part => {
    if (part.start <= part.end || !record.isCircular) return [{ ...part }];
    const split = splitWrapAround(part.start, part.end, record.length).map(span => ({ ...span, strand: part.strand,
      ...(span.start === part.start && part.partialStart && { partialStart: true as const }),
      ...(span.end === part.end && part.partialEnd && { partialEnd: true as const }),
    }));
    return part.strand === -1 ? split.reverse() : split;
  });
}

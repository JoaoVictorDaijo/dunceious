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

import type { BioFeature, FeatureSegment, GffBoundaryRange } from './types';

export type FeatureGeometry = Pick<BioFeature, 'start' | 'end' | 'strand' | 'segments'> & Partial<Pick<BioFeature, 'operator' | 'betweenBases' | 'remoteParts'>>;
export type LocationRecord = { length: number; isCircular?: boolean };

/**
 * Splits a potentially wrap-around interval `[start, end)` on a circular
 * sequence of length `seqLength` into one or two linear segments.
 *
 * A wrap-around interval is one where `start > end` (e.g., a feature that
 * spans the origin of a circular sequence).
 */
export const splitWrapAround = (
  start: number,
  end: number,
  seqLength: number
): FeatureSegment[] => {
  if (start <= end) {
    return [{ start, end }];
  }
  // Wrap-around: covers [start, seqLength) and [0, end)
  const segments: FeatureSegment[] = [];
  if (start < seqLength) segments.push({ start, end: seqLength });
  if (end > 0) segments.push({ start: 0, end });
  return segments;
};

export function hasPartialStrands(feature: FeatureGeometry): boolean {
  const parts = feature.segments ?? [];
  return parts.some(part => part.strand !== undefined) && parts.some(part => part.strand === undefined);
}

/** A remote part on the other strand makes inherited local directions interval-specific. */
export function usesIntervalStrands(feature: FeatureGeometry): boolean {
  return Boolean(feature.segments?.some(part => part.strand !== undefined)
    || feature.remoteParts?.some(part => part.strand !== feature.strand));
}

export function storedLocalParts(feature: FeatureGeometry): FeatureSegment[] | undefined {
  const parts = feature.segments;
  if (!parts || !usesIntervalStrands(feature) || parts.every(part => part.strand !== undefined)) return parts;
  return parts.map(part => ({ ...part, strand: part.strand ?? feature.strand }));
}

/** An NCBI GFF3 range can follow a retained boundary into a new coordinate frame. */
export function projectGffRange(
  range: GffBoundaryRange | undefined, boundary: number, offset: number, retained?: FeatureSegment,
): GffBoundaryRange | undefined {
  if (range?.boundary !== boundary || typeof range.limit !== 'string' || !/^\d+$/.test(range.limit)) return undefined;
  if (range.lostAtOriginSplit) return offset === 0 ? range : { ...range, boundary: boundary + offset };
  if (!retained && offset === 0) return range;
  const limit = Number(range.limit) + offset;
  if (!Number.isSafeInteger(limit) || (retained && (limit <= retained.start || limit > retained.end))) return undefined;
  return offset === 0 ? range : { boundary: boundary + offset, limit: String(limit) };
}

/** Only local intervals determine the direction a bare code break can inherit. */
export function singleLocalStrand(feature: Pick<BioFeature, 'strand' | 'segments' | 'biological'>): 1 | -1 | undefined {
  const geometry = feature.biological ?? feature;
  const parts = geometry.segments ?? [];
  const strand = parts[0]?.strand ?? geometry.strand;
  return parts.every(part => (part.strand ?? geometry.strand) === strand) ? strand : undefined;
}

export function hasMixedLocalStrands(feature: Parameters<typeof singleLocalStrand>[0]): boolean {
  return singleLocalStrand(feature) === undefined;
}

export function invalidLocationPart(part: Pick<FeatureSegment, 'start' | 'end'>, record: LocationRecord): boolean {
  return !Number.isInteger(part.start) || !Number.isInteger(part.end)
    || part.start < 0 || part.end < 0 || part.start > record.length || part.end > record.length
    || part.start > part.end && (!record.isCircular || part.start === record.length && part.end === 0);
}

/** INSDC FT 11.4 §3.4.2.2: preserve evaluation order, including per-part reverse wraps. */
export function featureParts(feature: FeatureGeometry, record: LocationRecord): FeatureSegment[] {
  const parts = feature.segments?.length || feature.remoteParts?.length ? feature.segments ?? [] : [{ start: feature.start, end: feature.end }];
  return parts.flatMap(part => splitFeaturePart(part, record));
}

/** Keeps genomic end markers on the outer edges and explicit minus pieces in evaluation order. */
export function splitFeaturePart(part: FeatureSegment, record: LocationRecord): FeatureSegment[] {
  if (part.start <= part.end || !record.isCircular) return [{ ...part }];
  // Empty origin-side pieces have no bases; their markers belong to the surviving outer edge.
  const split = splitWrapAround(part.start, part.end, record.length).map((span, i, spans) => ({ ...span, strand: part.strand,
    ...(i === 0 && part.partialStart && { partialStart: true as const }),
    ...(i === spans.length - 1 && part.partialEnd && { partialEnd: true as const }),
    ...(i === 0 && span.start === part.start && part.gffStartRange && { gffStartRange: part.gffStartRange }),
    ...(i === spans.length - 1 && span.end === part.end && part.gffEndRange && { gffEndRange: part.gffEndRange }),
  }));
  return part.strand === -1 ? split.reverse() : split;
}

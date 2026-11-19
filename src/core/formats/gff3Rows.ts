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

import type { BioFeature, FeatureSegment, RemotePart } from '@/src/domain/bio/types';
import { projectGffRange, type LocationRecord } from '@/src/domain/bio/featureParts';

export function compareCoordinates(a: Pick<BioFeature, 'start' | 'end'>, b: Pick<BioFeature, 'start' | 'end'>): number {
  return a.start - b.start || a.end - b.end;
}

export function phaseAfter(phase: number, length: number): number {
  return ((phase - length) % 3 + 3) % 3;
}

/** Ranks address the decoded intervals, including both pieces of an extended row. */
export function decodeWrittenOrder(raw: string | undefined, length: number): number[] | undefined {
  if (raw === undefined) return undefined;
  const order = raw.split(',').map(Number);
  const valid = order.length === length && new Set(order).size === length && order.every(i => Number.isInteger(i) && i >= 0 && i < length);
  return valid ? order : undefined;
}

/** GFF3 1.26 column 5 puts an origin-crossing interval in one row's coordinate space. */
function unrollGffRow(parts: FeatureSegment[], length: number): FeatureSegment {
  if (parts.length === 1) return parts[0];
  const [high, low] = parts[0].start > parts[1].start ? parts : [parts[1], parts[0]];
  const end = low.end + length;
  const onRow = { start: high.start, end };
  const startRange = high.gffStartRange;
  const endRange = low.gffEndRange;
  const originalLimit = (range: NonNullable<FeatureSegment['gffEndRange']>, boundary: number) =>
    Number(range.limit) > onRow.start && Number(range.limit) <= onRow.end
      ? { boundary, limit: range.limit }
      : { ...range, boundary };
  return {
    ...high, end, partialEnd: low.partialEnd,
    gffStartRange: startRange?.lostAtOriginSplit ? originalLimit(startRange, high.start) : startRange,
    gffEndRange: endRange?.lostAtOriginSplit ? originalLimit(endRange, end) : projectGffRange(endRange, low.end, length),
  };
}

/**
 * INSDC writes a contiguous wrap as a join at the origin. A partial boundary,
 * remote interval or phase discontinuity at the seam belongs to a separate row.
 */
function collapseOriginSeam(
  groups: FeatureSegment[][], length: number, strand: 1 | -1, phases: string[],
  writtenOrder: number[], remote: RemotePart[],
): void {
  let offset = 0;
  const seam = groups.findIndex(([first], i) => {
    const at = offset;
    offset += groups[i].length;
    if (groups[i].length !== 1 || groups[i + 1]?.length !== 1) return false;
    const [second] = groups[i + 1];
    const explicitMinus = first.strand === -1;
    const [high, low] = explicitMinus ? [second, first] : [first, second];
    const highRank = writtenOrder[explicitMinus ? at + 1 : at];
    const lowRank = writtenOrder[explicitMinus ? at : at + 1];
    if (first.strand !== second.strand || highRank + 1 !== lowRank
        || high.end !== length || low.start !== 0 || low.end <= 0
        || high.start <= low.end || high.start >= high.end || high.partialEnd || low.partialStart
        || remote.some((part, index) => part.index - index === at + 1)) return false;
    if (phases[at] === '.') return true;
    const reverse = strand === -1 && first.strand === undefined;
    const firstIndex = reverse ? at + 1 : at;
    const nextIndex = reverse ? at : at + 1;
    const firstLength = reverse ? second.end - second.start : first.end - first.start;
    return Number(phases[nextIndex]) === phaseAfter(Number(phases[firstIndex]), firstLength);
  });
  if (seam >= 0) groups.splice(seam, 2, [...groups[seam], ...groups[seam + 1]]);
}

export function gffExportParts(
  feature: BioFeature, landmark: LocationRecord, explicitStrands: boolean,
  { split, phases, writtenOrder, remote }: {
    split: FeatureSegment[][];
    phases: string[];
    writtenOrder: number[];
    remote: RemotePart[];
  },
): { segment: FeatureSegment; phase: string }[] {
  const groups = split.filter(parts => parts.length > 0);
  if (landmark.isCircular && feature.start > feature.end) {
    collapseOriginSeam(groups, landmark.length, feature.strand, phases, writtenOrder, remote);
  }

  let offset = 0;
  return groups.map(parts => {
    const segment = unrollGffRow(parts, landmark.length);
    const phaseIndex = offset + (feature.strand === -1 && !explicitStrands ? parts.length - 1 : 0);
    offset += parts.length;
    return { segment, phase: phases[phaseIndex] };
  });
}

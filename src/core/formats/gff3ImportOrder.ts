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

import { splitWrapAround } from '@/src/domain/bio/intervals';
import { getFeatureStrand } from '@/src/domain/bio/strand';
import type { BioFeature, RemotePart } from '@/src/domain/bio/types';
import { parseLocation } from '../genbank/locationParser';
import { compareCoordinates, decodeWrittenOrder } from './gff3Rows';

export interface AnnotationRow {
  seqid: string;
  feature: BioFeature;
  rowNumber: number;
  text: string;
}

export interface GffImportNotice {
  circularEnd?: number;
  message: string;
}

const privateOrderKeys = ['insdc_interval_strands', 'insdc_written_order', 'insdc_parent_strand', 'insdc_remote'] as const;

function decodeRemoteParts(raw: string, localCount: number): RemotePart[] | undefined {
  const parts: RemotePart[] = [];
  const values = raw.split(',');
  const indexes = new Set<number>();
  for (const value of values) {
    const item = /^(\d+):(.+)$/.exec(value);
    if (!item) return undefined;
    const index = Number(item[1]);
    if (index >= localCount + values.length || indexes.has(index)) return undefined;
    try {
      const location = parseLocation(item[2]);
      const part = location.remoteParts?.[0];
      if (!part || location.remoteParts?.length !== 1 || location.segments.length
          || !Number.isSafeInteger(part.start) || !Number.isSafeInteger(part.end)
          || part.start < 0 || part.start >= part.end) return undefined;
      indexes.add(index);
      parts.push({ ...part, index });
    } catch {
      return undefined;
    }
  }
  return parts;
}

/** Private ranks address local pieces after an extended row is split at the origin. */
function acceptPrivateOrder(group: AnnotationRow[], length: number): boolean {
  const first = group[0].feature;
  const attrs = first.metadata!;
  if (group.some(({ feature }) => privateOrderKeys.some(key => feature.metadata![key] !== attrs[key]))) return false;
  if (attrs.insdc_interval_strands !== undefined && attrs.insdc_interval_strands !== 'true') return false;
  if (attrs.insdc_parent_strand !== undefined && attrs.insdc_parent_strand !== '+' && attrs.insdc_parent_strand !== '-') return false;
  const localCount = group.reduce((count, { feature }) => count + (feature.end > length
    ? splitWrapAround(feature.start, feature.end - length, length).length : 1), 0);
  const writtenOrder = decodeWrittenOrder(attrs.insdc_written_order, localCount);
  if (attrs.insdc_written_order !== undefined && !writtenOrder) return false;
  const parentOverridesStrand = attrs.insdc_interval_strands === 'true' || writtenOrder
    || group.some(({ feature }) => feature.strand !== first.strand);
  if (attrs.insdc_parent_strand !== undefined && !parentOverridesStrand) return false;
  const remoteParts = attrs.insdc_remote === undefined ? undefined : decodeRemoteParts(attrs.insdc_remote, localCount);
  if (attrs.insdc_remote !== undefined && !remoteParts) return false;
  if (writtenOrder) first.writtenOrder = writtenOrder;
  if (remoteParts) first.remoteParts = remoteParts;
  return true;
}

function sortByPart(group: AnnotationRow[]): boolean {
  const ranks = group.map(({ feature }) => {
    const rank = feature.metadata!.part;
    return /^[1-9]\d*$/.test(rank) ? Number(rank) : NaN;
  });
  if (ranks.some(rank => !Number.isSafeInteger(rank) || rank > group.length) || new Set(ranks).size !== group.length) return false;
  const ranked = group.map((row, index) => ({ row, rank: ranks[index] }));
  ranked.sort((a, b) => a.rank - b.rank).forEach(({ row }, index) => { group[index] = row; });
  return true;
}

function orderGroup(group: AnnotationRow[], length: number, warn: (message: string) => void) {
  const first = group[0].feature;
  const mixed = group.some(({ feature }) => getFeatureStrand(feature) !== getFeatureStrand(first));
  const mixedDirections = group.some(({ feature }) => feature.strand !== first.strand);
  if (group.some(({ feature }) => privateOrderKeys.some(key => feature.metadata![key] !== undefined))) {
    if (acceptPrivateOrder(group, length)) {
      return { privateOrder: true, perInterval: mixedDirections
        || first.metadata!.insdc_interval_strands === 'true' || Boolean(first.writtenOrder) };
    }
    warn('Invalid or inconsistent private ordering attributes were ignored.');
  }
  if (group.length === 1) return { perInterval: false };
  if (sortByPart(group)) return { perInterval: mixedDirections || first.strand === -1 };
  if (mixed) return { perInterval: mixedDirections };

  const steps = group.slice(1).map((row, i) => compareCoordinates(group[i].feature, row.feature));
  if (steps.some(step => step < 0) && steps.some(step => step > 0)) {
    warn('Row order is ambiguous and was taken from the file.');
    return { perInterval: first.strand === -1 };
  }
  const coordinateOrder = [...group].sort((a, b) => compareCoordinates(a.feature, b.feature)
    || (a.text < b.text ? -1 : a.text > b.text ? 1 : 0));
  const evaluationOrder = first.strand === -1 ? [...coordinateOrder].reverse() : coordinateOrder;
  if (group.some(({ feature }) => feature.end > length) && group.some(({ feature }) => feature.end <= length)
      && evaluationOrder.some((row, i) => row !== group[i])) {
    warn('Rows were read in strand-relative coordinate order across the origin. File order may give a different sequence or translation.');
  }
  return { coordinateOrder, perInterval: false };
}

/** GFF3 1.26 groups by ID and extends only the crossing row's end. Sort intact rows to
 * keep their phases and bounds, skipping coordinate sorting for validated private order,
 * NCBI annotwriter part ranks, mixed strands, and non-monotonic file order. */
export function orderAnnotationRows(rows: AnnotationRow[], lengths: Map<string, number>, circular: Set<string>,
  notices: Record<string, GffImportNotice[]>) {
  const byId = new Map<string, AnnotationRow[]>();
  const groups: AnnotationRow[][] = [];
  for (const row of rows) {
    const id = row.feature.metadata!.ID;
    const key = id ? JSON.stringify([row.seqid, id]) : undefined;
    const existing = key === undefined ? undefined : byId.get(key);
    if (existing) existing.push(row);
    else {
      const group = [row];
      groups.push(group);
      if (key !== undefined) byId.set(key, group);
    }
  }
  return groups.flatMap(group => {
    const { seqid, feature } = group[0];
    const length = circular.has(seqid) ? lengths.get(seqid)! : Infinity;
    const { coordinateOrder, perInterval, privateOrder } = orderGroup(group, length, message => {
      (notices[seqid] ??= []).push({ message: `${feature.name}: ${message}` });
    });
    return (coordinateOrder ?? group).map(row => ({ ...row, perInterval, privateOrder }));
  });
}

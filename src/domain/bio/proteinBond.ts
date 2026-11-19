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

/** NCBI Seq-bond uses residue positions and writes a second endpoint only when available. */
export function proteinBondEndpoints(location: string): [number] | [number, number] | undefined {
  const match = /^bond\((\d+)(?:,(\d+))?\)$/.exec(location);
  if (!match) return undefined;
  const first = Number(match[1]);
  return match[2] === undefined ? [first] : [first, Number(match[2])];
}

export function containsBond(location: string): boolean {
  return location.replace(/\s/g, '').includes('bond(');
}

export function undrawnProteinBondGeometry() {
  return { start: 0, end: 0, strand: 1 as const, segments: [] as FeatureSegment[] };
}

export function isUndrawnProteinBond(feature: Pick<BioFeature, 'start' | 'end' | 'segments' | 'locationString'>): boolean {
  const location = feature.locationString;
  if (feature.segments?.length || location === undefined || !containsBond(location)) return false;

  // A trimmed wrap can make an opaque bond look local. Its explicit empty geometry preserves that decision.
  return !proteinBondEndpoints(location) || (feature.segments?.length === 0 && feature.start === 0 && feature.end === 0);
}

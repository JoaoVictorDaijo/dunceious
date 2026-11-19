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

/** NCBI Seq-bond uses residue positions and writes a second endpoint only when available. */
export function proteinBondEndpoints(location: string): [number] | [number, number] | undefined {
  const match = /^bond\((\d+)(?:,(\d+))?\)$/.exec(location.replace(/\s/g, ''));
  if (!match) return undefined;
  const first = Number(match[1]);
  return match[2] === undefined ? [first] : [first, Number(match[2])];
}

export function containsBond(location: string): boolean {
  return location.replace(/\s/g, '').includes('bond(');
}

export function isUndrawnProteinBond(feature: Pick<BioFeature, 'segments' | 'locationString'>): boolean {
  const location = feature.locationString;
  return !feature.segments?.length && location !== undefined
    && containsBond(location) && !proteinBondEndpoints(location);
}

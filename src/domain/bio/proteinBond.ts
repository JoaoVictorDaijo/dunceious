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

const position = String.raw`(?:[<>]?\d+|-?\d+\^\d+|\(-?\d+\.\d+\)\.\.\(\d+\.\d+\))`;
const point = String.raw`(?:[A-Za-z]\w*\.\d+:)?(?:${position}|complement\(${position}\))`;
const bondLocation = new RegExp(String.raw`(^|[(:,])bond\(${point}(?:,${point})?\)(?=$|[,)])`, 'g');

/** NCBI flat-file bonds are point locations. Mask them only to validate the enclosing syntax. */
export function maskProteinBondLocations(location: string): string {
  return location.replace(bondLocation, (_, prefix: string) => prefix + '1');
}

export function isUndrawnProteinBond(feature: Pick<BioFeature, 'segments' | 'locationString'>): boolean {
  const location = feature.locationString;
  return !feature.segments?.length && location !== undefined
    && /\bbond\s*\(/.test(location) && !proteinBondEndpoints(location);
}

/*
 * Dunceious
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

/** Authoritative segment bounds retain the high/low order of circular joins. */
export function featureEnvelope(feature: BioFeature): FeatureSegment {
  // Nested outer complements store parts in evaluation order. Recover written
  // order so orientation cannot turn a linear region into an origin wrap.
  const nestedComplement = /^complement\((?:join|order)\(.*\bcomplement\(/.test(
    feature.locationString?.replace(/\s/g, '') ?? '',
  );
  const parts = nestedComplement ? feature.segments?.slice().reverse() : feature.segments;
  if (!parts?.length) return { start: feature.start, end: feature.end };
  if (parts.length === 1) return { start: parts[0].start, end: parts[0].end };

  const minStart = Math.min(...parts.map(part => part.start));
  const maxEnd = Math.max(...parts.map(part => part.end));
  const originJoin = parts[0].start > parts[parts.length - 1].end && minStart === 0;
  if (feature.start > feature.end || originJoin) {
    const split = parts.findIndex((part, i) => i > 0 && part.start < parts[i - 1].start);
    if (split > 0) {
      return {
        start: Math.min(...parts.slice(0, split).map(part => part.start)),
        end: Math.max(...parts.slice(split).map(part => part.end)),
      };
    }
  }
  return { start: minStart, end: maxEnd };
}

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

import { parseLocation } from '@/src/core/genbank/locationParser';
import { describe, expect, it } from 'vitest';
import { featureEnvelope } from '../featureEnvelope';
import type { BioFeature } from '../types';

const feature = (patch: Partial<BioFeature>): BioFeature => ({
  type: 'gene', name: 'joined', start: 100, end: 200, strand: 1, ...patch,
});

describe('featureEnvelope', () => {
  it('uses extrema for unsorted ordinary parts', () => {
    expect(featureEnvelope(feature({ segments: [{ start: 180, end: 900 }, { start: 100, end: 130 }] })))
      .toEqual({ start: 100, end: 900 });
  });

  it('preserves declared circular intent when the parts leave a gap at the origin', () => {
    expect(featureEnvelope(feature({ start: 80, end: 20,
      segments: [{ start: 70, end: 85 }, { start: 90, end: 95 }, { start: 5, end: 15 }, { start: 18, end: 30 }] })))
      .toEqual({ start: 70, end: 30 });
  });

  it('derives an origin-crossing join from its parts even with a stale linear envelope', () => {
    expect(featureEnvelope(feature({ start: 0, end: 100,
      segments: [{ start: 98, end: 100 }, { start: 0, end: 4 }] })))
      .toEqual({ start: 98, end: 4 });
  });

  it.each(['join', 'order'])('uses written order for nested complement(%s) envelopes', operator => {
    const linear = feature({ start: 0, end: 6,
      locationString: ` complement( ${operator}( complement(<1..2), 5..>6 ) ) `,
      segments: [{ start: 4, end: 6, strand: -1 }, { start: 0, end: 2, strand: 1 }] });
    expect(featureEnvelope(linear)).toEqual({ start: 0, end: 6 });
    expect(featureEnvelope(feature({ start: 4, end: 2,
      locationString: `complement(${operator}(complement(5..6),1..2))`,
      segments: [{ start: 0, end: 2, strand: -1 }, { start: 4, end: 6, strand: 1 }] })))
      .toEqual({ start: 4, end: 2 });
  });

  // #241: the written order travels on the feature, so an edit that clears the location text keeps
  // the linear envelope of complement(join(complement(1..3),10..12)), not a false origin crossing.
  it('keeps a nested feature linear after an edit clears its location text', () => {
    const parsed = parseLocation('complement(join(complement(1..3),10..12))');
    expect(featureEnvelope(feature({ start: parsed.start, end: parsed.end, segments: parsed.segments,
      writtenOrder: parsed.writtenOrder }))).toEqual({ start: 0, end: 12 });
  });

  it('preserves a single wrapping segment', () => {
    expect(featureEnvelope(feature({ segments: [{ start: 90, end: 10 }] }))).toEqual({ start: 90, end: 10 });
  });

  it.each([undefined, []])('keeps the envelope without authoritative parts: %s', segments => {
    expect(featureEnvelope(feature({ segments }))).toEqual({ start: 100, end: 200 });
  });
});

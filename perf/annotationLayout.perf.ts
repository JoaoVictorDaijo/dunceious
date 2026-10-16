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

import { describe, expect, it } from 'vitest';
import type { SeqRecord } from '../src/domain/bio/types';
import { computeRecordLayouts } from '../src/app/viewer/layout';
import { bench } from './perfUtils';

const opts = { showAnnotations: true, translationVisible: false, showTracks: false };
function record(count: number): SeqRecord {
  return { id: 'packing', name: 'packing', sequence: 'A'.repeat(count * 30),
    features: Array.from({ length: count }, (_, index) => ({
      name: String(index), type: 'gene', start: index * 30, end: index * 30 + 10, strand: 1 as const,
    })) };
}

describe('annotation packing scaling', () => {
  it('does not revisit annotation coordinates on display toggles', () => {
    const input = record(1000);
    let coordinateReads = 0;
    input.features = input.features.map(feature => ({ ...feature,
      get end() { coordinateReads++; return feature.end; },
    }));
    const layout = computeRecordLayouts([input], opts)[0];
    expect(layout.placements).toHaveLength(1000);
    expect(layout.placements.every(placement => placement.row === 0)).toBe(true);
    coordinateReads = 0;
    computeRecordLayouts([input], { ...opts, basesVisible: true });
    expect(coordinateReads).toBe(0);
  });

  it.each([1000, 2000, 4000, 8000])('measures fresh and reused %i-feature records', count => {
    const input = record(count);
    const fresh = bench(() => computeRecordLayouts([{ ...input }], opts), { warmup: 3, iterations: 7 });
    computeRecordLayouts([input], opts);
    const reused = bench(() => computeRecordLayouts([input], { ...opts, basesVisible: true }), { warmup: 3, iterations: 7 });
    console.log(JSON.stringify({ count, fresh, reused }));
  });
});

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

import { describe, it, expect } from 'vitest';
import { computeBrokenFeatureMap } from '../cds';
import type { BioFeature } from '@/src/domain/bio/types';

const cds = (over: Partial<BioFeature>): BioFeature => ({
  type: 'CDS',
  name: 'x',
  start: 0,
  end: 0,
  strand: 1,
  ...over,
});

describe('computeBrokenFeatureMap', () => {
  it('flags a CDS with an internal (early) stop as broken', () => {
    // ATG TAG GAG — the TAG stop is not the last codon.
    const map = computeBrokenFeatureMap([cds({ start: 0, end: 9 })], 'ATGTAGGAG');
    expect(map.get('0-9-1')).toBe(true);
  });

  it('does not flag a valid CDS', () => {
    const map = computeBrokenFeatureMap([cds({ start: 0, end: 9 })], 'ATGCCCGAG');
    expect(map.get('0-9-1')).toBe(false);
  });

  it('honours the feature /transl_table so a mitochondrial TGA is not a false stop', () => {
    // TGG TGA AAA — internal TGA is a stop under the standard code, Trp under table 2.
    const seq = 'TGGTGAAAA';
    expect(computeBrokenFeatureMap([cds({ start: 0, end: 9 })], seq).get('0-9-1')).toBe(true);
    const mito = cds({ start: 0, end: 9, metadata: { transl_table: '2' } });
    expect(computeBrokenFeatureMap([mito], seq).get('0-9-1')).toBe(false);
  });

  it('ignores non-CDS features', () => {
    const map = computeBrokenFeatureMap([cds({ type: 'gene', start: 0, end: 9 })], 'ATGTAGGAG');
    expect(map.size).toBe(0);
  });
});

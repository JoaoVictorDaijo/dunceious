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
import type { BioFeature, SeqRecord } from '@/src/domain/bio/types';
import { featureIndexOf } from '../featureIndex';

const feature = (name: string, start: number, end: number): BioFeature => ({ type: 'gene', name, start, end, strand: 1 }) as BioFeature;
const record = (id: string, features: BioFeature[]): SeqRecord =>
  ({ id, name: id, sequence: 'ACGTACGTAC', features }) as SeqRecord;

const own = [feature('a', 0, 2), feature('b', 3, 5), feature('c', 6, 9)];
const records = [record('x', []), record('r', own)];
// The viewer's aligned copies: equal content, different objects, same order.
const transposed = [record('r', own.map(f => ({ ...f, start: f.start + 2, end: f.end + 2 })))];

describe('featureIndexOf', () => {
  it('trusts the index a hub copy carries', () => {
    const hubCopy = { ...own[2], index: 2 } as BioFeature & { index: number };
    expect(featureIndexOf(records, transposed, 'r', hubCopy)).toBe(2);
  });

  it('finds a feature from the record itself by identity', () => {
    expect(featureIndexOf(records, transposed, 'r', own[1])).toBe(1);
  });

  it('resolves a transposed copy by its position in the aligned record', () => {
    expect(featureIndexOf(records, transposed, 'r', transposed[0].features[2])).toBe(2);
  });

  it('returns -1 for a feature in neither list or an unknown record', () => {
    expect(featureIndexOf(records, transposed, 'r', feature('b', 3, 5))).toBe(-1);
    expect(featureIndexOf(records, transposed, 'missing', own[0])).toBe(-1);
  });
});

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
import type { SeqRecord, BioFeature } from '@/src/domain/bio/types';
import { featureFocusTarget, isFocusedSelection } from '../focusTarget';

const targetFor = (r: SeqRecord, feature: BioFeature) => featureFocusTarget({ ...r, features: [feature] }, feature);

const record = (over: Partial<SeqRecord>): SeqRecord =>
  ({ id: 'r', name: 'r', sequence: 'ACGTACGT', features: [], ...over }) as SeqRecord;

describe('featureFocusTarget', () => {
  it('targets every part of an aligned joined feature, with its biological length', () => {
    const r = record({ alignedSequence: '--A-CG--TA-C--GT--' });
    const target = targetFor(r, { type: 'gene', name: 'joined', start: 0, end: 8, strand: 1,
      segments: [{ start: 0, end: 3 }, { start: 4, end: 8 }] });
    expect(target).toEqual({ recordId: 'r', featureIndex: 0, start: 2, end: 16, label: 'joined', length: 7 });
  });

  it('keeps raw coordinates on an unaligned record', () => {
    const target = targetFor(record({}), { type: 'gene', name: 'g', start: 2, end: 6, strand: 1 });
    expect(target).toEqual({ recordId: 'r', featureIndex: 0, start: 2, end: 6, label: 'g', length: 4 });
  });

  it('keeps the wrap order of a feature crossing the origin', () => {
    const target = targetFor(record({ isCircular: true }), { type: 'gene', name: 'ori', start: 6, end: 2, strand: 1 });
    expect(target).toEqual({ recordId: 'r', featureIndex: 0, start: 6, end: 2, label: 'ori', length: 4 });
  });
});

describe('isFocusedSelection', () => {
  const target = { recordId: 'r', featureIndex: 0, start: 2, end: 16, label: 'joined', length: 7 };

  it('holds while the selection is exactly the focused region', () => {
    expect(isFocusedSelection(target, { start: 2, end: 16, recordIds: ['r'] })).toBe(true);
  });

  it('lets go once a handle moves or the selection changes record', () => {
    expect(isFocusedSelection(target, { start: 2, end: 17, recordIds: ['r'] })).toBe(false);
    expect(isFocusedSelection(target, { start: 2, end: 16, recordIds: ['other'] })).toBe(false);
    expect(isFocusedSelection(target, { start: 2, end: 16, recordIds: ['r', 'other'] })).toBe(false);
    expect(isFocusedSelection(target, null)).toBe(false);
    expect(isFocusedSelection(null, { start: 2, end: 16, recordIds: ['r'] })).toBe(false);
  });
});

it('carries the source feature index even when features share a span', () => {
  const gene = { type: 'gene', name: 'gene', start: 2, end: 6, strand: 1 as const };
  const cds = { ...gene, type: 'CDS', name: 'protein' };
  expect(featureFocusTarget(record({ features: [gene, cds] }), cds)).toMatchObject({ featureIndex: 1, start: 2, end: 6 });
});

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

import { expect, it } from 'vitest';
import { readSearchHit, withSearchHit, withoutSearchHit, isSearchHitCurrent } from '../searchHit';
import type { BioFeature, SearchHitProvenance } from '../types';
const feature: BioFeature = { name: 'hit', type: 'misc_feature', start: 2, end: 5, strand: -1, segments: [{ start: 2, end: 5 }] };
const provenance: SearchHitProvenance = { v: 1, query: 'ACT', mode: 'whole', alphabet: 'nucleotide', params: { minQueryIdentity: 80 }, strand: -1,
  cigar: '3=', edits: 0, span: { start: 2, end: 5, strand: -1, segments: [{ start: 2, end: 5 }] },
  appVersion: '3.4.0', createdAt: '2026-10-16T00:00:00Z', exportNote: false };
it('serializes provenance and removes only its own key', () => {
  const f = withSearchHit({ ...feature, metadata: { note: 'keep' } }, provenance);
  expect(readSearchHit(f)).toEqual(provenance);
  expect(isSearchHitCurrent(f)).toBe(true);
  expect(withoutSearchHit(f).metadata).toEqual({ note: 'keep' });
});
it.each([{ start: 1 }, { end: 6 }, { strand: 1 as const }, { segments: [{ start: 3, end: 5 }] }])('detects changed geometry %o', change => {
  expect(isSearchHitCurrent({ ...withSearchHit(feature, provenance), ...change })).toBe(false);
});
it.each(['{', '{}', 'null', '{"v":2}', '{"v":1,"query":1}'])('ignores malformed or unsupported provenance %s', value => {
  expect(readSearchHit({ ...feature, metadata: { _searchHit: value } })).toBeNull();
});

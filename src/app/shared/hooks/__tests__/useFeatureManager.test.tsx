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

// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@/src/app/testing/renderHarness';
import { useFeatureManager } from '../useFeatureManager';
import type { SeqRecord } from '@/src/domain/bio/types';

const records: SeqRecord[] = [{ id: 'synthetic', name: 'synthetic', sequence: 'AACGTA', alignedSequence: 'AA--CGTA', features: [] }];
describe('search annotation direction', () => {
  it('carries a reverse match and its split alignment segments into the editor and saved record', () => {
    const setRecords = vi.fn();
    const { result } = renderHook(() => useFeatureManager(records, setRecords, null, vi.fn()));
    act(() => result.current.addAnnotationFromSearch('synthetic', 1, 7, 'Synthetic reverse', [{ start: 1, end: 2 }, { start: 4, end: 7 }], -1));
    expect(result.current.editing?.feature).toMatchObject({ strand: -1, start: 1, end: 5, segments: [{ start: 1, end: 2 }, { start: 2, end: 5 }] });
    act(() => result.current.saveEditedFeature());
    const saved = setRecords.mock.calls[0][0](records);
    expect(saved[0].features[0].strand).toBe(-1);
    expect(records[0].features).toEqual([]);
  });
  it('keeps the existing explicit forward default for a manually created feature', () => {
    const { result } = renderHook(() => useFeatureManager(records, vi.fn(), null, vi.fn()));
    act(() => result.current.startNewFeature());
    expect(result.current.editing?.feature.strand).toBe(1);
  });
});

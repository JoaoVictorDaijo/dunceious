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
import { writeDetails, readDetails } from '@/src/domain/bio/details';
import { useState } from 'react';
import { describe, expect, it, vi, afterEach } from 'vitest';
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

describe('annotation undo', () => {
  it('restores a deletion at its original index and reverses its edit marker', () => {
    const { result } = renderHook(() => {
      const [value, setValue] = useState<SeqRecord[]>([{ ...records[0], features: ['a', 'b', 'c'].map(name => ({ name, type: 'gene', start: 0, end: 2, strand: 1 })) }]);
      return { value, manager: useFeatureManager(value, setValue, null, () => {}) };
    });
    act(() => result.current.manager.removeFeature('synthetic', 1));
    expect(result.current.value[0].features.map(f => f.name)).toEqual(['a', 'c']);
    expect(result.current.value[0].annotationsEdited).toBe(true);
    act(() => result.current.manager.undoDelete());
    expect(result.current.value[0].features.map(f => f.name)).toEqual(['a', 'b', 'c']);
    expect(result.current.value[0].annotationsEdited).toBeUndefined();
  });
});

describe('undo lifetime', () => {
  afterEach(() => vi.useRealTimers());
  function setup() {
    return renderHook(() => {
      const [value, setValue] = useState<SeqRecord[]>([{ ...records[0], features: ['a', 'b', 'c'].map(name => ({ name, type: 'gene', start: 0, end: 2, strand: 1 })) }]);
      return { value, setValue, manager: useFeatureManager(value, setValue, null, () => {}) };
    });
  }
  it('preserves Undo through a real detail edit and restores the previous annotation marker', () => {
    const { result } = setup(); act(() => result.current.manager.removeFeature('synthetic', 1));
    act(() => result.current.setValue(prev => prev.map(r => writeDetails(r, { host: 'camel' }))));
    expect(result.current.manager.undoAvailable).toBe(true);
    act(() => result.current.manager.undoDelete());
    expect(result.current.value[0].features.filter(f => f.type !== 'source').map(f => f.name)).toEqual(['a', 'b', 'c']);
    expect(readDetails(result.current.value[0])).toEqual({ host: 'camel' });
    expect(result.current.value[0].annotationsEdited).toBeUndefined();
  });
  it('dismisses undo after another edit to the affected annotations', () => {
    const { result } = setup(); act(() => result.current.manager.removeFeature('synthetic', 1));
    act(() => result.current.setValue(prev => prev.map(r => ({ ...r, features: [...r.features, { name: 'new', type: 'gene', start: 2, end: 3, strand: 1 }] }))));
    expect(result.current.manager.undoAvailable).toBe(false);
    act(() => result.current.manager.undoDelete());
    expect(result.current.value[0].features.map(f => f.name)).toEqual(['a', 'c', 'new']);
  });
  it('dismisses undo when a workspace with the same ID replaces the records', () => {
    const { result } = setup(); act(() => result.current.manager.removeFeature('synthetic', 1));
    act(() => result.current.setValue([{ ...records[0], features: [] }]));
    expect(result.current.manager.undoAvailable).toBe(false);
    act(() => result.current.manager.undoDelete()); expect(result.current.value[0].features).toEqual([]);
  });
  it('keeps undo through visibility changes and expires it after eight seconds', () => {
    vi.useFakeTimers(); const { result } = setup(); act(() => result.current.manager.removeFeature('synthetic', 1));
    act(() => result.current.setValue(prev => prev.map(r => ({ ...r, visible: false }))));
    expect(result.current.manager.undoAvailable).toBe(true);
    act(() => vi.advanceTimersByTime(8000)); expect(result.current.manager.undoAvailable).toBe(false);
  });
});

describe('source editor boundary', () => {
  it('refuses existing sources and a source draft without changing details', () => {
    const original = writeDetails(records[0], { host: 'camel' });
    const { result } = renderHook(() => {
      const [value, setValue] = useState([original]);
      return { value, manager: useFeatureManager(value, setValue, null, () => {}) };
    });
    act(() => result.current.manager.setEditing({ recordId: 'synthetic', featureIndex: 0, feature: original.features[0] }));
    expect(result.current.manager.editing).toBeNull();
    act(() => result.current.manager.setEditing({ recordId: 'synthetic', featureIndex: -1, feature: original.features[0] }));
    expect(result.current.manager.editing).toBeNull();
    act(() => result.current.manager.saveEditedFeature());
    expect(readDetails(result.current.value[0])).toEqual({ host: 'camel' });
  });
});

it('refuses an annotation draft targeting an existing source index', () => {
  const initial = writeDetails(records[0], { host: 'camel' });
  const { result } = renderHook(() => useFeatureManager([initial], vi.fn(), null, () => {}));
  act(() => result.current.setEditing({ recordId: 'synthetic', featureIndex: 0, feature: { type: 'gene', name: 'bypass', start: 0, end: 2, strand: 1 } }));
  expect(result.current.editing).toBeNull();
});

describe('hub callback stability', () => {
  it('keeps detail, name, visibility and editor handlers stable across unrelated renders', () => {
    const setRecords = vi.fn();
    const log = vi.fn();
    const { result, rerender } = renderHook(() => useFeatureManager(records, setRecords, null, log));
    const first = result.current;
    rerender();
    expect(result.current.toggleRecordVisibility).toBe(first.toggleRecordVisibility);
    expect(result.current.setRecordDetails).toBe(first.setRecordDetails);
    expect(result.current.setRecordLabel).toBe(first.setRecordLabel);
    expect(result.current.setEditing).toBe(first.setEditing);
  });
});

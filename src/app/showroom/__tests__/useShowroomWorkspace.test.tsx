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
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@/src/app/testing/renderHarness';
import { runInlineSearch } from '@/src/app/logic/runInlineSearch';
import { runSearch } from '@/src/workers/handlers/search';
import { handleBioMessage } from '@/src/workers/handlers/bio';
import { loadSampleRecords } from '../sampleWorkspace';
import { useShowroomWorkspace } from '../useShowroomWorkspace';

const searchable = () => loadSampleRecords().map(({ id, sequence, alignedSequence, moleculeType }) => ({ id, sequence, alignedSequence, moleculeType }));

afterEach(() => vi.restoreAllMocks());

function searchFor(result: { current: ReturnType<typeof useShowroomWorkspace> }, query: string) {
  act(() => result.current.search.setQuery(query));
  act(() => result.current.search.run());
}

describe('useShowroomWorkspace', () => {
  it('starts with the ten sample records, all visible, in Pan mode with the default layers', () => {
    const { result } = renderHook(() => useShowroomWorkspace());
    expect(result.current.records).toHaveLength(10);
    expect(result.current.transposedRecords).toHaveLength(10);
    const processed = handleBioMessage({ type: 'PROCESS_RECORDS', records: loadSampleRecords() });
    if (processed.type !== 'SUCCESS') throw new Error('processing failed');
    expect(result.current.transposedRecords).toEqual(processed.records);
    expect(result.current.consensus).toBe(processed.consensus);
    expect(result.current).toMatchObject({ showAnnotations: true, showTranslation: true, showTracks: true, dragMode: 'pan', explain: null });
  });

  it('runs the exact search the workbench runs, over every loaded record', () => {
    const { result } = renderHook(() => useShowroomWorkspace());
    searchFor(result, 'ACG AAC');
    const expected = runInlineSearch({ searchQuery: 'ACGAAC', records: searchable(), mode: 'exact', options: { minScore: 0, strand: 'both', maxResults: 100 }, moleculeType: 'dna' });
    expect(result.current.search.results).toEqual(expected);
    expect(result.current.search.results.filter(hit => hit.recordId === 'NC_045512' && hit.strand === 1)).toHaveLength(9);
    expect(result.current.search.currentIdx).toBe(0);
    expect(result.current.activeSelection).toEqual({ start: expected[0].start, end: expected[0].end, recordIds: [expected[0].recordId] });
  });

  it('runs fuzzy search through the search worker body', () => {
    const { result } = renderHook(() => useShowroomWorkspace());
    act(() => result.current.search.setMode('fuzzy'));
    searchFor(result, 'ACGAACTTTA');
    const response = runSearch({ searchQuery: 'ACGAACTTTA', records: searchable(), mode: 'fuzzy', options: { minScore: 1, strand: 'both', maxResults: 100 }, moleculeType: 'dna' });
    if (!('results' in response)) throw new Error('fuzzy search failed');
    expect(result.current.search.results).toEqual(response.results);
    expect(result.current.search.filtered.length).toBeLessThanOrEqual(response.results.length);
  });

  it('clears the search and the selection it made', () => {
    const { result } = renderHook(() => useShowroomWorkspace());
    searchFor(result, 'ACGAAC');
    act(() => result.current.search.clear());
    expect(result.current.search).toMatchObject({ query: '', results: [], currentIdx: -1 });
    expect(result.current.activeSelection).toBeNull();
  });

  it('toggles layers and record visibility', () => {
    const { result } = renderHook(() => useShowroomWorkspace());
    act(() => result.current.toggle('annotations'));
    act(() => result.current.toggle('translation'));
    act(() => result.current.toggle('tracks'));
    expect(result.current).toMatchObject({ showAnnotations: false, showTranslation: false, showTracks: false });
    act(() => result.current.setRecordVisible('NC_012920', false));
    expect(result.current.records.find(r => r.id === 'NC_012920')?.visible).toBe(false);
    expect(result.current.transposedRecords.map(r => r.id)).not.toContain('NC_012920');
    act(() => result.current.setRecordVisible('NC_012920', true));
    expect(result.current.transposedRecords).toHaveLength(10);
  });

  it('opens and closes one explanation at a time', () => {
    const { result } = renderHook(() => useShowroomWorkspace());
    const anchor = new DOMRect(10, 20, 30, 40);
    act(() => result.current.openExplain('project', anchor));
    expect(result.current).toMatchObject({ explain: 'project', explainAnchor: anchor });
    act(() => result.current.openExplain('options'));
    expect(result.current).toMatchObject({ explain: 'options', explainAnchor: null });
    act(() => result.current.closeExplain());
    expect(result.current.explain).toBeNull();
  });

  it('keeps everything in memory', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const { result } = renderHook(() => useShowroomWorkspace());
    searchFor(result, 'ACGAAC');
    act(() => result.current.setRecordVisible('NC_045512', false));
    act(() => result.current.toggle('annotations'));
    act(() => result.current.setDragMode('select'));
    act(() => result.current.openExplain('hub'));
    expect(setItem).not.toHaveBeenCalled();
  });
});

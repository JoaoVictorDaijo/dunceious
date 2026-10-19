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
import { completedSearchFor } from '@/src/app/logic/searchState';
import { loadSampleRecords } from '../sampleWorkspace';
import { useShowroomWorkspace } from '../useShowroomWorkspace';

const searchable = () => loadSampleRecords().map(({ id, sequence, alignedSequence, moleculeType }) => ({ id, sequence, alignedSequence, moleculeType }));

afterEach(() => vi.restoreAllMocks());

function searchFor(result: { current: ReturnType<typeof useShowroomWorkspace> }, query: string) {
  act(() => result.current.search.setQuery(query));
  act(() => result.current.search.run());
}

describe('useShowroomWorkspace', () => {
  it('starts with the three sample records, all visible, in Pan mode with the default layers', () => {
    const { result } = renderHook(() => useShowroomWorkspace());
    expect(result.current.records).toHaveLength(3);
    expect(result.current.transposedRecords).toHaveLength(3);
    const processed = handleBioMessage({ type: 'PROCESS_RECORDS', records: loadSampleRecords() });
    if (processed.type !== 'SUCCESS') throw new Error('processing failed');
    expect(result.current.transposedRecords).toEqual(processed.records);
    expect(result.current.consensus).toBe(processed.consensus);
    expect(result.current).toMatchObject({
      showAnnotations: true, showTranslation: true, showTracks: true, showConservation: false,
      dragMode: 'pan', explain: null,
    });
  });

  it('runs the exact search the workbench runs, over every loaded record', () => {
    const { result } = renderHook(() => useShowroomWorkspace());
    searchFor(result, 'TAATACGAC TCACTATAG');
    const expected = runInlineSearch({ searchQuery: 'TAATACGACTCACTATAG', records: searchable(), mode: 'exact', options: { minIdentity: 80, strand: 'both', maxResults: 100 }, moleculeType: 'dna' });
    expect(result.current.search.results).toEqual(expected);
    expect(result.current.search.results.filter(hit => hit.recordId === 'NC_001604' && hit.strand === 1)).toHaveLength(7);
    expect(result.current.search.currentIdx).toBe(0);
    expect(result.current.activeSelection).toEqual({ start: expected[0].start, end: expected[0].end, recordIds: [expected[0].recordId] });
  });

  it('runs fuzzy search through the search worker body', () => {
    const { result } = renderHook(() => useShowroomWorkspace());
    act(() => result.current.search.setMode('fuzzy'));
    searchFor(result, 'TAATACGACTCACTATAGGG');
    const response = runSearch({ searchQuery: 'TAATACGACTCACTATAGGG', records: searchable(), mode: 'fuzzy', options: { minIdentity: 80, strand: 'both', maxResults: 100 }, moleculeType: 'dna' });
    if (!('results' in response)) throw new Error('fuzzy search failed');
    expect(result.current.search.results).toEqual(response.results);
    expect(result.current.search.results.length).toBeGreaterThan(0);
    expect(result.current.search.results.every(hit => (hit.identity ?? 0) >= 80)).toBe(true);
  });

  it('clears the search and the selection it made', () => {
    const { result } = renderHook(() => useShowroomWorkspace());
    searchFor(result, 'TAATACGACTCACTATAG');
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
    act(() => result.current.setRecordVisible('NC_003298', false));
    expect(result.current.records.find(r => r.id === 'NC_003298')?.visible).toBe(false);
    expect(result.current.transposedRecords.map(r => r.id)).not.toContain('NC_003298');
    act(() => result.current.setRecordVisible('NC_003298', true));
    expect(result.current.transposedRecords).toHaveLength(3);
  });

  it('opens and closes one explanation at a time', () => {
    const { result } = renderHook(() => useShowroomWorkspace());
    const anchor = new DOMRect(10, 20, 30, 40);
    act(() => result.current.openExplain('project', anchor));
    expect(result.current).toMatchObject({ explain: 'project', explainAnchor: anchor });
    const firstKey = result.current.explainKey;
    act(() => result.current.openExplain('options'));
    expect(result.current).toMatchObject({ explain: 'options', explainAnchor: null });
    expect(result.current.explainKey).not.toBe(firstKey);
    act(() => result.current.closeExplain());
    expect(result.current.explain).toBeNull();
  });

  it('keeps everything in memory', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const { result } = renderHook(() => useShowroomWorkspace());
    searchFor(result, 'TAATACGACTCACTATAG');
    act(() => result.current.setRecordVisible('NC_001604', false));
    act(() => result.current.toggle('annotations'));
    act(() => result.current.setDragMode('select'));
    act(() => result.current.openExplain('project'));
    expect(setItem).not.toHaveBeenCalled();
  });
});

// What the bundled alignment unlocks, in its own block so neither grows past the
// repository's function-length warning.
describe('the showroom workspace over the aligned sample', () => {
  it('Conservation toggles', () => {
    const { result } = renderHook(() => useShowroomWorkspace());
    expect(result.current.showConservation).toBe(false);
    act(() => result.current.toggle('conservation'));
    expect(result.current.showConservation).toBe(true);
    expect(result.current).toMatchObject({ showAnnotations: true, showTranslation: true, showTracks: true });
    act(() => result.current.toggle('conservation'));
    expect(result.current.showConservation).toBe(false);
  });

  it('completedSearch is set after a run and cleared on clear', () => {
    const { result } = renderHook(() => useShowroomWorkspace());
    expect(result.current.search.completedSearch).toBeNull();
    searchFor(result, 'TAATACGAC TCACTATAG');
    expect(result.current.search.completedSearch).toEqual(completedSearchFor({
      searchQuery: 'TAATACGACTCACTATAG', mode: 'exact', records: searchable(),
      options: { minIdentity: 80, strand: 'both', maxResults: 100 }, moleculeType: 'dna',
    }, false));
    act(() => result.current.search.clear());
    expect(result.current.search.completedSearch).toBeNull();
  });
});

describe('the showroom explanation state', () => {
  it('carries the export choices with the explanation that repeats them', () => {
    const { result } = renderHook(() => useShowroomWorkspace());
    const vars = { fileName: 'demo.gb', format: 'GenBank', count: 4 };
    act(() => result.current.openExplain('export-save', undefined, vars));
    expect(result.current).toMatchObject({ explain: 'export-save', explainAnchor: null, explainVars: vars });
    act(() => result.current.openExplain('copy'));
    expect(result.current.explainVars).toBeUndefined();
  });
});

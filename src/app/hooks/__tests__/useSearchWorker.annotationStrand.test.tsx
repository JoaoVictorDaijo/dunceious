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

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@/src/app/testing/renderHarness';
import { useSearchWorker } from '../useSearchWorker';
import type { SeqRecord } from '@/src/domain/bio/types';

beforeEach(() => vi.stubGlobal('Worker', class { postMessage() {} terminate() {} }));
afterEach(() => vi.unstubAllGlobals());

const records: SeqRecord[] = [{ id: 'synthetic', name: 'synthetic', sequence: 'AACGTAACGTA', features: [] }];
describe('joining reverse search hits', () => {
  it.each(['record', 'selection'])('preserves strand when joining a %s', mode => {
    const annotate = vi.fn();
    const { result } = renderHook(() => useSearchWorker(records, vi.fn(), annotate, vi.fn()));
    act(() => {
      result.current.setSearchQuery('TAC');
      result.current.setSearchOptions({ minScore: 0, strand: 'rev', maxResults: 100 });
    });
    act(() => result.current.handleSearch());
    expect(result.current.filteredResults.map(hit => hit.strand)).toEqual([-1, -1]);
    if (mode === 'record') act(() => result.current.joinAllInRecord('synthetic'));
    else {
      act(() => result.current.setSelectedSearchIndices(new Set([0, 1])));
      act(() => result.current.joinSelectedMatches());
    }
    expect(annotate.mock.calls[0]).toEqual(['synthetic', 3, 11, expect.any(String), [{ start: 3, end: 6 }, { start: 8, end: 11 }], -1]);
  });
});

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
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@/src/app/testing/renderHarness';
import { useSearchWorker } from '../useSearchWorker';
import type { SeqRecord } from '@/src/domain/bio/types';

afterEach(() => { vi.unstubAllGlobals(); });

describe('RNA search record projection', () => {
  it.each(['rna', 'dna'] as const)('preserves the %s record type even without U in the sequence', (moleculeType) => {
    vi.stubGlobal('Worker', class {
      onmessage = null;
      onerror = null;
      postMessage() {}
      terminate() {}
    });
    const records: SeqRecord[] = [{
      id: 'seq', name: 'seq', sequence: 'AAA', alignedSequence: 'A-AA', features: [], moleculeType,
    }];
    const noop = () => {};
    const { result } = renderHook(() => useSearchWorker(records, noop, noop, noop));
    act(() => {
      result.current.setSearchQuery('UUU');
      result.current.setSearchOptions({ minScore: 0, strand: 'rev', maxResults: 100 });
    });
    act(() => { result.current.handleSearch(); });
    if (moleculeType === 'rna') {
      expect(result.current.searchResults).toEqual([{
        recordId: 'seq', sequence: 'UU-U', start: 0, end: 4, strand: -1,
        segments: [{ start: 0, end: 1 }, { start: 2, end: 4 }],
      }]);
    } else {
      expect(result.current.searchResults).toEqual([]);
    }
  });
});

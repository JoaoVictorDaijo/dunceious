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
import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@/src/app/testing/renderHarness';
import SearchPanel, { type SearchPanelProps } from '../SearchPanel';
import type { SearchResult } from '@/src/domain/bio/types';

const hit: SearchResult = { recordId: 'synthetic', sequence: 'TAC', start: 3, end: 8, strand: -1,
  segments: [{ start: 3, end: 4 }, { start: 6, end: 8 }] };
function panelProps(): SearchPanelProps & { onClearSearch: () => void } {
  return {
    searchQuery: 'TAC', onSearchQueryChange: vi.fn(), searchMode: 'exact', onSearchModeChange: vi.fn(),
    searchOptions: { minScore: 0, strand: 'both', maxResults: 100 }, onSearchOptionsChange: vi.fn(),
    isSearching: false, onSearch: vi.fn(), onClearSearch: vi.fn(), filteredResults: [hit], groupedSearchResults: { synthetic: { results: [hit], indices: [0] } },
    currentSearchIdx: 0, onSetCurrentIdx: vi.fn(), selectedSearchIndices: new Set(), onSetSelectedIndices: vi.fn(),
    maxScoreFound: 1, records: [{ id: 'synthetic', name: 'synthetic', sequence: 'AACGTA', features: [] }],
    onSetActiveSelection: vi.fn(), onSetActiveTab: vi.fn(), onToggleRecordSelection: vi.fn(),
    onJoinAllInRecord: vi.fn(), onJoinSelectedMatches: vi.fn(), onAnnotateMatch: vi.fn(),
    getSequenceContext: () => ({ pre: 'AAC', match: 'GTA', post: '' }),
  };
}
it('passes reverse direction and aligned segments from the Annotate button', () => {
  const props = panelProps();
  render(<SearchPanel {...props} />);
  fireEvent.click(screen.getByRole('button', { name: /^Annotate(?: match)?/ }));
  expect(props.onAnnotateMatch).toHaveBeenCalledWith('synthetic', 3, 8, 'Match: TAC', hit.segments, -1);
});

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
import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@/src/app/testing/renderHarness';
import { HitBarcode } from '../search/HitBarcode';
import { hitColumns } from '@/src/core/search/hitColumns';
import SearchPanel, { type SearchPanelProps } from '../SearchPanel';
import type { SearchResult } from '@/src/domain/bio/types';

const hit: SearchResult = { cigar: '3=', recordId: 'synthetic', sequence: 'TAC', start: 0, end: 3, strand: -1,
  segments: [{ start: 3, end: 4 }, { start: 6, end: 8 }] };
function panelProps(): SearchPanelProps & { onClearSearch: () => void } {
  return {
    searchQuery: 'TAC', onSearchQueryChange: vi.fn(), searchMode: 'fuzzy', onSearchModeChange: vi.fn(),
    searchOptions: { minIdentity: 80, strand: 'both', maxResults: 100 }, onSearchOptionsChange: vi.fn(),
    isSearching: false, onSearch: vi.fn(), onClearSearch: vi.fn(), searchResults: [hit], groupedSearchResults: { synthetic: { results: [hit], indices: [0] } },
    currentSearchIdx: 0, onSetCurrentIdx: vi.fn(), selectedSearchIndices: new Set(), onSetSelectedIndices: vi.fn(),
    records: [{ id: 'synthetic', name: 'synthetic', sequence: 'GTA', features: [] }],
    onSetActiveSelection: vi.fn(), onSetActiveTab: vi.fn(), onToggleRecordSelection: vi.fn(),
    onJoinAllInRecord: vi.fn(), onJoinSelectedMatches: vi.fn(), onAnnotateMatch: vi.fn(),
    getSequenceContext: () => ({ pre: 'AAC', match: 'GTA', post: '' }),
  };
}

it('renders counts, collapsed sections, query identity help and copies alignment text', async () => {
  sessionStorage.clear();
  const copy = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } });
  const props = panelProps();
  const { container, unmount } = render(<SearchPanel {...props}
    completedSearch={{ query: 'TAC', mode: 'whole', alphabet: 'nucleotide', options: props.searchOptions }} />);
  expect(screen.getByLabelText('Min query identity')).toBeTruthy();
  expect(screen.getByText(/100 × \(query length − edits\) \/ query length/)).toBeTruthy();
  expect(screen.getAllByText('3 identical').length).toBeGreaterThan(0);
  const alignment = container.querySelector<HTMLDetailsElement>('[data-hit-alignment]')!;
  const details = container.querySelector<HTMLDetailsElement>('[data-search-details]')!;
  expect(alignment.open).toBe(false); expect(details.open).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
  expect(copy).toHaveBeenCalledWith(expect.stringContaining('synthetic (reverse strand)'));
  details.open = true; fireEvent(details, new Event('toggle'));
  unmount();
  const next = render(<SearchPanel {...props} completedSearch={{ query: 'TAC', mode: 'whole', alphabet: 'nucleotide', options: props.searchOptions }} />);
  expect(next.container.querySelector<HTMLDetailsElement>('[data-search-details]')!.open).toBe(true);
});

it('labels a protein barcode in query N→C orientation on both strands', () => {
  const columns = hitColumns({ cigar: '1=1X', query: 'NA', span: 'NG', mode: 'whole', alphabet: 'protein' });
  render(<HitBarcode columns={columns} alphabet="protein" strand={1} />);
  expect(screen.getByRole('img').getAttribute('aria-label')).toBe('1 identical, 1 mismatch');
  expect(screen.getByTitle('N→C (query orientation)')).toBeTruthy();
});

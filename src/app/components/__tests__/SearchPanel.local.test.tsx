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
import SearchPanel, { type SearchPanelProps } from '../SearchPanel';
import type { SearchResult } from '@/src/domain/bio/types';
const hit: SearchResult = { cigar: '2S3=', recordId: 'synthetic', sequence: 'GTA', start: 0, end: 3, strand: 1,
 local: { score: 15, length: 3, identical: 3, similar: 3, gaps: 0, queryStart: 2, queryEnd: 5, queryLength: 5 } };
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


it('disables Local with a load failure reason', () => {
 const props = panelProps();
 render(<SearchPanel {...props} localReady={false} localError="Local module load failed" />);
 expect((screen.getByRole('button', { name: 'Local' }) as HTMLButtonElement).disabled).toBe(true);
 expect(screen.getByText('Local module load failed')).toBeTruthy();
});
it('keeps Local options collapsed and remembers their open state in the session', () => {
 sessionStorage.clear();
 const props = panelProps(); props.searchOptions.fuzzyMethod = 'local';
 const h = render(<SearchPanel {...props} localReady />);
 const options = h.container.querySelector<HTMLDetailsElement>('[data-local-options]')!;
 expect(options.open).toBe(false);
 options.open = true; fireEvent(options, new Event('toggle'));
 expect(screen.getByLabelText('Min identity').getAttribute('value')).toBe('');
 h.unmount();
 const next = render(<SearchPanel {...props} localReady />);
 expect(next.container.querySelector<HTMLDetailsElement>('[data-local-options]')!.open).toBe(true);
});
it('shows defined Local metrics and cutoff counts, with correct soft-clipped query coordinates', () => {
 const props = panelProps(); props.searchOptions.fuzzyMethod = 'local';
 props.searchOptions.maxResults = 1;
 props.searchQuery = 'AAGTA'; props.records[0].sequence = 'GTA';
 const h = render(<SearchPanel {...props} localReady localCounts={{ cutoff: 15, streams: 2, noPositiveStreams: 0, skippedRecords: [{ recordId: 'bad', characters: ['*'] }], hiddenByOverlap: 2, hiddenByFilters: 1, beyondLimit: 4 }}
 completedSearch={{ query: 'AAGTA', mode: 'local', alphabet: 'nucleotide', options: props.searchOptions, matrixScore: (q, r) => q === r ? 5 : -4 }} />);
 expect(screen.getByText('Score 15')).toBeTruthy();
 expect(screen.getByText(/Identity 3\/3/)).toBeTruthy();
 expect(screen.getByText(/Similarity 3\/3/)).toBeTruthy();
 expect(screen.getByText(/Gaps 0\/3/)).toBeTruthy();
 expect(screen.getByText(/Query coverage 3\/5/)).toBeTruthy();
 expect(screen.getByText("Top 1 shown; lower-scoring alignments aren't counted")).toBeTruthy();
 expect(screen.getByText('Counts cover alignments scoring at least 15 in EMBOSS units')).toBeTruthy();
 expect(screen.getByText('2 hidden by overlap')).toBeTruthy();
 expect(screen.getByText('1 hidden by display filters')).toBeTruthy();
 expect(screen.getByText('4 beyond the result limit')).toBeTruthy();
 expect(screen.queryByText(/lower bounds|more not counted|at least \d+ hidden/i)).toBeNull();
 expect(h.container.querySelector('pre')!.textContent).toMatch(/Query\s+3\s+GTA\s+5/);
});

it('preserves a fractional cutoff in EMBOSS units', () => {
 const props = panelProps(); props.searchOptions.fuzzyMethod = 'local'; props.searchOptions.maxResults = 1;
 const fractionalHit: SearchResult = { ...hit, local: { ...hit.local!, score: 0.5 } };
 props.searchResults = [fractionalHit]; props.groupedSearchResults = { synthetic: { results: [fractionalHit], indices: [0] } };
 render(<SearchPanel {...props} localReady localCounts={{ cutoff: 0.5, streams: 2, noPositiveStreams: 1, skippedRecords: [], hiddenByOverlap: 0, hiddenByFilters: 2, beyondLimit: 3 }} />);
 expect(screen.getByText('Counts cover alignments scoring at least 0.5 in EMBOSS units')).toBeTruthy();
 expect(screen.getByText('2 streams searched')).toBeTruthy();
 expect(screen.getByText('1 streams with no positive alignment')).toBeTruthy();
 expect(screen.getByText('0 records skipped')).toBeTruthy();
 expect(screen.getByText('0 hidden by overlap')).toBeTruthy();
 expect(screen.getByText('2 hidden by display filters')).toBeTruthy();
 expect(screen.getByText('3 beyond the result limit')).toBeTruthy();
 expect(screen.queryByText(/\(exact\)|lower bounds|more not counted/)).toBeNull();
});

it.each([true, false])('shows exhaustive totals without a cutoff when results are present: %s', hasResults => {
 const props = panelProps(); props.searchOptions.fuzzyMethod = 'local';
 if (!hasResults) { props.searchResults = []; props.groupedSearchResults = {}; }
 render(<SearchPanel {...props} localReady localCounts={{ cutoff: null, streams: 3, noPositiveStreams: 1, skippedRecords: [], hiddenByOverlap: 2, hiddenByFilters: 4, beyondLimit: 0 }} />);
 expect(screen.getByText('Exact counts across all alignments')).toBeTruthy();
 expect(screen.getByText('2 hidden by overlap')).toBeTruthy();
 expect(screen.getByText('4 hidden by display filters')).toBeTruthy();
 expect(screen.getByText('0 beyond the result limit')).toBeTruthy();
 expect(screen.queryByText(/Counts cover alignments scoring|Top \d+ shown|lower bounds|more not counted|\(exact\)/)).toBeNull();
 if (hasResults) expect(screen.getByText('1 matches')).toBeTruthy();
});

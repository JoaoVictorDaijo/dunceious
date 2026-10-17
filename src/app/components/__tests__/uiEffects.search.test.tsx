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
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@/src/app/testing/renderHarness';
import SearchPanel, { type SearchPanelProps } from '../SearchPanel';
import { SearchDetails } from '../search/SearchDetails';
import { HitAlignment } from '../search/HitAlignment';
import { DEFAULT_UI_EFFECTS, UiEffectsContext } from '../uiEffects';

beforeEach(() => sessionStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const alignmentText = 'Query  1  ACGT  4\n          ||||\nrecord 1  ACGT  4';

function panelProps(): SearchPanelProps {
  return {
    searchQuery: 'ACGT', onSearchQueryChange: vi.fn(), searchMode: 'fuzzy', onSearchModeChange: vi.fn(),
    searchOptions: { minIdentity: 80, strand: 'both', maxResults: 100 }, onSearchOptionsChange: vi.fn(),
    isSearching: false, onSearch: vi.fn(), onClearSearch: vi.fn(), searchResults: [], groupedSearchResults: {},
    currentSearchIdx: 0, onSetCurrentIdx: vi.fn(), selectedSearchIndices: new Set(), onSetSelectedIndices: vi.fn(),
    records: [], onSetActiveSelection: vi.fn(), onSetActiveTab: vi.fn(), onToggleRecordSelection: vi.fn(),
    onJoinAllInRecord: vi.fn(), onJoinSelectedMatches: vi.fn(), onAnnotateMatch: vi.fn(),
    getSequenceContext: () => ({ pre: '', match: '', post: '' }),
  };
}

it('without a provider, disclosures persist in sessionStorage', () => {
  const setItem = vi.spyOn(Storage.prototype, 'setItem');
  const { container } = render(<SearchDetails mode="whole" recordCount={1} />);
  const details = container.querySelector('details')!;
  expect(details.open).toBe(false);
  details.open = true;
  fireEvent(details, new Event('toggle'));
  expect(details.open).toBe(true);
  expect(setItem).toHaveBeenCalledWith('search-section:details', '1');
});

it('with persistOpenState false, no storage is touched', () => {
  sessionStorage.setItem('search-section:details', '1');
  const getItem = vi.spyOn(Storage.prototype, 'getItem');
  const setItem = vi.spyOn(Storage.prototype, 'setItem');
  const { container } = render(<UiEffectsContext.Provider value={{ ...DEFAULT_UI_EFFECTS, persistOpenState: false }}>
    <SearchDetails mode="whole" recordCount={1} />
  </UiEffectsContext.Provider>);
  const details = container.querySelector('details')!;
  expect(details.open).toBe(false);
  details.open = true;
  fireEvent(details, new Event('toggle'));
  expect(details.open).toBe(true);
  expect(getItem).not.toHaveBeenCalled();
  expect(setItem).not.toHaveBeenCalled();
});

it('HitAlignment Copy uses copyText and shows no status when declined', async () => {
  const copyText = vi.fn().mockResolvedValue(false);
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  render(<UiEffectsContext.Provider value={{ ...DEFAULT_UI_EFFECTS, copyText }}>
    <HitAlignment text={alignmentText} storageKey="declined" />
  </UiEffectsContext.Provider>);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy' })); });
  expect(copyText).toHaveBeenCalledExactlyOnceWith(alignmentText);
  expect(writeText).not.toHaveBeenCalled();
  expect(screen.getByRole('status').textContent).toBe('');
});

it('default Copy still writes the clipboard and says Copied', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  render(<HitAlignment text={alignmentText} storageKey="default" />);
  fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Copied'));
  expect(writeText).toHaveBeenCalledExactlyOnceWith(alignmentText);
});

it('localOverride enables Local, routes the tap and shows its status', () => {
  const props = panelProps();
  const onSelect = vi.fn();
  render(<SearchPanel {...props} localReady={false} localOverride={{ status: 'X', onSelect }} />);
  const local = screen.getByRole('button', { name: 'Local' }) as HTMLButtonElement;
  expect(local.disabled).toBe(false);
  fireEvent.click(local);
  expect(onSelect).toHaveBeenCalledOnce();
  expect(props.onSearchOptionsChange).not.toHaveBeenCalled();
  expect(screen.getByRole('status').textContent).toBe('X');
  expect(screen.queryByText('Local search ready')).toBeNull();
});

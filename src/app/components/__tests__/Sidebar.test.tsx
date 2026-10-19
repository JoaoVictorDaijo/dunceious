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
import { fireEvent, render } from '@/src/app/testing/renderHarness';
import Sidebar, { type SidebarProps } from '../Sidebar';

const noop = () => {};
const props: SidebarProps = {
  open: true, activeTab: 'features', records: [], transposedRecords: [], activeSelection: null,
  onSetActiveSelection: noop, alignmentLength: 0, onSetJumpTo: noop, onFileUpload: noop,
  onAlignmentUpload: noop, onAnnotationUpload: noop, onProjectUpload: noop,
  onExportSelection: noop, onExportSelectionJson: noop, onStartNewFeature: noop, logs: [],
  searchQuery: '', onSearchQueryChange: noop, searchMode: 'exact', onSearchModeChange: noop,
  searchOptions: { minIdentity: 80, strand: 'both', maxResults: 100 }, onSearchOptionsChange: noop,
  isSearching: false, onSearch: noop, onClearSearch: noop, onSelectSearchResult: noop,
  searchResults: [], groupedSearchResults: {}, currentSearchIdx: -1, onSetCurrentIdx: noop,
  selectedSearchIndices: new Set(), onSetSelectedIndices: noop,
  onSetActiveTab: noop, onRemoveRecord: noop, onToggleRecordSelection: noop,
  onJoinAllInRecord: noop, onJoinSelectedMatches: noop, onAnnotateMatch: noop,
  getSequenceContext: () => ({ pre: '', match: '', post: '' }), isProteinSession: false,
};
afterEach(() => vi.restoreAllMocks());
function setup() {
  const view = render(<Sidebar {...props} />);
  const sidebar = view.container.querySelector('aside')!;
  const handle = view.container.querySelector('.cursor-col-resize')!;
  return { ...view, sidebar, handle };
}
describe('sidebar resize', () => {
  it.each([{ x: -1000, width: '200px' }, { x: 1000, width: '560px' }])('clamps drag width at $width', ({ x, width }) => {
    const { sidebar, handle } = setup();
    fireEvent.mouseDown(handle, { clientX: 320 });
    expect(sidebar.style.transition).toBe('none');
    fireEvent.mouseMove(document, { clientX: x });
    expect(sidebar.style.width).toBe(width);
    fireEvent.mouseUp(document);
    expect(sidebar.style.transition).toBe('');
  });
  it('commits on mouseup and starts the next drag from the committed width', () => {
    const { sidebar, handle, rerender } = setup();
    fireEvent.mouseDown(handle, { clientX: 320 });
    fireEvent.mouseMove(document, { clientX: 410 });
    fireEvent.mouseUp(document);
    rerender(<Sidebar {...props} open={false} />);
    expect(sidebar.style.width).toBe('0px');
    rerender(<Sidebar {...props} />);
    expect(sidebar.style.width).toBe('410px');
    fireEvent.mouseMove(document, { clientX: 500 });
    expect(sidebar.style.width).toBe('410px');
    fireEvent.mouseDown(sidebar.querySelector('.cursor-col-resize')!, { clientX: 410 });
    fireEvent.mouseMove(document, { clientX: 440 });
    fireEvent.mouseUp(document);
    expect(sidebar.style.width).toBe('440px');
  });
  it('removes both document listeners when unmounted during a drag', () => {
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    const { handle, unmount } = setup();
    fireEvent.mouseDown(handle, { clientX: 320 });
    const move = add.mock.calls.find(([event]) => event === 'mousemove')![1];
    const up = add.mock.calls.find(([event]) => event === 'mouseup')![1];
    unmount();
    expect(remove).toHaveBeenCalledWith('mousemove', move);
    expect(remove).toHaveBeenCalledWith('mouseup', up);
    fireEvent.mouseMove(document, { clientX: 500 });
    fireEvent.mouseUp(document);
  });
});

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
import { afterEach, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@/src/app/testing/renderHarness';
import { useHubState } from '@/src/app/hooks/useHubState';
import Sidebar, { type SidebarProps } from '../Sidebar';
import HubIndex from '../hub/HubIndex';
import type { SeqRecord } from '@/src/domain/bio/types';

const record: SeqRecord = { id: 'seq', name: 'seq', sequence: 'ACGT', features: [] };
const noop = () => {};
function sidebarProps(): SidebarProps {
  return {
    open: true, activeTab: 'alignment', records: [record], transposedRecords: [record],
    activeSelection: null, alignmentLength: 3308, isProteinSession: false,
    logs: [], searchQuery: '', searchMode: 'exact', searchOptions: { minScore: 0, strand: 'both', maxResults: 10 },
    isSearching: false, filteredResults: [], groupedSearchResults: {}, currentSearchIdx: 0,
    selectedSearchIndices: new Set(), maxScoreFound: 0,
    onSetActiveSelection: noop, onSetJumpTo: noop, onFileUpload: noop,
    onAlignmentUpload: noop, onAnnotationUpload: noop, onProjectUpload: noop,
    onExportSelection: noop, onExportSelectionJson: noop, onStartNewFeature: noop,
    onSearchQueryChange: noop, onSearchModeChange: noop, onSearchOptionsChange: noop,
    onSearch: noop, onClearSearch: noop, onSelectSearchResult: noop, onSetCurrentIdx: noop,
    onSetSelectedIndices: noop, onSetActiveTab: noop, onRemoveRecord: noop,
    onToggleRecordSelection: noop, onJoinAllInRecord: noop, onJoinSelectedMatches: noop,
    onAnnotateMatch: noop, getSequenceContext: () => ({ pre: '', match: '', post: '' }),
  };
}
afterEach(() => vi.restoreAllMocks());

it.each(['viewport', 'hub'] as const)('%s title offers only add sequences, with the alignment guard', surface => {
  const add = vi.fn();
  const props = sidebarProps();
  function Subject({ locked = false }: { locked?: boolean }) {
    const state = useHubState();
    return surface === 'viewport'
      ? <Sidebar {...props} onFileUpload={add} isAlignmentLocked={locked} />
      : <HubIndex records={[record]} state={state} onAddSequences={add} addLocked={locked} />;
  }
  const { rerender } = render(<Subject />);
  expect(screen.getByRole('heading', { name: surface === 'viewport' ? 'Record Navigator' : 'Sequence index' })).toBeTruthy();
  const controls = screen;
  expect(controls.getByRole('button', { name: 'Add sequences…' }).hasAttribute('disabled')).toBe(false);
  expect(controls.queryByRole('button', { name: 'Workspace actions' })).toBeNull();
  rerender(<Subject locked />);
  if (surface === 'viewport') expect(screen.getByLabelText('Add sequences files')).toHaveProperty('disabled', true);
  expect(controls.getByRole('button', { name: 'Add sequences…' })).toHaveProperty('disabled', true);
});

it('viewport add opens the GenBank/FASTA picker and routes uploaded files', () => {
  const upload = vi.fn();
  render(<Sidebar {...sidebarProps()} onFileUpload={upload} />);
  const picker = screen.getByLabelText('Add sequences files') as HTMLInputElement;
  const click = vi.spyOn(picker, 'click');
  fireEvent.click(screen.getByRole('button', { name: 'Add sequences…' }));
  expect(click).toHaveBeenCalledTimes(1);
  expect(picker.accept).toBe('.gb,.genbank,.fasta,.fa');
  expect(picker.multiple).toBe(true);
  const files = [new File(['>seq\nACGT'], 'seq.fa')];
  fireEvent.change(picker, { target: { files } });
  expect(upload).toHaveBeenCalledTimes(1);
  expect(upload.mock.calls[0][0].target.files).toEqual(files);
});

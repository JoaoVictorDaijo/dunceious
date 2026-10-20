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
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, installCanvasRecorder, stubResizeObserver } from '@/src/app/testing/renderHarness';
import GenomeViewer from '../GenomeViewer';
import { DEFAULT_ALIGNMENT_COMPARISON } from '@/src/app/logic/alignmentComparison';
import { useState, type ComponentProps } from 'react';
import TopNav from '@/src/app/components/TopNav';
import type { SelectionArea } from '@/src/domain/bio/types';

beforeEach(() => {
  installCanvasRecorder(); stubResizeObserver();
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(500);
});
afterEach(() => vi.restoreAllMocks());
const noop = () => {};
const record = { id: 'ref', name: 'long reference name', sequence: 'ACGT', alignedSequence: 'ACGT', features: [] };
const menu = { settings: DEFAULT_ALIGNMENT_COMPARISON, onChange: noop, reference: record, candidates: [record] };
const defaults: ComponentProps<typeof GenomeViewer> = { records: [record], consensus: 'ACGT', showAnnotations: false,
  showTranslation: false, showTracks: false, showConservation: false, dragMode: 'pan', activeSelection: null,
  onSelectionChange: noop, onClearSelection: noop, onExportFasta: noop, onAddAnnotation: noop,
  searchResults: [], currentSearchIdx: -1, comparisonMenu: null };
const selection = { start: 0, end: 3, recordIds: ['ref'] };
it('Compare is absent when comparisonMenu is null', () => {
  render(<GenomeViewer {...defaults} />);
  expect(screen.queryByRole('button', { name: 'Compare to reference' })).toBeNull();
});
it('Compare renders after selection tools and before Fit', () => {
  render(<GenomeViewer {...defaults} activeSelection={selection} comparisonMenu={menu} />);
  const compare = screen.getByRole('button', { name: 'Compare to reference' });
  expect(screen.getByRole('button', { name: 'Clear selection' }).compareDocumentPosition(compare) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(compare.compareDocumentPosition(screen.getByRole('button', { name: 'Fit' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
it('appearing during the session sets arrive, first mount does not', () => {
  const view = render(<GenomeViewer {...defaults} comparisonMenu={menu} />);
  expect(screen.getByRole('button', { name: 'Compare to reference' }).getAttribute('data-arrive')).toBe('false');
  view.rerender(<GenomeViewer {...defaults} />);
  view.rerender(<GenomeViewer {...defaults} comparisonMenu={menu} />);
  expect(screen.getByRole('button', { name: 'Compare to reference' }).getAttribute('data-arrive')).toBe('true');
});
it('the open panel closes when comparisonMenu becomes null', () => {
  const view = render(<GenomeViewer {...defaults} comparisonMenu={menu} />);
  fireEvent.click(screen.getByRole('button', { name: 'Compare to reference' }));
  expect(screen.getByRole('group', { name: 'Reference comparison' })).toBeTruthy();
  view.rerender(<GenomeViewer {...defaults} />);
  expect(screen.queryByRole('group', { name: 'Reference comparison' })).toBeNull();
});
it('Clear selection shows only with a selection and calls onClearSelection', () => {
  const clear = vi.fn(); const view = render(<GenomeViewer {...defaults} onClearSelection={clear} />);
  expect(screen.queryByRole('button', { name: 'Clear selection' })).toBeNull();
  view.rerender(<GenomeViewer {...defaults} onClearSelection={clear} activeSelection={selection} />);
  const button = screen.getByRole('button', { name: 'Clear selection' });
  expect(button.getAttribute('data-tip')).toBe('Clear the current selection');
  fireEvent.click(button); expect(clear).toHaveBeenCalledOnce();
});
it('measured widths compact Compare and make Center and Zoom sel accessible icons', () => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
    const variant = this.getAttribute('data-toolbar-measure');
    const width = variant ? ({ full: 700, compareCompact: 650, iconActions: 550, noReadout: 300 }[variant] ?? 0) : 740;
    return { width, height: 40, top: 0, bottom: 40, left: 0, right: width } as DOMRect;
  });
  render(<GenomeViewer {...defaults} activeSelection={selection} comparisonMenu={menu} />);
  expect(screen.getByRole('button', { name: 'Compare to reference' }).textContent).toBe('Compare');
  expect(screen.getByRole('button', { name: 'Center' }).textContent).toBe('');
  expect(screen.getByRole('button', { name: 'Zoom Sel' }).textContent).toBe('');
});

it('dismissing the cog with Escape preserves selection and restores focus before a later Escape clears bases', () => {
  function Workspace() {
    const [activeSelection, setSelection] = useState<SelectionArea | null>(selection);
    return <>
      <TopNav sidebarOpen onToggleSidebar={noop} activeTab="alignment" onTabChange={noop}
        featureColors={{}} onSetFeatureColors={noop}
        showAlignmentControls dragMode="select" onDragModeChange={noop}
        showAnnotations onToggleAnnotations={noop} showTracks onToggleTracks={noop}
        showTranslation onToggleTranslation={noop} showConservation={false} onToggleConservation={noop}
        isAlignmentLoaded sessionMoleculeType="nucleotide" onSaveProject={() => null}
        onOpenProject={noop} onClearWorkspace={noop} sequenceCount={1} />
      <GenomeViewer {...defaults} activeSelection={activeSelection} onSelectionChange={setSelection} onClearSelection={() => setSelection(null)} />
    </>;
  }
  render(<Workspace />);
  expect(screen.getByRole('button', { name: 'Clear selection' })).toBeTruthy();
  const cog = screen.getByRole('button', { name: 'Project and options' });
  fireEvent.click(cog);
  fireEvent.keyDown(screen.getByRole('dialog', { name: 'Project and options' }), { key: 'Escape' });
  expect(screen.queryByRole('dialog', { name: 'Project and options' })).toBeNull();
  expect(document.activeElement).toBe(cog);
  expect(screen.getByRole('button', { name: 'Clear selection' })).toBeTruthy();
  fireEvent.keyDown(cog, { key: 'Escape' });
  expect(screen.queryByRole('button', { name: 'Clear selection' })).toBeNull();
});

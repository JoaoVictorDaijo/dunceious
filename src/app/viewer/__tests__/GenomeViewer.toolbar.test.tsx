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
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { render, screen, within, fireEvent, installCanvasRecorder, stubResizeObserver } from '@/src/app/testing/renderHarness';
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

it('offers both FASTA modes, explains outside windows and marks only mixed rows', () => {
  const exportFasta = vi.fn();
  const raw = { id: 'raw', name: 'raw', sequence: 'TTTTTTTT', features: [] };
  const view = render(<GenomeViewer {...defaults} records={[record, raw]} activeSelection={{ start: 1, end: 3, recordIds: [] }} onExportFasta={exportFasta} />);
  const toolbar = () => view.container.querySelector('[data-viewer-toolbar]')!;
  const trigger = () => within(toolbar() as HTMLElement).getByRole('button', { name: 'Export selection as FASTA' });
  fireEvent.click(trigger());
  const aligned = screen.getByRole('menuitem', { name: 'Aligned, with gaps' }) as HTMLButtonElement;
  expect(aligned.textContent).toBe('Aligned, with gaps');
  expect(aligned.disabled).toBe(false);
  fireEvent.click(aligned);
  expect(exportFasta).toHaveBeenCalledWith('aligned');
  expect(screen.queryByRole('menu')).toBeNull();
  fireEvent.click(trigger());
  fireEvent.click(screen.getByRole('menuitem', { name: 'Sequences only, no gaps' }));
  expect(exportFasta).toHaveBeenCalledWith('original');
  expect(toolbar().textContent).toContain('1 of 2 aligned');
  expect(toolbar().querySelector('[data-tip*="left out of conservation"]')?.getAttribute('data-tip')).toContain('raw');
  const rawLabel = view.container.querySelector<HTMLElement>('[data-unaligned]')!;
  expect(rawLabel.style.borderStyle).toBe('dashed');
  const tick = view.container.querySelector<HTMLElement>('[data-unaligned-end="raw"]')!;
  expect(tick.getAttribute('data-tip')).toBe('raw ends here: 8 bp, not aligned');
  expect(tick.style.left).not.toBe('');
  view.rerender(<GenomeViewer {...defaults} records={[record, raw]} activeSelection={{ start: 5, end: 7, recordIds: [] }} />);
  fireEvent.click(trigger());
  expect((screen.getByRole('menuitem', { name: 'Aligned, with gaps' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole('menuitem', { name: 'Aligned, with gaps' }).getAttribute('data-tip')).toBe('The selection is outside the alignment');
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
  view.rerender(<GenomeViewer {...defaults} records={[raw]} activeSelection={selection} />);
  fireEvent.click(trigger());
  expect((screen.getByRole('menuitem', { name: 'Aligned, with gaps' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole('menuitem', { name: 'Aligned, with gaps' }).getAttribute('data-tip')).toBe('No row is aligned');
  expect(toolbar().textContent).not.toContain('of 1 aligned');
});
it('offers aligned FASTA only for aligned record context menus', () => {
  const exportRecord = vi.fn();
  const view = render(<GenomeViewer {...defaults} onExportRecord={exportRecord} />);
  fireEvent.contextMenu(screen.getByText('ref'), { clientX: 10, clientY: 10 });
  fireEvent.click(screen.getByRole('button', { name: 'FASTA (aligned)' }));
  expect(exportRecord).toHaveBeenCalledWith('ref', 'aligned');
  view.rerender(<GenomeViewer {...defaults} records={[{ ...record, alignedSequence: undefined }]} onExportRecord={exportRecord} />);
  fireEvent.contextMenu(screen.getByText('ref'), { clientX: 10, clientY: 10 });
  expect(screen.queryByRole('button', { name: 'FASTA (aligned)' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'FASTA (no gaps)' }));
  expect(exportRecord).toHaveBeenCalledWith('ref');
});


it('exposes the FASTA menu as a keyboard-operated button and restores focus without clearing selection', () => {
  const clear = vi.fn();
  const exportFasta = vi.fn();
  const leakedKeys = vi.fn();
  render(<div onKeyDown={leakedKeys}><GenomeViewer {...defaults} activeSelection={selection} onClearSelection={clear} onExportFasta={exportFasta} /></div>);
  const trigger = screen.getByRole('button', { name: 'Export selection as FASTA' });
  expect(trigger.tagName).toBe('BUTTON');
  expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  trigger.focus();
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  const aligned = screen.getByRole('menuitem', { name: 'Aligned, with gaps' });
  const original = screen.getByRole('menuitem', { name: 'Sequences only, no gaps' });
  expect(trigger.getAttribute('aria-expanded')).toBe('true');
  expect(trigger.getAttribute('aria-controls')).toBe(screen.getByRole('menu').id);
  expect(document.activeElement).toBe(aligned);
  fireEvent.keyDown(aligned, { key: 'ArrowDown' });
  expect(document.activeElement).toBe(original);
  fireEvent.keyDown(original, { key: 'Home' });
  expect(document.activeElement).toBe(aligned);
  fireEvent.keyDown(aligned, { key: 'End' });
  expect(document.activeElement).toBe(original);
  fireEvent.keyDown(original, { key: 'Escape' });
  expect(screen.queryByRole('menu')).toBeNull();
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  expect(document.activeElement).toBe(trigger);
  expect(clear).not.toHaveBeenCalled();
  fireEvent.keyDown(trigger, { key: 'ArrowUp' });
  expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Sequences only, no gaps' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Sequences only, no gaps' }));
  expect(exportFasta.mock.calls).toEqual([['original']]);
  expect(leakedKeys).not.toHaveBeenCalled();
  expect(screen.queryByRole('menu')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

it('skips disabled aligned export and closes when focus or pointer leaves the menu', () => {
  render(<GenomeViewer {...defaults} records={[{ ...record, alignedSequence: undefined }]} activeSelection={selection} />);
  const trigger = screen.getByRole('button', { name: 'Export selection as FASTA' });
  fireEvent.click(trigger);
  const original = screen.getByRole('menuitem', { name: 'Sequences only, no gaps' });
  expect(document.activeElement).toBe(original);
  fireEvent.keyDown(original, { key: 'ArrowUp' });
  expect(document.activeElement).toBe(original);
  fireEvent.keyDown(original, { key: 'Tab' });
  expect(screen.queryByRole('menu')).toBeNull();
  fireEvent.click(trigger);
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Fit' }));
  expect(screen.queryByRole('menu')).toBeNull();
});

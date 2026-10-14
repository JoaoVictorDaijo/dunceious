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
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@/src/app/testing/renderHarness';
import { useHubState } from '@/src/app/hooks/useHubState';
import HubToolbar from '../HubToolbar';
import ImportMenu from '../ImportMenu';
function Subject({ navigate = () => {}, exportFasta = () => {} }: { navigate?: (direction: number) => void; exportFasta?: () => void }) {
  const state = useHubState();
  return <HubToolbar state={state} matchIndex={0} matchCount={3} onNavigate={navigate} onExport={exportFasta} imports={<span />} />;
}
describe('HubToolbar', () => {
  it('steps matches with Enter and Shift+Enter and keeps exports reachable', () => {
    const navigate = vi.fn(), exportFasta = vi.fn(); render(<Subject navigate={navigate} exportFasta={exportFasta} />);
    const search = screen.getByRole('searchbox', { name: 'Search annotations' });
    fireEvent.change(search, { target: { value: 'ORF4b' } });
    fireEvent.keyDown(search, { key: 'Enter' }); expect(navigate).toHaveBeenLastCalledWith(1);
    expect(screen.getByText((_, element) => element?.getAttribute('aria-live') === 'polite' && element.textContent === '1 / 3')).toBeTruthy();
    fireEvent.keyDown(search, { key: 'Enter', shiftKey: true }); expect(navigate).toHaveBeenLastCalledWith(-1);
    fireEvent.click(screen.getByRole('button', { name: 'Export…' })); expect(exportFasta).toHaveBeenCalledOnce();
  });
});

it('keeps empty search calm and clears before blurring on Escape', () => {
  render(<Subject />);
  const search = screen.getByRole('searchbox', { name: 'Search annotations' });
  expect(screen.queryByText((_, element) => element?.getAttribute('aria-live') === 'polite' && element.textContent === '1 / 3')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Previous match' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Next match' })).toBeNull();
  expect(screen.getByText('/')).toBeTruthy();
  fireEvent.focus(search);
  search.focus();
  expect(screen.getByText('esc')).toBeTruthy();
  expect(screen.queryByText('/')).toBeNull();
  fireEvent.change(search, { target: { value: 'spike' } });
  expect(screen.getByText((_, element) => element?.getAttribute('aria-live') === 'polite' && element.textContent === '1 / 3')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Previous match' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Next match' })).toBeTruthy();
  fireEvent.keyDown(search, { key: 'Escape' });
  expect(search).toHaveProperty('value', '');
  expect(document.activeElement).toBe(search);
  expect(screen.queryByRole('button', { name: 'Next match' })).toBeNull();
  expect(screen.getByText('esc')).toBeTruthy();
  fireEvent.keyDown(search, { key: 'Escape' });
  expect(document.activeElement).not.toBe(search);
  expect(screen.getByText('/')).toBeTruthy();
});

it('offers described imports with the original file pickers and empty-workspace gates', () => {
  const sequence = vi.fn(), annotations = vi.fn(), alignment = vi.fn(), project = vi.fn();
  function Imports({ empty = false, locked = false }: { empty?: boolean; locked?: boolean }) {
    const state = useHubState();
    return <ImportMenu state={state} empty={empty} locked={locked} onFileUpload={sequence} onAnnotationUpload={annotations} onAlignmentUpload={alignment} onProjectUpload={project} />;
  }
  const { rerender } = render(<Imports />);
  const trigger = screen.getByRole('button', { name: 'Import' });
  expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
  const cases = [
    ['Sequences', 'GenBank, GenPept or FASTA files', 'Import sequences files', '.gb,.genbank,.fasta,.fa', sequence],
    ['Annotations', 'GFF3, BED or bedGraph onto loaded sequences', 'Import annotations files', '.bed,.gff,.gff3,.bedgraph', annotations],
    ['Alignment', 'A pre-aligned FASTA of the loaded sequences', 'Import pre-aligned FASTA file', '.fasta,.fa', alignment],
    ['Dunceious project', 'Replaces the current workspace', 'Load project file', '.json', project],
  ] as const;
  for (const [name, description, label, accept, handler] of cases) {
    fireEvent.click(trigger);
    const item = screen.getByRole('menuitem', { name });
    expect(within(item).getByText(description)).toBeTruthy();
    expect(item).toHaveProperty('disabled', false);
    const picker = screen.getByLabelText(label) as HTMLInputElement;
    expect(picker.accept).toBe(accept);
    const click = vi.spyOn(picker, 'click');
    fireEvent.click(item);
    expect(click).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).toBeNull();
    const file = new File(['data'], 'input' + accept.split(',')[0]);
    fireEvent.change(picker, { target: { files: [file] } });
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].target.files[0]).toBe(file);
    click.mockRestore();
  }
  rerender(<Imports empty />);
  fireEvent.click(trigger);
  for (const name of ['Annotations', 'Alignment']) {
    const item = screen.getByRole('menuitem', { name });
    expect(item).toHaveProperty('disabled', true);
    expect(within(item).getByText('Load sequences first')).toBeTruthy();
  }
  for (const name of ['Sequences', 'Dunceious project']) expect(screen.getByRole('menuitem', { name })).toHaveProperty('disabled', false);
  expect(screen.getByText('Or drop files anywhere on the hub.')).toBeTruthy();
  expect(screen.getAllByRole('separator')).toHaveLength(1);
  expect(screen.queryByRole('menuitem', { name: /Save project|Clear workspace/ })).toBeNull();
  rerender(<Imports locked />);
  for (const [name] of cases) expect(screen.getByRole('menuitem', { name })).toHaveProperty('disabled', true);
});

it('keeps Import immediately before the visibly labelled Export', () => {
  function Paired() {
    const state = useHubState();
    return <HubToolbar state={state} matchIndex={-1} matchCount={0} onNavigate={() => {}} onExport={() => {}} imports={<ImportMenu state={state} onFileUpload={() => {}} onAnnotationUpload={() => {}} onAlignmentUpload={() => {}} onProjectUpload={() => {}} />} />;
  }
  render(<Paired />);
  const exportButton = screen.getByRole('button', { name: 'Export…' });
  expect(exportButton.textContent).toBe('Export');
  expect(exportButton.previousElementSibling?.contains(screen.getByRole('button', { name: 'Import' }))).toBe(true);
});

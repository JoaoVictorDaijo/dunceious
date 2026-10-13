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
import { it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, within } from '@/src/app/testing/renderHarness';
import { useHubState } from '@/src/app/hooks/useHubState';
import type { SeqRecord } from '@/src/domain/bio/types';
import { writeDetails } from '@/src/domain/bio/details';
import ExportDialog, { type ExportDialogProps } from '../ExportDialog';

const records: SeqRecord[] = ['a', 'b', 'c'].map(id => ({ id, name: id, sequence: 'ACGT', features: [] }));
function Subject({ value = records, selected = ['a', 'b'], onExport = vi.fn(), onEditDetails = vi.fn(), grouped = false, query = '' }: { value?: SeqRecord[]; selected?: string[]; onExport?: ExportDialogProps['onExport']; onEditDetails?: ExportDialogProps['onEditDetails']; grouped?: boolean; query?: string }) {
  const state = useHubState();
  const [open, setOpen] = useState(false);
  return <><button onClick={() => { state.setSelectedRecords(new Set(selected)); state.setGrouped(grouped); state.setFilters(prev => ({ ...prev, query })); setOpen(true); }}>Open export</button>{open && <ExportDialog records={value} state={state} onClose={() => setOpen(false)} onExport={onExport} onEditDetails={onEditDetails} />}</>;
}
function open() { fireEvent.click(screen.getByRole('button', { name: 'Open export' })); }
function format(name: string) { fireEvent.click(screen.getByRole('radio', { name })); }
it('ticks the two selected sequences and exports that choice with a footer filename', () => {
  const onExport = vi.fn(); render(<Subject onExport={onExport} />); open();
  expect((screen.getByRole('checkbox', { name: 'Export a' }) as HTMLInputElement).checked).toBe(true);
  expect((screen.getByRole('checkbox', { name: 'Export b' }) as HTMLInputElement).checked).toBe(true);
  expect((screen.getByRole('checkbox', { name: 'Export c' }) as HTMLInputElement).checked).toBe(false);
  expect(screen.getByText('2 sequences → sequences.fasta')).toBeTruthy();
  fireEvent.change(screen.getByRole('textbox', { name: 'File name' }), { target: { value: 'chosen' } });
  fireEvent.click(screen.getByRole('button', { name: 'Export' }));
  expect(onExport).toHaveBeenCalledWith(['a', 'b'], 'fasta', expect.objectContaining({ fileName: 'chosen.fasta', residues: 'original', header: 'id' }));
});
it('warns without blocking GenBank and offers bulk editing for every affected sequence', () => {
  const onEditDetails = vi.fn(); render(<Subject selected={['a', 'b', 'c']} onEditDetails={onEditDetails} />); open(); format('GenBank');
  expect(screen.getByText('3 sequences have no organism; NCBI validation will reject this file, though most viewers open it')).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Export' }) as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Edit details' }));
  expect(onEditDetails).toHaveBeenCalledWith(new Set(['a', 'b', 'c']));
  expect(screen.queryByRole('dialog')).toBeNull();
});
it('disables Keep alignment gaps without alignment and defaults both FASTA checkboxes off', () => {
  render(<Subject />); open();
  const gaps = screen.getByRole('checkbox', { name: 'Keep alignment gaps' }) as HTMLInputElement;
  expect(gaps.disabled).toBe(true); expect(gaps.checked).toBe(false);
  expect((screen.getByRole('checkbox', { name: 'Include details in the header (NCBI format)' }) as HTMLInputElement).checked).toBe(false);
});
it('exports explicit alignment and header choices', () => {
  const onExport = vi.fn(); render(<Subject value={records.map(r => ({ ...r, alignedSequence: 'A-CGT' }))} onExport={onExport} />); open();
  fireEvent.click(screen.getByLabelText('Keep alignment gaps')); fireEvent.click(screen.getByLabelText('Include details in the header (NCBI format)'));
  fireEvent.click(screen.getByRole('button', { name: 'Export' }));
  expect(onExport).toHaveBeenCalledWith(['a', 'b'], 'fasta', expect.objectContaining({ residues: 'aligned', header: 'details' }));
});
it('shows the real omitted edited detail count and its format spelling', () => {
  render(<Subject value={[writeDetails(records[0], { collectionDate: 'March 2014', host: 'camel' })]} selected={['a']} />); open(); format('GenBank');
  expect(screen.getByText(/1 invalid edited detail left out/)).toBeTruthy();
  fireEvent.click(screen.getByText('Details and omissions'));
  expect(screen.getByText(/Collection date.*collection_date.*0 written.*1 invalid value left out/)).toBeTruthy();
  expect(screen.getByText(/Host.*host.*1 written/)).toBeTruthy();
});
it('closes on Esc, traps Tab in both directions and restores focus to the opener', () => {
  render(<Subject />); const opener = screen.getByRole('button', { name: 'Open export' }); opener.focus(); open();
  const first = screen.getByRole('button', { name: 'Close export dialog' }), last = screen.getByRole('button', { name: 'Export' });
  first.focus(); fireEvent.keyDown(first, { key: 'Tab', shiftKey: true }); expect(document.activeElement).toBe(last);
  fireEvent.keyDown(last, { key: 'Tab' }); expect(document.activeElement).toBe(first);
  fireEvent.keyDown(first, { key: 'Escape' }); expect(screen.queryByRole('dialog')).toBeNull(); expect(document.activeElement).toBe(opener);
});
it('shows a partial group checkbox and retains hidden choices while finding a sequence', () => {
  render(<Subject />); open();
  const group = screen.getByRole('checkbox', { name: 'Export group All sequences' }) as HTMLInputElement;
  expect(group.indeterminate).toBe(true);
  fireEvent.change(screen.getByRole('searchbox', { name: 'Find sequences to export' }), { target: { value: 'c' } });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Export c' }));
  expect(screen.getByText('3 sequences → sequences.fasta')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'None' }));
  expect((screen.getByRole('button', { name: 'Export' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Selected in hub' }));
  expect(screen.getByText('2 sequences → sequences.fasta')).toBeTruthy();
});
it('groups every sequence exactly once and puts missing organisms last', () => {
  render(<Subject grouped value={[writeDetails(records[0], { organism: 'virus' }), records[1], writeDetails(records[2], { organism: 'virus' })]} />); open();
  const tree = screen.getByRole('region', { name: 'Sequences to export' });
  expect(within(tree).getAllByRole('checkbox').map(el => el.getAttribute('aria-label'))).toEqual(['Export group virus', 'Export a', 'Export c', 'Export group Not specified', 'Export b']);
});
it('offers exactly four formats and only the chosen description', () => {
  render(<Subject />); open();
  expect(screen.getAllByRole('radio')).toHaveLength(4);
  expect(screen.queryByText('Reopens only in Dunceious')).toBeNull(); format('Dunceious project');
  expect(screen.getByText('Reopens only in Dunceious')).toBeTruthy();
  expect(screen.queryByRole('checkbox', { name: 'Keep alignment gaps' })).toBeNull();
});

it('includes invalid edited organisms in the bulk repair selection according to the real report', () => {
  const onEditDetails = vi.fn();
  render(<Subject value={[writeDetails(records[0], { organism: 'invalid\norganism' }), writeDetails(records[1], { organism: 'valid organism' })]} onEditDetails={onEditDetails} />); open(); format('GenBank');
  expect(screen.getByText('1 sequence has no organism; NCBI validation will reject this file, though most viewers open it')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Edit details' }));
  expect(onEditDetails).toHaveBeenCalledWith(new Set(['a']));
});
it('blocks GenBank only when the actual serializer cannot represent the chosen annotations', () => {
  const value = [{ ...records[0], features: [{ name: 'unknown', type: 'gene', start: 0, end: 4, strand: 1 as const, metadata: { _gffStrand: '?' } }] }];
  render(<Subject value={value} selected={['a']} />); open(); format('GenBank');
  expect(screen.getByRole('alert').textContent).toContain('unknown or unstranded direction');
  expect((screen.getByRole('button', { name: 'Export' }) as HTMLButtonElement).disabled).toBe(true);
  format('GFF3');
  expect(screen.queryByRole('alert')).toBeNull();
  expect((screen.getByRole('button', { name: 'Export' }) as HTMLButtonElement).disabled).toBe(false);
});
it('starts with matching sequences and sends the matching annotation keys only when requested', () => {
  const onExport = vi.fn();
  const value = records.map(r => ({ ...r, features: [{ type: 'gene', name: r.id === 'b' ? 'spike' : 'other', start: 0, end: 4, strand: 1 as const }] }));
  render(<Subject value={value} selected={[]} query="spike" onExport={onExport} />); open();
  expect((screen.getByLabelText('Export a') as HTMLInputElement).checked).toBe(false);
  expect((screen.getByLabelText('Export b') as HTMLInputElement).checked).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'All' })); format('GFF3');
  fireEvent.click(screen.getByLabelText('Only annotations matching hub search and filters'));
  fireEvent.click(screen.getByRole('button', { name: 'Export' }));
  expect(onExport).toHaveBeenCalledWith(['a', 'b', 'c'], 'gff3', expect.objectContaining({ matchingKeys: new Set(['b:0']) }));
});
it('toggles the whole group and picks only sequences shown in the viewport', () => {
  render(<Subject value={records.map(r => ({ ...r, visible: r.id !== 'b' }))} />); open();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Export group All sequences' }));
  expect(screen.getByText('3 sequences → sequences.fasta')).toBeTruthy();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Export group All sequences' }));
  expect(screen.getByText('0 sequences → sequences.fasta')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Shown in viewport' }));
  expect((screen.getByLabelText('Export a') as HTMLInputElement).checked).toBe(true);
  expect((screen.getByLabelText('Export b') as HTMLInputElement).checked).toBe(false);
  expect((screen.getByLabelText('Export c') as HTMLInputElement).checked).toBe(true);
});

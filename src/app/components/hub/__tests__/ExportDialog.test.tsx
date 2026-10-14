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
import * as exportPlan from '@/src/app/logic/exportPlan';
import ExportDialog, { type ExportDialogProps } from '../ExportDialog';

const records: SeqRecord[] = ['a', 'b', 'c'].map(id => ({ id, name: id, sequence: 'ACGT', features: [] }));
function Subject({ value = records, selected = ['a', 'b'], onExport = vi.fn(), onEditDetails = vi.fn(), grouped = false, query = '', hidden = [], featureColors = {} }: { value?: SeqRecord[]; selected?: string[]; onExport?: ExportDialogProps['onExport']; onEditDetails?: ExportDialogProps['onEditDetails']; grouped?: boolean; query?: string; hidden?: string[]; featureColors?: Record<string, string> }) {
  const state = useHubState();
  const [open, setOpen] = useState(false);
  return <><button onClick={() => { state.setHubHidden(new Set(hidden)); state.setSelectedRecords(new Set(selected)); state.setGrouped(grouped); state.setFilters(prev => ({ ...prev, query })); setOpen(true); }}>Open export</button>{open && <ExportDialog featureColors={featureColors} records={value} state={state} onClose={() => setOpen(false)} onExport={onExport} onEditDetails={onEditDetails} />}</>;
}
function open() { fireEvent.click(screen.getByRole('button', { name: 'Open export' })); }
function paragraph(text: string | RegExp) {
  return screen.getByText((_, element) => Boolean(element && ['P', 'LI'].includes(element.tagName) && (typeof text === 'string' ? element.textContent === text : text.test(element.textContent ?? ''))));
}
function format(name: string) { fireEvent.click(screen.getByRole('radio', { name })); }
it('ticks the two selected sequences and exports that choice with the chosen filename', () => {
  const onExport = vi.fn(); render(<Subject onExport={onExport} />); open();
  expect((screen.getByRole('checkbox', { name: 'Export a' }) as HTMLInputElement).checked).toBe(true);
  expect((screen.getByRole('checkbox', { name: 'Export b' }) as HTMLInputElement).checked).toBe(true);
  expect((screen.getByRole('checkbox', { name: 'Export c' }) as HTMLInputElement).checked).toBe(false);
  expect(paragraph('2 sequences · 0 annotations → sequences.fasta')).toBeTruthy();
  fireEvent.change(screen.getByRole('textbox', { name: 'File name' }), { target: { value: 'chosen' } });
  fireEvent.click(screen.getByRole('button', { name: /^Export \d+ sequences?$/ }));
  expect(onExport).toHaveBeenCalledWith(['a', 'b'], 'fasta', expect.objectContaining({ fileName: 'chosen.fasta', residues: 'original', header: 'id' }));
});
it('warns without blocking GenBank and offers bulk editing for every affected sequence', () => {
  const onEditDetails = vi.fn(); render(<Subject selected={['a', 'b', 'c']} onEditDetails={onEditDetails} />); open(); format('GenBank');
  expect(paragraph('3 sequences have no organism; NCBI validation will reject this file, though most viewers open it')).toBeTruthy();
  expect((screen.getByRole('button', { name: /^Export \d+ sequences?$/ }) as HTMLButtonElement).disabled).toBe(false);
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
  fireEvent.click(screen.getByRole('button', { name: /^Export \d+ sequences?$/ }));
  expect(onExport).toHaveBeenCalledWith(['a', 'b'], 'fasta', expect.objectContaining({ residues: 'aligned', header: 'details' }));
});
it('shows the real omitted edited detail count and its format spelling', () => {
  render(<Subject value={[writeDetails(records[0], { collectionDate: 'March 2014', host: 'camel' })]} selected={['a']} />); open(); format('GenBank');
  expect(screen.getByRole('table', { name: 'Detail qualifiers' }).textContent).toContain('1 invalid, left out');
  fireEvent.click(screen.getByText('Details and omissions'));
  expect(paragraph(/Collection date.*collection_date.*0 written.*1 invalid value left out/)).toBeTruthy();
  expect(paragraph(/Host.*host.*1 written/)).toBeTruthy();
});
it('closes on Esc, traps Tab in both directions and restores focus to the opener', () => {
  render(<Subject />); const opener = screen.getByRole('button', { name: 'Open export' }); opener.focus(); open();
  const first = screen.getByRole('button', { name: 'Close export dialog' }), last = screen.getByRole('button', { name: /^Export \d+ sequences?$/ });
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
  expect(paragraph('3 sequences · 0 annotations → sequences.fasta')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'None' }));
  expect((screen.getByRole('button', { name: /^Export \d+ sequences?$/ }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Selected in hub' }));
  expect(paragraph('2 sequences · 0 annotations → sequences.fasta')).toBeTruthy();
});
it('groups every sequence exactly once and puts missing organisms last', () => {
  render(<Subject grouped value={[writeDetails(records[0], { organism: 'virus' }), records[1], writeDetails(records[2], { organism: 'virus' })]} />); open();
  const tree = screen.getByRole('region', { name: 'Sequences to export' });
  expect(within(tree).getAllByRole('checkbox').map(el => el.getAttribute('aria-label'))).toEqual(['Export group virus', 'Export a', 'Export c', 'Export group Not specified', 'Export b']);
});
it('offers exactly four formats with their destinations', () => {
  render(<Subject />); open();
  expect(screen.getAllByRole('radio')).toHaveLength(4);
  expect(within(screen.getByRole('radio', { name: 'Dunceious project' })).getByText('Reopens only in Dunceious')).toBeTruthy(); format('Dunceious project');
  expect(screen.queryByRole('checkbox', { name: 'Keep alignment gaps' })).toBeNull();
});

it('includes invalid edited organisms in the bulk repair selection according to the real report', () => {
  const onEditDetails = vi.fn();
  render(<Subject value={[writeDetails(records[0], { organism: 'invalid\norganism' }), writeDetails(records[1], { organism: 'valid organism' })]} onEditDetails={onEditDetails} />); open(); format('GenBank');
  expect(paragraph('1 sequence has no organism; NCBI validation will reject this file, though most viewers open it')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Edit details' }));
  expect(onEditDetails).toHaveBeenCalledWith(new Set(['a']));
});
it('blocks GenBank only when the actual serializer cannot represent the chosen annotations', () => {
  const value = [{ ...records[0], features: [{ name: 'unknown', type: 'gene', start: 0, end: 4, strand: 1 as const, metadata: { _gffStrand: '?' } }] }];
  render(<Subject value={value} selected={['a']} />); open(); format('GenBank');
  expect(screen.getByRole('alert').textContent).toContain('unknown or unstranded direction');
  expect((screen.getByRole('button', { name: /^Export \d+ sequences?$/ }) as HTMLButtonElement).disabled).toBe(true);
  format('GFF3');
  expect(screen.queryByRole('alert')).toBeNull();
  expect((screen.getByRole('button', { name: /^Export \d+ sequences?$/ }) as HTMLButtonElement).disabled).toBe(false);
});
it('starts with matching sequences and sends the matching annotation keys only when requested', () => {
  const onExport = vi.fn();
  const value = records.map(r => ({ ...r, features: [{ type: 'gene', name: r.id === 'b' ? 'spike' : 'other', start: 0, end: 4, strand: 1 as const }] }));
  render(<Subject value={value} selected={[]} query="spike" onExport={onExport} />); open();
  expect((screen.getByLabelText('Export a') as HTMLInputElement).checked).toBe(false);
  expect((screen.getByLabelText('Export b') as HTMLInputElement).checked).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'All' })); format('GFF3');
  fireEvent.click(screen.getByLabelText('Only annotations matching hub search and filters'));
  fireEvent.click(screen.getByRole('button', { name: /^Export \d+ sequences?$/ }));
  expect(onExport).toHaveBeenCalledWith(['a', 'b', 'c'], 'gff3', expect.objectContaining({ matchingKeys: new Set(['b:0']) }));
});
it('toggles the whole group and picks only sequences shown in the viewport', () => {
  render(<Subject value={records.map(r => ({ ...r, visible: r.id !== 'b' }))} />); open();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Export group All sequences' }));
  expect(paragraph('3 sequences · 0 annotations → sequences.fasta')).toBeTruthy();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Export group All sequences' }));
  expect(paragraph('0 sequences · 0 annotations → sequences.fasta')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Shown in viewport' }));
  expect((screen.getByLabelText('Export a') as HTMLInputElement).checked).toBe(true);
  expect((screen.getByLabelText('Export b') as HTMLInputElement).checked).toBe(false);
  expect((screen.getByLabelText('Export c') as HTMLInputElement).checked).toBe(true);
});


it('does not rerun the export serializer when only the filename changes', () => {
  const describe = vi.spyOn(exportPlan, 'describeExport');
  try {
    render(<Subject />); open(); format('GenBank');
    const count = describe.mock.calls.length;
    fireEvent.change(screen.getByLabelText('File name'), { target: { value: 'new name' } });
    expect(describe.mock.calls.length).toBe(count);
    expect(paragraph('2 sequences · 0 annotations → new name.gb')).toBeTruthy();
  } finally { describe.mockRestore(); }
});


it('renders format cards with unchanged radio names, extensions and keyboard selection', () => {
  render(<Subject />); open();
  const choices = [['FASTA', '.fasta'], ['GenBank', '.gb'], ['GFF3', '.gff3'], ['Dunceious project', '.json']];
  for (const [name, extension] of choices) {
    const radio = screen.getByRole('radio', { name });
    expect(within(radio).getByText(extension).className).toContain('font-mono');
    expect(radio.querySelector('i')).toBeTruthy();
  }
  const fasta = screen.getByRole('radio', { name: 'FASTA' });
  expect(fasta.className).toContain('border-env');
  fireEvent.keyDown(fasta, { key: 'ArrowRight' });
  const genbank = screen.getByRole('radio', { name: 'GenBank' });
  expect(genbank.getAttribute('aria-checked')).toBe('true');
  expect(document.activeElement).toBe(genbank);
});

it('shows user feature colours, annotation counts and selected-type swatches', () => {
  const value = [{ ...records[0], features: [
    { type: 'gene', name: 'gene', start: 0, end: 4, strand: 1 as const },
    { type: 'CDS', name: 'CDS', start: 0, end: 3, strand: 1 as const },
    { type: 'CDS', name: 'another CDS', start: 1, end: 4, strand: 1 as const },
  ] }];
  render(<Subject value={value} selected={['a']} featureColors={{ CDS: 'purple', gene: 'teal' }} />); open(); format('GenBank');
  const summary = screen.getByText('Annotation types · 2 of 2');
  expect(summary.querySelectorAll('[data-type-swatch]')).toHaveLength(2);
  fireEvent.click(summary);
  const cds = screen.getByRole('checkbox', { name: 'CDS' });
  expect(cds.parentElement!.querySelector<HTMLElement>('[data-type-swatch]')!.style.backgroundColor).toBe('purple');
  expect(within(cds.parentElement!).getByText('2').className).toContain('font-mono');
  fireEvent.click(cds);
  expect(screen.getByText('Annotation types · 1 of 2').querySelectorAll('[data-type-swatch]')).toHaveLength(1);
});

it('describes disabled gaps through both the wrapper tooltip and input description', () => {
  render(<Subject />); open();
  const gaps = screen.getByRole('checkbox', { name: 'Keep alignment gaps' });
  const reason = document.getElementById(gaps.getAttribute('aria-describedby') ?? '');
  expect(reason?.textContent).toBe('No alignment loaded. Upload a pre-aligned FASTA to keep gap characters.');
  expect(gaps.closest('[data-tip]')?.getAttribute('data-tip')).toBe(reason?.textContent);
});

function activeQuickPicks() {
  return ['All', 'Selected in hub', 'Matching filters', 'Shown in viewport', 'None'].filter(name => screen.getByRole('button', { name }).getAttribute('aria-pressed') === 'true');
}

it('highlights only the last quick pick even when several select the same sequences', () => {
  render(<Subject />); open();
  expect(activeQuickPicks()).toEqual(['Selected in hub']);
  fireEvent.click(screen.getByRole('button', { name: 'All' }));
  expect(activeQuickPicks()).toEqual(['All']);
  fireEvent.click(screen.getByRole('button', { name: 'Matching filters' }));
  expect(activeQuickPicks()).toEqual(['Matching filters']);
  fireEvent.click(screen.getByRole('button', { name: 'Shown in viewport' }));
  expect(activeQuickPicks()).toEqual(['Shown in viewport']);
  fireEvent.click(screen.getByRole('button', { name: 'None' }));
  expect(activeQuickPicks()).toEqual(['None']);
});

it('defaults the quick pick to All when all sequences are initially selected', () => {
  render(<Subject selected={['a', 'b', 'c']} />); open();
  expect(activeQuickPicks()).toEqual(['All']);
});

it('clears the quick pick on manual sequence and group edits, even if the selection matches a pick again', () => {
  render(<Subject />); open();
  fireEvent.click(screen.getByRole('button', { name: 'All' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Export c' }));
  expect(activeQuickPicks()).toEqual([]);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Export c' }));
  expect(activeQuickPicks()).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: 'All' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Export group All sequences' }));
  expect(activeQuickPicks()).toEqual([]);
});

it('shows accessions, display names, lengths and annotation counts in selected tree rows', () => {
  render(<Subject value={[{ ...records[0], accession: 'AC001', label: 'Sample A' }]} selected={['a']} />); open();
  const row = screen.getByRole('checkbox', { name: 'Export a' }).parentElement!;
  expect(within(row).getByText('AC001').className).toContain('font-mono');
  expect(within(row).getByText('Sample A').className).toContain('text-slate-500');
  expect(within(row).getByText('4 bp').className).toContain('font-mono');
  expect(within(row).getByText('0 annot.').className).toContain('font-mono');
  expect(row.className).toContain('bg-amber-50');
});


it('portals the export dialog inside the app root carrying the session accent', () => {
  const { container } = render(<div className="app-root" data-env="hub" style={{ '--env': 'orange' } as React.CSSProperties}><Subject /></div>);
  open();
  const root = container.querySelector('.app-root')!;
  const dialog = screen.getByRole('dialog', { name: 'Export sequences' });
  expect(root.contains(dialog)).toBe(true);
  expect(dialog.closest('.app-root')).toBe(root);
});

it('keeps hub and viewport visibility separate in export quick picks', () => {
  render(<Subject value={records.map(record => ({ ...record, visible: record.id !== 'c' }))} selected={['a', 'b']} hidden={['b']} />); open();
  const chosen = () => records.filter(record => (screen.getByRole('checkbox', { name: `Export ${record.id}` }) as HTMLInputElement).checked).map(record => record.id);
  expect(chosen()).toEqual(['a']);
  for (const [pick, expected] of [['Selected in hub', ['a']], ['Matching filters', ['a', 'c']], ['Shown in hub', ['a', 'c']], ['Shown in viewport', ['a', 'b']], ['All', ['a', 'b', 'c']]] as const) {
    fireEvent.click(screen.getByRole('button', { name: pick })); expect(chosen()).toEqual(expected);
  }
});


it('counts quick picks, disables empty picks and keeps None available', () => {
  render(<Subject selected={[]} query="absent" />); open();
  const selected = screen.getByRole('button', { name: 'Selected in hub' });
  expect(within(selected).getByText('0')).toBeTruthy();
  expect((selected as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button', { name: 'Matching filters' }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button', { name: 'None' }) as HTMLButtonElement).disabled).toBe(false);
  expect(within(screen.getByRole('button', { name: 'All' })).getByText('3')).toBeTruthy();
});
it('shows format purpose and destination on every card with the file name under the preview', () => {
  render(<Subject />); open();
  expect(screen.getByText('Pick the sequences, then the format. Files are built in your browser.')).toBeTruthy();
  const labels = [
    ['FASTA', 'Sequences only', 'Aligners, BLAST, any sequence tool'],
    ['GenBank', 'Sequences, annotations and details', 'NCBI tools, SnapGene, Geneious, Biopython'],
    ['GFF3', 'Annotations only', 'Genome browsers (IGV, JBrowse), pipelines'],
    ['Dunceious project', 'Everything, including colours and edit marks', 'Reopens only in Dunceious'],
  ];
  for (const [name, what, where] of labels) {
    const radio = screen.getByRole('radio', { name });
    expect(within(radio).getByText(what)).toBeTruthy();
    expect(within(radio).getByText(where)).toBeTruthy();
  }
  const options = screen.getByRole('region', { name: 'Export options' });
  expect(options.contains(screen.getByRole('textbox', { name: 'File name' }))).toBe(true);
  expect(screen.getByRole('button', { name: 'Export 2 sequences' })).toBeTruthy();
});
it('lists written, empty and invalid detail counts directly in the GenBank preview', () => {
  const value = [writeDetails(records[0], { host: 'camel', collectionDate: 'invalid' }), records[1]];
  render(<Subject value={value} />); open(); format('GenBank');
  const table = screen.getByRole('table', { name: 'Detail qualifiers' });
  const rows = within(table).getAllByRole('row');
  const host = rows.find(row => row.textContent?.startsWith('Host'))!;
  const date = rows.find(row => row.textContent?.startsWith('Collection date'))!;
  expect(host.textContent).toContain('/host');
  expect(host.textContent).toContain('1 written · 1 empty · 0 invalid, left out');
  expect(date.textContent).toContain('0 written · 1 empty · 1 invalid, left out');
});

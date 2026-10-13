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
import { useState } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, stubResizeObserver, within } from '@/src/app/testing/renderHarness';
import { useHubState } from '@/src/app/hooks/useHubState';
import { useFeatureManager } from '@/src/app/hooks/useFeatureManager';
import { writeDetails } from '@/src/domain/bio/details';
import * as comparison from '@/src/app/logic/featureComparison';
import HubIndex from '../hub/HubIndex';
import AnnotationHubPanel, { type HubFocusOrigin } from '../AnnotationHubPanel';
import type { SeqRecord } from '@/src/domain/bio/types';
const records: SeqRecord[] = Array.from({ length: 8 }, (_, i) => ({ id: `seq${i}`, name: `seq${i}`, sequence: 'A'.repeat(100), features: [{ name: i < 3 ? 'ORF4b' : `gene${i}`, type: 'CDS', start: 5, end: 15, strand: 1 }] }));
const noop = () => {};
function Subject({ initial = records, dropped = noop, focused = noop, locked = false, index = false }: { index?: boolean; initial?: SeqRecord[]; dropped?: (files: File[]) => void; focused?: (...args: unknown[]) => void; locked?: boolean }) {
  const state = useHubState();
  const [value, setValue] = useState(initial);
  const manager = useFeatureManager(value, setValue, null, noop);
  const [origin, setOrigin] = useState<HubFocusOrigin | null>(null);
  const [viewport, setViewport] = useState(false);
  if (viewport) return <><button onClick={() => { if (origin) state.setJumpTarget(prev => ({ key: origin.key, serial: (prev?.serial ?? 0) + 1 })); setViewport(false); }}>Return to hub</button><button onClick={() => setViewport(false)}>Switch back normally</button></>;
  return <><button onClick={() => setViewport(true)}>Visit viewport</button>{index && <HubIndex records={value} state={state} onToggleRecordVisibility={noop} />}<AnnotationHubPanel records={value} state={state} featureColors={{}} onStartNewFeature={noop} onToggleRecordVisibility={noop} isAlignmentLocked={locked} onRemoveRecord={noop} onViewFeatureDetails={noop} onEditFeature={noop} onRemoveFeature={manager.removeFeature} onDeleteRows={manager.removeFeatures} undoAvailable={manager.undoAvailable} onUndoDelete={manager.undoDelete} onSetRecordDetails={manager.setRecordDetails} onSetRecordLabel={manager.setRecordLabel} onSetDetail={(ids, key, detail) => setValue(prev => prev.map(r => ids.has(r.id) ? writeDetails(r, { [key]: detail }) : r))} onFocusItem={(target, from) => { focused(target, from); setOrigin(from); setViewport(true); }} lastFocusedKey={origin?.key} onExportProjectJson={noop} onExportRecords={noop} onClearAll={noop} addLog={noop} onFileUpload={noop} onAlignmentUpload={noop} onAnnotationUpload={noop} onProjectUpload={noop} onDroppedFiles={dropped} /></>;
}
beforeEach(stubResizeObserver);
describe('AnnotationHubPanel', () => {
  it('counts feature identities without running comparisons until the Features tab opens', () => {
    const build = vi.spyOn(comparison, 'buildFeatureGroups');
    try {
      render(<Subject index />);
      expect(screen.getByRole('tab', { name: 'Features 6' })).toBeTruthy();
      expect(build).not.toHaveBeenCalled();
      fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'ORF4b' } });
      expect(screen.getByRole('tab', { name: 'Features 1' })).toBeTruthy();
      expect(build).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('tab', { name: 'Features 1' }));
      expect(build).toHaveBeenCalled();
      expect(within(screen.getByRole('region', { name: 'Pinned section' })).getByText('not compared: organism unknown')).toBeTruthy();
    } finally { build.mockRestore(); }
  });

  it('opens export from the selection bar with selected sequences and Esc leaves selection intact', () => {
    render(<Subject />);
    fireEvent.click(screen.getAllByLabelText('Select sequence seq0')[0]);
    fireEvent.click(screen.getAllByLabelText('Select sequence seq1')[0]);
    const bar = screen.getByLabelText('Selection actions');
    fireEvent.click(within(bar).getByRole('button', { name: 'Export…' }));
    expect((screen.getByLabelText('Export seq0') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Export seq1') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Export seq2') as HTMLInputElement).checked).toBe(false);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('2 sequences selected')).toBeTruthy();
  });
  it('routes missing-organism editing to bulk Organism for every affected sequence, focused and only empty', () => {
    render(<Subject initial={[records[0], writeDetails(records[1], { organism: 'known virus' }), records[2]]} />);
    fireEvent.click(screen.getAllByLabelText('Select sequence seq1')[0]);
    const hub = screen.getByRole('region', { name: 'Annotation Hub' });
    fireEvent.click(within(hub).getAllByRole('button', { name: 'Export…' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    fireEvent.click(screen.getByRole('radio', { name: 'GenBank' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Edit details' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect((screen.getAllByLabelText('Select sequence seq0')[0] as HTMLInputElement).checked).toBe(true);
    expect((screen.getAllByLabelText('Select sequence seq2')[0] as HTMLInputElement).checked).toBe(true);
    expect((screen.getAllByLabelText('Select sequence seq1')[0] as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText('Detail field') as HTMLSelectElement).value).toBe('organism');
    expect((screen.getByLabelText('only where empty') as HTMLInputElement).checked).toBe(true);
    expect(document.activeElement).toBe(screen.getByLabelText('Detail value'));
    fireEvent.change(screen.getByLabelText('Detail value'), { target: { value: 'new virus' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getByRole('status').textContent).toBe('Set Organism on 2 sequences');
  });

  it('searches annotations and advances through matches with Enter', () => {
    render(<Subject />); const search = screen.getByRole('searchbox', { name: 'Search annotations' });
    fireEvent.change(search, { target: { value: 'ORF4b' } }); fireEvent.keyDown(search, { key: 'Enter' });
    expect(screen.getByText('1 / 3')).toBeTruthy();
    fireEvent.keyDown(search, { key: 'Enter' }); expect(screen.getByText('2 / 3')).toBeTruthy();
  });
  it('moves the current row with J and selects it with X while ignoring text fields', () => {
    render(<Subject />); const hub = screen.getByRole('region', { name: 'Annotation Hub' });
    fireEvent.keyDown(hub, { key: 'j' }); fireEvent.keyDown(hub, { key: 'j' }); fireEvent.keyDown(hub, { key: 'x' });
    expect((screen.getByLabelText('Select annotation ORF4b on seq1') as HTMLInputElement).checked).toBe(true);
    fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'j' });
    expect(screen.getAllByRole('checkbox').filter(el => (el as HTMLInputElement).checked)).toHaveLength(1);
  });
  it('accepts hub shortcuts from the sidebar index', () => {
    render(<Subject index />); const index = screen.getByRole('region', { name: 'Hub index' });
    fireEvent.keyDown(index, { key: 'j' }); fireEvent.keyDown(index, { key: 'x' });
    expect((screen.getByLabelText('Select annotation ORF4b on seq0') as HTMLInputElement).checked).toBe(true);
  });
  it('keeps a keyboard-selected checkbox mounted and focused', () => {
    render(<Subject />); const checkbox = screen.getByLabelText('Select annotation ORF4b on seq0');
    checkbox.focus(); fireEvent.click(checkbox);
    expect(screen.getByLabelText('Select annotation ORF4b on seq0')).toBe(checkbox);
    expect(document.activeElement).toBe(checkbox);
  });
  it('disables destructive and import actions during alignment lock', () => {
    const dropped = vi.fn(); render(<Subject locked dropped={dropped} />);
    expect(screen.getByRole('button', { name: 'Delete ORF4b on seq0' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'More workspace actions' }));
    expect(screen.getByRole('menuitem', { name: 'Clear workspace…' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('menuitem', { name: 'Sequences…' }).hasAttribute('disabled')).toBe(true);
    fireEvent.drop(screen.getByRole('region', { name: 'Annotation Hub' }), { dataTransfer: { files: [new File([''], 'a.fa')] } });
    expect(dropped).not.toHaveBeenCalled();
  });
  it('closes an open menu before clearing the selection with Esc', () => {
    render(<Subject />); fireEvent.click(screen.getByLabelText('Select annotation ORF4b on seq0'));
    fireEvent.click(screen.getByRole('button', { name: 'More workspace actions' }));
    fireEvent.keyDown(screen.getByRole('region', { name: 'Annotation Hub' }), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect((screen.getByLabelText('Select annotation ORF4b on seq0') as HTMLInputElement).checked).toBe(true);
  });
  it('routes dropped files from the working canvas', () => {
    const dropped = vi.fn(); render(<Subject dropped={dropped} />);
    const files = [new File(['>a\nAAAA'], 'a.fa'), new File([''], 'a.gff3')];
    fireEvent.drop(screen.getByRole('region', { name: 'Annotation Hub' }), { dataTransfer: { files } });
    expect(dropped).toHaveBeenCalledWith(files);
  });
  it('restores a deleted annotation at its original index with Undo', () => {
    render(<Subject initial={[{ ...records[0], features: ['a', 'b', 'c'].map(name => ({ name, type: 'gene', start: 0, end: 2, strand: 1 })) }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete b on seq0' })); expect(screen.queryByText('b')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getAllByRole('button', { name: /^Delete .* on seq0$/ }).map(el => el.getAttribute('aria-label'))).toEqual(['Delete a on seq0', 'Delete b on seq0', 'Delete c on seq0']);
  });
  it('returns from viewport focus to the off-screen origin with the new row key', () => {
    const focused = vi.fn(); render(<Subject focused={focused} index />);
    fireEvent.click(screen.getByRole('button', { name: 'Jump to sequence seq7' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open gene7 on seq7 in viewport' }));
    expect(focused).toHaveBeenCalledWith({ recordId: 'seq7', start: 5, end: 15, label: 'gene7', length: 10 }, { key: 'seq7:0', label: 'gene7' });
    fireEvent.click(screen.getByText('Return to hub')); expect(screen.getByText('Last focused')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Pinned section' })).getByText('seq7')).toBeTruthy();
  });
  it('preserves the current scroll position on ordinary tab switches after a focus return', () => {
    render(<Subject index />); fireEvent.click(screen.getByRole('button', { name: 'Jump to sequence seq7' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open gene7 on seq7 in viewport' }));
    fireEvent.click(screen.getByText('Return to hub'));
    fireEvent.click(screen.getByRole('button', { name: 'Jump to sequence seq0' }));
    fireEvent.click(screen.getByText('Visit viewport')); fireEvent.click(screen.getByText('Switch back normally'));
    expect(within(screen.getByRole('region', { name: 'Pinned section' })).getByText('seq0')).toBeTruthy();
  });
  it('keeps annotation selection on its feature when bulk details create source data', () => {
    render(<Subject initial={[{ ...records[0], features: ['a', 'b'].map(name => ({ name, type: 'gene', start: 0, end: 2, strand: 1 })) }]} />);
    fireEvent.click(screen.getByLabelText('Select annotation b on seq0'));
    fireEvent.click(within(screen.getByRole('region', { name: 'Pinned section' })).getByLabelText('Select sequence seq0'));
    fireEvent.change(screen.getByLabelText('Detail value'), { target: { value: 'camel' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect((screen.getByLabelText('Select annotation b on seq0') as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Delete with undo' }));
    expect(screen.queryByText('b')).toBeNull(); expect(screen.getByText('a')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Pinned section' })).getByText('camel')).toBeTruthy();
  });
  it('reveals a missing sequence after a filtered Features jump and explains the cleared filters', () => {
    const source = { name: 'source', type: 'source', start: 0, end: 100, strand: 1 as const, metadata: { organism: 'Virus' } };
    const initial = [{ ...records[0], features: [source, records[0].features[0]] }, { ...records[1], features: [source, { ...records[1].features[0], name: 'other' }] }];
    render(<Subject initial={initial} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Features 2' }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'ORF4b' } });
    fireEvent.click(screen.getByRole('button', { name: 'CDS 2' }));
    fireEvent.change(screen.getByLabelText('Strand'), { target: { value: 'fwd' } });
    fireEvent.click(within(screen.getByRole('region', { name: 'Pinned section' })).getByRole('button', { name: 'seq1' }));
    expect(within(screen.getByRole('region', { name: 'Pinned section' })).getByText('seq1')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Search and type filters cleared to show seq1');
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('');
  });
  it('exposes the full long location to tooltip and assistive technology', () => {
    const location = 'complement(join(97999..98793,69611..69724))';
    render(<Subject initial={[{ ...records[0], features: [{ ...records[0].features[0], locationString: location }] }]} />);
    expect(screen.getByLabelText(`Location: ${location}`).getAttribute('title')).toBe(location);
  });
  it('shows biological lengths with thousands separators', () => {
    render(<Subject initial={[{ ...records[0], sequence: 'A'.repeat(30000), features: [{ name: 'long', type: 'CDS', start: 0, end: 21290, strand: 1 }] }]} />);
    expect(screen.getByText('21,290 bp')).toBeTruthy();
  });
  it('identifies each Features row by accession, annotation and isolate', () => {
    const source = { name: 'source', type: 'source', start: 0, end: 100, strand: 1 as const, metadata: { organism: 'Virus', isolate: 'camel-1' } };
    render(<Subject initial={[{ ...records[0], features: [source, { name: 'gene S', type: 'gene', start: 0, end: 30, strand: 1, metadata: { gene: 'S' } }, { name: 'spike', type: 'CDS', start: 0, end: 30, strand: 1, metadata: { gene: 'S', product: 'surface protein' } }] }]} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Features 1' }));
    expect(screen.getByText('gene S · camel-1')).toBeTruthy();
    expect(screen.getByText('spike · surface protein · camel-1')).toBeTruthy();
  });
  it('keeps biological length and aligned geometry in focus', () => {
    const focused = vi.fn();
    render(<Subject focused={focused} initial={[{ id: 'gap', name: 'gap', sequence: 'ACGTACGT', alignedSequence: '--A-CG--TA-C--GT--', features: [{ name: 'joined', type: 'gene', start: 0, end: 8, strand: 1, segments: [{ start: 0, end: 3 }, { start: 4, end: 8 }] }] }]} />);
    expect(screen.getByText('7 bp')).toBeTruthy(); fireEvent.click(screen.getByRole('button', { name: 'Open joined on gap in viewport' }));
    expect(focused).toHaveBeenCalledWith({ recordId: 'gap', start: 2, end: 16, label: 'joined', length: 7 }, { key: 'gap:0', label: 'joined' });
  });
});

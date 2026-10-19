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
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, stubResizeObserver, within } from '@/src/app/testing/renderHarness';
import { useHubState } from '@/src/app/hooks/useHubState';
import { useFeatureManager } from '@/src/app/hooks/useFeatureManager';
import { writeDetails } from '@/src/domain/bio/details';
import * as comparison from '@/src/app/logic/featureComparison';
import HubIndex from '../hub/HubIndex';
import AnnotationHubPanel, { type HubFocusOrigin } from '../AnnotationHubPanel';
import type { HubFilters } from '@/src/app/logic/hubModel';
import type { SeqRecord } from '@/src/domain/bio/types';
const records: SeqRecord[] = Array.from({ length: 8 }, (_, i) => ({ id: `seq${i}`, name: `seq${i}`, sequence: 'A'.repeat(100), features: [{ name: i < 3 ? 'ORF4b' : `gene${i}`, type: 'CDS', start: 5, end: 15, strand: 1 }] }));
function currentHeader(): HTMLElement {
  return document.querySelector<HTMLElement>('[data-section-surface][data-state="current"], [data-feature-surface][data-state="current"]')!;
}
function normalizedText(element: Element): string {
  return element.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}
const noop = () => {};
function Subject({ initial = records, dropped = noop, focused = noop, locked = false, index = false, uploaded = noop, loadOnUpload, filtersSeed, problems = false }: { uploaded?: (event: ChangeEvent<HTMLInputElement>) => void; loadOnUpload?: SeqRecord[]; filtersSeed?: Partial<HubFilters>; problems?: boolean; index?: boolean; initial?: SeqRecord[]; dropped?: (files: File[]) => void; focused?: (...args: unknown[]) => void; locked?: boolean }) {
  const state = useHubState();
  const { setFilters, setOnlyProblems } = state;
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    if (filtersSeed) setFilters(previous => ({ ...previous, ...filtersSeed }));
    if (problems) setOnlyProblems(true);
  }, [filtersSeed, problems, setFilters, setOnlyProblems]);
  const [toolsSlot, setToolsSlot] = useState<HTMLDivElement | null>(null);
  const [value, setValue] = useState(initial);
  const manager = useFeatureManager(value, setValue, null, noop);
  const [origin, setOrigin] = useState<HubFocusOrigin | null>(null);
  const [viewport, setViewport] = useState(false);
  if (viewport) return <><button onClick={() => { if (origin) state.setJumpTarget(prev => ({ key: origin.key, serial: (prev?.serial ?? 0) + 1 })); setViewport(false); }}>Return to hub</button><button onClick={() => setViewport(false)}>Switch back normally</button></>;
  return <><div aria-label="Header tools" data-hub-focus ref={setToolsSlot} /><button onClick={() => state.setJumpTarget({ key: 'seq7:0', serial: 1 })}>Request hidden jump</button><span aria-label="Pending hub jump">{state.jumpTarget?.key ?? 'none'}</span><button onClick={() => setViewport(true)}>Visit viewport</button>{index && <HubIndex records={value} state={state} />}<AnnotationHubPanel toolsSlot={toolsSlot} records={value} state={state} featureColors={{}} onStartNewFeature={noop} isAlignmentLocked={locked} onRemoveRecord={noop} onViewFeatureDetails={noop} onEditFeature={noop} onRemoveFeature={manager.removeFeature} onDeleteRows={manager.removeFeatures} undoAvailable={manager.undoAvailable} onUndoDelete={manager.undoDelete} onSetRecordDetails={manager.setRecordDetails} onSetRecordLabel={manager.setRecordLabel} onSetDetail={(ids, key, detail) => setValue(prev => prev.map(r => ids.has(r.id) ? writeDetails(r, { [key]: detail }) : r))} onFocusItem={(target, from) => { focused(target, from); setOrigin(from); setViewport(true); }} lastFocusedKey={origin?.key} onExportProjectJson={noop} onExportRecords={noop} onClearAll={noop} addLog={noop} onFileUpload={event => { uploaded(event); if (loadOnUpload) setValue(loadOnUpload); }} onAlignmentUpload={noop} onAnnotationUpload={noop} onProjectUpload={noop} onDroppedFiles={dropped} /></>;
}
beforeEach(stubResizeObserver);
describe('AnnotationHubPanel', () => {
  it('portals the tools out of the panel and retains an accessible page heading', () => {
    render(<Subject />);
    const panel = screen.getByRole('region', { name: 'Annotation Hub' });
    expect(within(panel).queryByRole('searchbox')).toBeNull();
    expect(within(screen.getByLabelText('Header tools')).getByRole('searchbox')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Annotation Hub' })).toBeTruthy();
    expect(normalizedText(document.querySelector('[data-hub-summary]')!)).toBe('8 of 8 annotations in 8 of 8 sequences');
  });

  it('counts feature identities without running comparisons until the Features tab opens', () => {
    const build = vi.spyOn(comparison, 'buildFeatureGroups');
    try {
      render(<Subject index />);
      expect(screen.getByRole('tab', { name: 'By feature 6' })).toBeTruthy();
      expect(build).not.toHaveBeenCalled();
      fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'ORF4b' } });
      expect(screen.getByRole('tab', { name: 'By feature 1' })).toBeTruthy();
      expect(build).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('tab', { name: 'By feature 1' }));
      expect(build).toHaveBeenCalled();
      expect(within(currentHeader()).getByText('not compared: organism unknown')).toBeTruthy();
    } finally { build.mockRestore(); }
  });

  it('opens export from the selection bar with selected sequences and Esc leaves selection intact', () => {
    render(<Subject />);
    fireEvent.click(within(screen.getByRole('region', { name: 'Annotations' })).getByRole('checkbox', { name: 'Select sequence seq0' }));
    fireEvent.click(within(screen.getByRole('region', { name: 'Annotations' })).getByRole('checkbox', { name: 'Select sequence seq1' }));
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
    fireEvent.click(within(screen.getByRole('region', { name: 'Annotations' })).getByRole('checkbox', { name: 'Select sequence seq1' }));
    fireEvent.click(within(screen.getByLabelText('Header tools')).getByRole('button', { name: 'Export…' }));
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    fireEvent.click(screen.getByRole('radio', { name: 'GenBank' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Edit details' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect((within(screen.getByRole('region', { name: 'Annotations' })).getByRole('checkbox', { name: 'Select sequence seq0' }) as HTMLInputElement).checked).toBe(true);
    expect((within(screen.getByRole('region', { name: 'Annotations' })).getByRole('checkbox', { name: 'Select sequence seq2' }) as HTMLInputElement).checked).toBe(true);
    expect((within(screen.getByRole('region', { name: 'Annotations' })).getByRole('checkbox', { name: 'Select sequence seq1' }) as HTMLInputElement).checked).toBe(false);
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
    expect(normalizedText(document.querySelector('[data-search-counter]')!)).toBe('1 / 3');
    fireEvent.keyDown(search, { key: 'Enter' }); expect(normalizedText(document.querySelector('[data-search-counter]')!)).toBe('2 / 3');
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
    const dropped = vi.fn(); render(<Subject locked index dropped={dropped} />);
    expect(screen.getByRole('button', { name: 'Delete ORF4b on seq0' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect(screen.getByRole('menuitem', { name: 'Alignment' }).hasAttribute('disabled')).toBe(true);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect(screen.getByRole('menuitem', { name: 'Sequences' }).hasAttribute('disabled')).toBe(true);
    fireEvent.drop(screen.getByRole('region', { name: 'Annotation Hub' }), { dataTransfer: { files: [new File([''], 'a.fa')] } });
    expect(dropped).not.toHaveBeenCalled();
  });
  it('closes an open menu before clearing the selection with Esc', () => {
    render(<Subject />); fireEvent.click(screen.getByLabelText('Select annotation ORF4b on seq0'));
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
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
    expect(focused).toHaveBeenCalledWith({ recordId: 'seq7', featureIndex: 0, start: 5, end: 15, label: 'gene7', length: 10 }, { key: 'seq7:0', label: 'gene7' });
    fireEvent.click(screen.getByText('Return to hub')); expect(screen.getByText('Last focused')).toBeTruthy();
    expect(within(currentHeader()).getByText('seq7')).toBeTruthy();
  });
  it('preserves the current scroll position on ordinary tab switches after a focus return', () => {
    render(<Subject index />); fireEvent.click(screen.getByRole('button', { name: 'Jump to sequence seq7' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open gene7 on seq7 in viewport' }));
    fireEvent.click(screen.getByText('Return to hub'));
    fireEvent.click(screen.getByRole('button', { name: 'Jump to sequence seq0' }));
    fireEvent.click(screen.getByText('Visit viewport')); fireEvent.click(screen.getByText('Switch back normally'));
    expect(within(currentHeader()).getByText('seq0')).toBeTruthy();
  });
  it('keeps annotation selection on its feature when bulk details create source data', () => {
    render(<Subject initial={[{ ...records[0], features: ['a', 'b'].map(name => ({ name, type: 'gene', start: 0, end: 2, strand: 1 })) }]} />);
    fireEvent.click(screen.getByLabelText('Select annotation b on seq0'));
    fireEvent.click(within(currentHeader()).getByLabelText('Select sequence seq0'));
    fireEvent.change(screen.getByLabelText('Detail value'), { target: { value: 'camel' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect((screen.getByLabelText('Select annotation b on seq0') as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Delete with undo' }));
    expect(screen.queryByText('b')).toBeNull(); expect(screen.getByText('a')).toBeTruthy();
    expect(within(currentHeader()).getByText('camel')).toBeTruthy();
  });
  it('reveals a missing sequence after a filtered Features jump and explains the cleared filters', () => {
    const source = { name: 'source', type: 'source', start: 0, end: 100, strand: 1 as const, metadata: { organism: 'Virus' } };
    const initial = [{ ...records[0], features: [source, records[0].features[0]] }, { ...records[1], features: [source, { ...records[1].features[0], name: 'other' }] }];
    render(<Subject initial={initial} />);
    fireEvent.click(screen.getByRole('tab', { name: 'By feature 2' }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'ORF4b' } });
    fireEvent.click(screen.getByRole('button', { name: 'CDS 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Forward strand only' }));
    fireEvent.click(within(currentHeader()).getByRole('button', { name: 'seq1' }));
    expect(within(currentHeader()).getByText('seq1')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Search and type filters cleared to show seq1');
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('');
  });
  it('exposes the full long location to tooltip and assistive technology', () => {
    const location = 'complement(join(97999..98793,69611..69724))';
    render(<Subject initial={[{ ...records[0], features: [{ ...records[0].features[0], locationString: location }] }]} />);
    expect(screen.getByLabelText(`Location: ${location}`).getAttribute('data-tip')).toBe(location);
  });
  it('shows biological lengths with thousands separators', () => {
    render(<Subject initial={[{ ...records[0], sequence: 'A'.repeat(30000), features: [{ name: 'long', type: 'CDS', start: 0, end: 21290, strand: 1 }] }]} />);
    expect(screen.getByText('21,290 bp')).toBeTruthy();
  });
  it('identifies each Features row by accession, annotation and isolate', () => {
    const source = { name: 'source', type: 'source', start: 0, end: 100, strand: 1 as const, metadata: { organism: 'Virus', isolate: 'camel-1' } };
    render(<Subject initial={[{ ...records[0], features: [source, { name: 'gene S', type: 'gene', start: 0, end: 30, strand: 1, metadata: { gene: 'S' } }, { name: 'spike', type: 'CDS', start: 0, end: 30, strand: 1, metadata: { gene: 'S', product: 'surface protein' } }] }]} />);
    fireEvent.click(screen.getByRole('tab', { name: 'By feature 1' }));
    expect(screen.getByText('gene S · camel-1')).toBeTruthy();
    expect(screen.getByText('spike · surface protein · camel-1')).toBeTruthy();
  });
  it('keeps biological length and aligned geometry in focus', () => {
    const focused = vi.fn();
    render(<Subject focused={focused} initial={[{ id: 'gap', name: 'gap', sequence: 'ACGTACGT', alignedSequence: '--A-CG--TA-C--GT--', features: [{ name: 'joined', type: 'gene', start: 0, end: 8, strand: 1, segments: [{ start: 0, end: 3 }, { start: 4, end: 8 }] }] }]} />);
    expect(screen.getByText('7 bp')).toBeTruthy(); fireEvent.click(screen.getByRole('button', { name: 'Open joined on gap in viewport' }));
    expect(focused).toHaveBeenCalledWith({ recordId: 'gap', featureIndex: 0, start: 2, end: 16, label: 'joined', length: 7 }, { key: 'gap:0', label: 'joined' });
  });
});


it.each(['tabs', 'focus'])('keeps typed details through a %s round trip', route => {
  render(<Subject initial={[records[0]]} />);
  fireEvent.click(within(currentHeader()).getByRole('button', { name: 'Edit details' }));
  fireEvent.change(screen.getByLabelText('Host'), { target: { value: 'camel draft' } });
  if (route === 'tabs') {
    fireEvent.click(screen.getByRole('tab', { name: 'By feature 1' }));
    fireEvent.click(screen.getByRole('tab', { name: 'By sequence 1' }));
  } else {
    fireEvent.click(screen.getByRole('button', { name: 'Open ORF4b on seq0 in viewport' }));
    fireEvent.click(screen.getByText('Return to hub'));
  }
  expect((screen.getByLabelText('Host') as HTMLInputElement).value).toBe('camel draft');
});

it('confirms before replacing a dirty details draft with another editor', () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  try {
    render(<Subject initial={records.slice(0, 2)} />);
    fireEvent.click(within(currentHeader()).getByRole('button', { name: 'Edit details' }));
    fireEvent.change(screen.getByLabelText('Host'), { target: { value: 'camel draft' } });
    fireEvent.click(within(currentHeader()).getByRole('button', { name: 'Rename seq0' }));
    expect(confirm).toHaveBeenCalled();
    expect((screen.getByLabelText('Host') as HTMLInputElement).value).toBe('camel draft');
  } finally { confirm.mockRestore(); }
});

it('shows a lock notice for a blocked drop', () => {
  const dropped = vi.fn(); render(<Subject locked index dropped={dropped} />);
  fireEvent.drop(screen.getByRole('region', { name: 'Annotation Hub' }), { dataTransfer: { files: [new File(['ACGT'], 'x.fa')] } });
  expect(dropped).not.toHaveBeenCalled();
  expect(screen.getByRole('status').textContent).toMatch(/alignment.*lock/i);
});

it('makes only the selected hub tab a tab stop and connects its panel', () => {
  render(<Subject />);
  const tabs = screen.getAllByRole('tab');
  expect(tabs.map(tab => tab.tabIndex)).toEqual([0, -1]);
  expect(document.getElementById(tabs[0].getAttribute('aria-controls')!)).toBe(screen.getByRole('tabpanel'));
  tabs[0].focus(); fireEvent.keyDown(tabs[0], { key: 'ArrowRight' });
  expect(document.activeElement).toBe(tabs[1]);
  expect(tabs.map(tab => tab.tabIndex)).toEqual([-1, 0]);
});

it('reveals an annotation hidden by search when picked on a header strip', () => {
  render(<Subject initial={[{ ...records[0], features: [{ ...records[0].features[0], name: 'hidden' }, { ...records[0].features[0], name: 'visible', start: 30, end: 40 }] }]} />);
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'visible' } });
  fireEvent.keyDown(within(currentHeader()).getByRole('button', { name: /Genome strip/ }), { key: 'Enter' });
  expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('');
  expect(screen.getAllByRole('status').some(status => /cleared to show/.test(status.textContent ?? ''))).toBe(true);
  expect(screen.getByText('hidden')).toBeTruthy();
});


it('clears unresolved jumps even when filters leave the list empty', () => {
  render(<Subject />);
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'no match' } });
  fireEvent.click(screen.getByText('Request hidden jump'));
  expect(screen.getByLabelText('Pending hub jump').textContent).toBe('none');
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } });
  expect(within(currentHeader()).getByText('seq0')).toBeTruthy();
});

it('opens help with ? and traps focus until Esc returns it to the opener', () => {
  render(<Subject index />);
  const hub = screen.getByRole('region', { name: 'Annotation Hub' });
  hub.focus(); fireEvent.keyDown(hub, { key: '?', shiftKey: true });
  const sheet = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
  expect(sheet.getAttribute('aria-modal')).toBe('true');
  const close = within(sheet).getByRole('button', { name: 'Close keyboard shortcuts' });
  expect(document.activeElement).toBe(close);
  fireEvent.keyDown(close, { key: 'Tab' }); expect(document.activeElement).toBe(close);
  fireEvent.keyDown(close, { key: 'Tab', shiftKey: true }); expect(document.activeElement).toBe(close);
  screen.getByRole('searchbox').focus(); expect(document.activeElement).toBe(close);
  fireEvent.keyDown(close, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull(); expect(document.activeElement).toBe(hub);
  expect(screen.queryByText(/J\/K Rows/)).toBeNull();
});
it('ignores ? typed in annotation search', () => {
  render(<Subject />); const search = screen.getByRole('searchbox'); search.focus();
  fireEvent.keyDown(search, { key: '?', shiftKey: true });
  expect(screen.queryByRole('dialog')).toBeNull();
});





it('portals the shortcuts sheet inside the app root carrying the session accent', () => {
  const { container } = render(<div data-test-app-root className="app-root" data-env="hub"><Subject /></div>);
  fireEvent.keyDown(screen.getByRole('region', { name: 'Annotation Hub' }), { key: '?' });
  expect(container.querySelector('[data-test-app-root]')!.contains(screen.getByRole('dialog', { name: 'Keyboard shortcuts' }))).toBe(true);
});

it('hides hub sections and search matches, persists across tabs, and restores from cards or Show all', () => {
  const values = records.slice(0, 2).map((record, i) => ({ ...record, visible: i === 0 }));
  render(<Subject initial={values} index />);
  const index = within(screen.getByRole('region', { name: 'Hub index' }));
  fireEvent.click(index.getByRole('button', { name: 'Hide seq0 in hub' }));
  expect(screen.queryByLabelText('Select annotation ORF4b on seq0')).toBeNull();
  expect(normalizedText(document.querySelector('[data-hub-summary]')!)).toBe('1 of 2 annotations in 1 of 2 sequences · 1 hidden');
  expect(values.map(record => record.visible)).toEqual([true, false]);
  const hidden = index.getByRole('button', { name: 'Jump to sequence seq0' }).closest('[data-index-card]')!;
  expect(hidden.getAttribute('data-state')).toBe('hidden');
  expect(within(hidden as HTMLElement).getByText('Hidden in hub')).toBeTruthy();
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'ORF4b' } });
  expect(normalizedText(document.querySelector('[data-search-counter]')!)).toBe('0 / 1');
  fireEvent.click(screen.getByRole('tab', { name: /By feature/ }));
  const presence = within(currentHeader()).getByRole('group', { name: 'Presence' });
  expect(within(presence).getByRole('button', { name: 'seq0: hidden' })).toBeTruthy();
  fireEvent.click(screen.getByRole('tab', { name: /By sequence/ }));
  fireEvent.click(index.getByRole('button', { name: 'Jump to sequence seq0' }));
  expect(screen.getByLabelText('Select annotation ORF4b on seq0')).toBeTruthy();
  fireEvent.click(index.getByRole('button', { name: 'Hide seq0 in hub' }));
  fireEvent.click(index.getByRole('button', { name: 'Show all' }));
  expect(screen.getByLabelText('Select annotation ORF4b on seq0')).toBeTruthy();
});

it('excludes hidden sequences from comparison baselines, positions, counts and tags', () => {
  const values = [0, 10, 80].map((start, i) => writeDetails({ ...records[i], features: [{ type: 'CDS', name: 'enzyme', start, end: start + (i === 2 ? 20 : 10), strand: 1 }] }, { organism: 'virus' }));
  render(<Subject initial={values} index />);
  fireEvent.click(within(screen.getByRole('region', { name: 'Hub index' })).getByRole('button', { name: 'Hide seq2 in hub' }));
  fireEvent.click(screen.getByRole('tab', { name: /By feature/ }));
  const pinned = within(currentHeader());
  expect(pinned.getByText('in 2 of 2 sequences · 1 hidden')).toBeTruthy();
  expect(pinned.getByText('Median position 6 · 10–10 bp')).toBeTruthy();
  expect(pinned.queryByText(/odd length/)).toBeNull();
  expect(pinned.getByRole('button', { name: 'seq2: hidden' })).toBeTruthy();
});

it('clears the current index window when the final hub section is hidden from its header', () => {
  render(<Subject initial={records.slice(0, 1)} index />);
  fireEvent.click(within(currentHeader()).getByRole('button', { name: 'Hide seq0 in hub' }));
  expect(screen.queryByRole('region', { name: 'Pinned section' })).toBeNull();
  const card = screen.getByRole('button', { name: 'Jump to sequence seq0' }).closest('[data-index-card]')!;
  expect(card.getAttribute('aria-current')).toBe('false');
  expect(card.querySelector<HTMLElement>('[data-track-window]')!.hidden).toBe(true);
  fireEvent.click(within(screen.getByRole('region', { name: 'Hub index' })).getByRole('button', { name: 'Show all' }));
  expect(screen.getByLabelText('Select annotation ORF4b on seq0')).toBeTruthy();
});

it.each([1, 2])('reveals only the %i hidden affected sequences when repairing export organisms', hiddenCount => {
  render(<Subject initial={[...records.slice(0, 2), writeDetails(records[2], { organism: 'already valid' })]} index />);
  const index = within(screen.getByRole('region', { name: 'Hub index' }));
  fireEvent.click(index.getByRole('button', { name: 'Hide seq2 in hub' }));
  for (let i = 0; i < hiddenCount; i++) fireEvent.click(index.getByRole('button', { name: `Hide seq${i} in hub` }));
  fireEvent.click(screen.getByRole('button', { name: 'Export…' }));
  fireEvent.click(screen.getByRole('button', { name: 'All' }));
  fireEvent.click(screen.getByRole('radio', { name: 'GenBank' }));
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Export sequences' })).getByRole('button', { name: 'Edit details' }));
  expect(screen.getByText(`Unhid ${hiddenCount} sequences to edit their details.`)).toBeTruthy();
  expect((screen.getByLabelText('Detail field') as HTMLSelectElement).value).toBe('organism');
  fireEvent.change(screen.getByLabelText('Detail value'), { target: { value: 'virus' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  expect(screen.getByText('Set Organism on 2 sequences')).toBeTruthy();
  expect(index.getByRole('button', { name: 'Show seq2 in hub' })).toBeTruthy();
  expect(index.getByRole('button', { name: 'Show all' })).toBeTruthy();
});


it('keeps sorting per tab, cycles off to file order and moves J/K in displayed order', () => {
  const input = [{ ...records[0], features: [
    { ...records[0].features[0], name: 'zebra' },
    { ...records[0].features[0], name: 'apple' },
  ] }, { ...records[1], features: [{ ...records[1].features[0], name: 'pear' }] }];
  const { container } = render(<Subject initial={input} />);
  const keys = () => [...container.querySelectorAll('[data-row-key]')].map(row => row.getAttribute('data-row-key'));
  const name = screen.getByRole('button', { name: 'Name / Product' });
  expect(keys()).toEqual(['seq0:0', 'seq0:1', 'seq1:0']);
  fireEvent.click(name);
  expect(name.getAttribute('aria-sort')).toBe('ascending');
  expect(keys()).toEqual(['seq0:1', 'seq0:0', 'seq1:0']);
  fireEvent.keyDown(screen.getByRole('region', { name: 'Annotation Hub' }), { key: 'j' });
  expect(container.querySelector('[data-row-key="seq0:1"]')?.getAttribute('aria-current')).toBe('true');
  fireEvent.click(name);
  expect(keys()).toEqual(['seq0:0', 'seq0:1', 'seq1:0']);
  fireEvent.click(name);
  expect(name.getAttribute('aria-sort')).toBe('none');
  expect(keys()).toEqual(['seq0:0', 'seq0:1', 'seq1:0']);
  fireEvent.click(name);
  fireEvent.click(screen.getByRole('tab', { name: /By feature/ }));
  expect(screen.getByRole('button', { name: 'Sequence' }).getAttribute('aria-sort')).toBe('none');
  fireEvent.click(screen.getByRole('button', { name: 'Location' }));
  fireEvent.click(screen.getByRole('tab', { name: /By sequence/ }));
  expect(screen.getByRole('button', { name: 'Name / Product' }).getAttribute('aria-sort')).toBe('ascending');
});


it('toggles the current row on repeat click and Escape while actions and checkboxes leave it alone', () => {
  const { container } = render(<Subject initial={[records[0]]} />);
  const row = container.querySelector<HTMLElement>('[data-row-key="seq0:0"]')!;
  fireEvent.click(row);
  expect(row.getAttribute('aria-current')).toBe('true');
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select annotation ORF4b on seq0' }));
  expect(row.getAttribute('aria-current')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Inspect ORF4b on seq0' }));
  expect(row.getAttribute('aria-current')).toBe('true');
  fireEvent.click(row);
  expect(row.getAttribute('aria-current')).toBe('false');
  fireEvent.click(row);
  fireEvent.keyDown(row, { key: 'Escape' });
  expect(row.getAttribute('aria-current')).toBe('false');
});


it('shows annotation edit chips, group counts and an edited-only filter in both pivots and export', () => {
  const input = [{ ...records[0], features: [
    { ...records[0].features[0], name: 'file' },
    { ...records[0].features[0], name: 'edited row', hubEdit: 'edited' as const },
    { ...records[0].features[0], name: 'added row', hubEdit: 'added' as const },
  ] }];
  const { container } = render(<Subject initial={input} index />);
  expect(container.querySelector('[data-row-key="seq0:1"] [data-edit-chip]')?.textContent).toBe('edited');
  expect(container.querySelector('[data-row-key="seq0:2"] [data-edit-chip]')?.textContent).toBe('added');
  expect(screen.getAllByText('1 edited · 1 added').length).toBeGreaterThanOrEqual(2);
  const filter = screen.getByRole('button', { name: 'Edited in Dunceious' });
  fireEvent.click(filter);
  expect(filter.getAttribute('aria-pressed')).toBe('true');
  expect(container.querySelector('[data-row-key="seq0:0"]')).toBeNull();
  fireEvent.click(screen.getByRole('tab', { name: /By feature/ }));
  expect(container.querySelector('[data-row-key="seq0:0"]')).toBeNull();
  fireEvent.click(within(screen.getByLabelText('Header tools')).getByRole('button', { name: 'Export…' }));
  expect(document.querySelector('[data-export-row="seq0"]')?.querySelector('[data-edit-chip]')?.textContent).toBe('edited');
  fireEvent.click(screen.getByRole('radio', { name: 'GenBank' }));
  expect(screen.getByText('2 edited or added')).toBeTruthy();
});


it('keeps the active search match by identity when sorting changes its displayed index', () => {
  const values = [{ ...records[0], features: [
    { ...records[0].features[0], name: 'hit zebra' },
    { ...records[0].features[0], name: 'hit apple' },
  ] }];
  const { container } = render(<Subject initial={values} />);
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'hit' } });
  fireEvent.click(screen.getByRole('button', { name: 'Name / Product' }));
  fireEvent.click(screen.getByRole('button', { name: 'Next match' }));
  expect(normalizedText(document.querySelector('[data-search-counter]')!)).toBe('1 / 2');
  expect(container.querySelector('[data-row-key="seq0:1"]')!.getAttribute('aria-current')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Name / Product' }));
  expect(normalizedText(document.querySelector('[data-search-counter]')!)).toBe('2 / 2');
  fireEvent.click(screen.getByRole('button', { name: 'Next match' }));
  expect(container.querySelector('[data-row-key="seq0:0"]')!.getAttribute('aria-current')).toBe('true');
  expect(normalizedText(document.querySelector('[data-search-counter]')!)).toBe('1 / 2');
});
it('keeps the current feature header neutral and marks only its edge and identity', () => {
  render(<Subject initial={[records[0]]} />);
  fireEvent.click(screen.getByRole('tab', { name: /By feature/ }));
  // The current feature card stays neutral; the accent marks only its edge and identity.
  expect(currentHeader().classList.contains('hub-surface-current')).toBe(true);
  expect(currentHeader().className).not.toContain('bg-amber');
  expect(currentHeader().querySelector('strong')!.className).toContain('text-amber-800');
});


it('explains an empty workspace and shares the Import menu sequence picker and upload handler', () => {
  const upload = vi.fn();
  render(<Subject initial={[]} uploaded={upload} loadOnUpload={[records[0]]} />);
  expect(screen.getByRole('heading', { name: 'No sequences yet' })).toBeTruthy();
  expect(screen.getByText('Drop GenBank or FASTA files anywhere on this panel, or import them.')).toBeTruthy();
  expect(screen.getByText('Annotations, pre-aligned FASTA and projects are in the Import menu')).toBeTruthy();
  const picker = screen.getByLabelText('Import sequences files') as HTMLInputElement;
  expect(picker.accept).toBe('.gb,.genbank,.fasta,.fa');
  expect(screen.getAllByLabelText('Import sequences files')).toHaveLength(1);
  const clicked = vi.spyOn(picker, 'click');
  fireEvent.click(screen.getByRole('button', { name: 'Import sequences…' }));
  expect(clicked).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'Import' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Sequences' }));
  expect(clicked).toHaveBeenCalledTimes(2);
  const file = new File(['>a\nAAAA'], 'sequences.fasta');
  fireEvent.change(picker, { target: { files: [file] } });
  expect(upload).toHaveBeenCalledOnce();
  expect(upload.mock.calls[0][0].target.files[0]).toBe(file);
  expect(screen.queryByRole('heading', { name: 'No sequences yet' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Type' })).toBeTruthy();
  expect(screen.getByRole('checkbox', { name: 'Select all visible annotations' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Edited in Dunceious' })).toBeTruthy();
});
it('disables empty-state importing under the alignment lock', () => {
  render(<Subject initial={[]} locked />);
  const picker = screen.getByLabelText('Import sequences files');
  const clicked = vi.spyOn(picker, 'click');
  const button = screen.getByRole('button', { name: 'Import sequences…' }) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  fireEvent.click(button);
  expect(clicked).not.toHaveBeenCalled();
});
it.each(['By sequence', 'By feature'])('hides inactive table controls in the empty $0 view but keeps toolbar, strand and density', tab => {
  render(<Subject initial={[]} />);
  fireEvent.click(screen.getByRole('tab', { name: new RegExp(tab) }));
  expect(screen.queryByRole('button', { name: 'Type' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Location' })).toBeNull();
  expect(screen.queryByRole('checkbox', { name: 'Select all visible annotations' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Edited in Dunceious' })).toBeNull();
  expect(screen.getByRole('searchbox', { name: 'Search annotations' })).toBeTruthy();
  expect(screen.getByRole('group', { name: 'Strand' })).toBeTruthy();
  expect(screen.getByRole('group', { name: 'Density' })).toBeTruthy();
});
it('clears query, type, strand, edited-only and attention filters to restore rows', () => {
  const { container } = render(<Subject initial={[records[0]]} index />);
  fireEvent.click(screen.getByRole('button', { name: 'CDS 1' }));
  fireEvent.click(screen.getByRole('button', { name: 'Reverse strand only' }));
  fireEvent.click(screen.getByRole('button', { name: 'Edited in Dunceious' }));
  fireEvent.click(screen.getByRole('button', { name: 'Needs attention' }));
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search annotations' }), { target: { value: 'absent' } });
  expect(screen.getByText('No annotations match these filters')).toBeTruthy();
  expect(container.querySelector('[data-row-key="seq0:0"]')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  expect(container.querySelector('[data-row-key="seq0:0"]')).not.toBeNull();
  expect((screen.getByRole('searchbox', { name: 'Search annotations' }) as HTMLInputElement).value).toBe('');
  for (const name of ['CDS 1', 'Edited in Dunceious', 'Needs attention']) expect(screen.getByRole('button', { name }).getAttribute('aria-pressed')).toBe('false');
  expect(screen.getByRole('button', { name: 'All strands' }).getAttribute('aria-pressed')).toBe('true');
});
it.each([
  { filtersSeed: { sequenceQuery: 'absent' }, problems: false, tab: 'By sequence' },
  { filtersSeed: { onlyIds: new Set<string>() }, problems: false, tab: 'By sequence' },
  { filtersSeed: {}, problems: true, tab: 'By feature' },
])('clears sequence and comparison constraints in $tab', ({ filtersSeed, problems, tab }) => {
  const { container } = render(<Subject initial={[records[0]]} filtersSeed={filtersSeed} problems={problems} />);
  fireEvent.click(screen.getByRole('tab', { name: new RegExp(tab) }));
  expect(screen.getByText('No annotations match these filters')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  expect(container.querySelector('[data-row-key="seq0:0"]')).not.toBeNull();
});
it('clearing filters preserves selection, sorting, density and persistent folds', () => {
  render(<Subject initial={[records[0]]} />);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select sequence seq0' }));
  fireEvent.click(screen.getByRole('button', { name: 'Name / Product' }));
  fireEvent.click(screen.getByRole('button', { name: 'Comfortable' }));
  fireEvent.click(screen.getByRole('button', { name: 'Collapse seq0' }));
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'absent' } });
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  expect((screen.getByRole('checkbox', { name: 'Select sequence seq0' }) as HTMLInputElement).checked).toBe(true);
  expect(screen.getByRole('button', { name: 'Name / Product' }).getAttribute('aria-sort')).toBe('ascending');
  expect(screen.getByRole('button', { name: 'Comfortable' }).getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByRole('button', { name: 'Expand seq0' }).getAttribute('aria-expanded')).toBe('false');
});
it.each(['By sequence', 'By feature'])('offers Show all when only hub visibility empties the $0 view', tab => {
  const { container } = render(<Subject initial={[records[0]]} index />);
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search annotations' }), { target: { value: 'ORF4b' } });
  fireEvent.click(within(screen.getByRole('region', { name: 'Hub index' })).getByRole('button', { name: 'Hide seq0 in hub' }));
  fireEvent.click(screen.getByRole('tab', { name: new RegExp(tab) }));
  const panel = screen.getByRole('tabpanel');
  expect(within(panel).getByText('All sequences are hidden in the hub')).toBeTruthy();
  expect(within(panel).queryByRole('button', { name: 'Clear filters' })).toBeNull();
  fireEvent.click(within(panel).getByRole('button', { name: 'Show all' }));
  expect(container.querySelector('[data-row-key="seq0:0"]')).not.toBeNull();
  expect((screen.getByRole('searchbox', { name: 'Search annotations' }) as HTMLInputElement).value).toBe('ORF4b');
});
it('clearing filters preserves hidden sequences when the empty list has another cause', () => {
  const { container } = render(<Subject initial={records.slice(0, 2)} index />);
  fireEvent.click(within(screen.getByRole('region', { name: 'Hub index' })).getByRole('button', { name: 'Hide seq0 in hub' }));
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search annotations' }), { target: { value: 'absent' } });
  fireEvent.click(within(screen.getByRole('tabpanel')).getByRole('button', { name: 'Clear filters' }));
  expect(container.querySelector('[data-row-key="seq0:0"]')).toBeNull();
  expect(container.querySelector('[data-row-key="seq1:0"]')).not.toBeNull();
});

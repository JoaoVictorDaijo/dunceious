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
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, within, stubResizeObserver } from '@/src/app/testing/renderHarness';
import { useHubState } from '@/src/app/hooks/useHubState';
import type { SeqRecord } from '@/src/domain/bio/types';
import { DEFAULT_UI_EFFECTS, UiEffectsContext, type UiEffects } from '../../uiEffects';
import AnnotationHubPanel from '../../AnnotationHubPanel';
import ImportMenu from '../ImportMenu';
import SelectionBar from '../SelectionBar';
import ExportDialog from '../ExportDialog';
import ShortcutsSheet from '../ShortcutsSheet';

const records: SeqRecord[] = ['a', 'b'].map(id => ({ id, name: id, sequence: 'ACGT', features: [] }));
const noop = () => {};
function effects(overrides: Partial<UiEffects> = {}): UiEffects {
  return { ...DEFAULT_UI_EFFECTS, confirm: vi.fn(() => true), copyText: vi.fn(async () => true), chooseFile: vi.fn(), allowAction: vi.fn(() => true), ...overrides };
}
beforeEach(() => {
  stubResizeObserver();
  localStorage.clear();
  vi.spyOn(window, 'confirm').mockReturnValue(false);
});
afterEach(() => vi.restoreAllMocks());

function Imports({ onImportSequences }: { onImportSequences?: () => void }) {
  const state = useHubState();
  return <ImportMenu state={state} onImportSequences={onImportSequences} onFileUpload={noop} onAlignmentUpload={noop} onAnnotationUpload={noop} onProjectUpload={noop} />;
}
function Selection({ onRemoveRecords = vi.fn(), onSetDetail = vi.fn() }) {
  const state = useHubState();
  return <><button onClick={() => state.setSelectedRecords(new Set(['a', 'b']))}>Select both</button><SelectionBar records={records} state={state} onRemoveRecords={onRemoveRecords} onSetDetail={onSetDetail} onExport={noop} onExportRows={noop} onDeleteRows={noop} /></>;
}
function Panel({ value = records }: { value?: SeqRecord[] }) {
  const state = useHubState();
  const [toolsSlot, setToolsSlot] = useState<HTMLDivElement | null>(null);
  return <><div ref={setToolsSlot} aria-label="Header tools" /><AnnotationHubPanel records={value} state={state} toolsSlot={toolsSlot} featureColors={{}} onStartNewFeature={noop} onRemoveRecord={noop} onViewFeatureDetails={noop} onEditFeature={noop} onRemoveFeature={noop} onDeleteRows={noop} undoAvailable={false} onUndoDelete={noop} onSetRecordDetails={noop} onSetRecordLabel={noop} onSetDetail={noop} onFocusItem={noop} onExportProjectJson={noop} onExportRecords={noop} onClearAll={noop} addLog={noop} onFileUpload={noop} onAlignmentUpload={noop} onAnnotationUpload={noop} onProjectUpload={noop} onDroppedFiles={noop} /></>;
}
function Export({ onExport = vi.fn(), onKeyDown = vi.fn() }) {
  const state = useHubState();
  const [open, setOpen] = useState(true);
  return <div onKeyDown={onKeyDown}><button>Outside</button>{open && <ExportDialog records={records} state={state} onClose={() => setOpen(false)} onExport={onExport} onEditDetails={noop} />}</div>;
}
function importItem(name: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Import' }));
  fireEvent.click(screen.getByRole('menuitem', { name }));
}

it('Import items call chooseFile with their kind and click no file input', () => {
  const host = effects(), onImportSequences = vi.fn();
  const click = vi.spyOn(HTMLInputElement.prototype, 'click');
  render(<UiEffectsContext.Provider value={host}><Imports onImportSequences={onImportSequences} /></UiEffectsContext.Provider>);
  for (const [name, kind] of [['Sequences', 'sequences'], ['Annotations', 'annotations'], ['Alignment', 'alignment'], ['Dunceious project', 'project']]) {
    importItem(name);
    expect(host.chooseFile).toHaveBeenLastCalledWith(kind, expect.any(Function));
  }
  expect(host.chooseFile).toHaveBeenCalledTimes(4);
  expect(click).not.toHaveBeenCalled();
  expect(onImportSequences).not.toHaveBeenCalled();
  expect(window.confirm).not.toHaveBeenCalled();
});
it('one Import > Sequences tap calls chooseFile exactly once when open is forwarded', () => {
  const host = effects({ chooseFile: vi.fn((_kind, open) => open()) });
  const click = vi.spyOn(HTMLInputElement.prototype, 'click');
  render(<UiEffectsContext.Provider value={host}><Panel /></UiEffectsContext.Provider>);
  importItem('Sequences');
  expect(host.chooseFile).toHaveBeenCalledExactlyOnceWith('sequences', expect.any(Function));
  expect(click).toHaveBeenCalledOnce();
});
it('the empty workspace import uses chooseFile without clicking an input', () => {
  const host = effects(), click = vi.spyOn(HTMLInputElement.prototype, 'click');
  render(<UiEffectsContext.Provider value={host}><Panel value={[]} /></UiEffectsContext.Provider>);
  fireEvent.click(screen.getByRole('button', { name: 'Import sequences…' }));
  expect(host.chooseFile).toHaveBeenCalledExactlyOnceWith('sequences', expect.any(Function));
  expect(click).not.toHaveBeenCalled();
});
it('the panel annotation import uses chooseFile without clicking an input', () => {
  const host = effects(), click = vi.spyOn(HTMLInputElement.prototype, 'click');
  render(<UiEffectsContext.Provider value={host}><Panel /></UiEffectsContext.Provider>);
  fireEvent.click(screen.getAllByRole('button', { name: 'Import annotations…' })[0]);
  expect(host.chooseFile).toHaveBeenCalledExactlyOnceWith('annotations', expect.any(Function));
  expect(click).not.toHaveBeenCalled();
});
it('remove asks allowAction first and never confirms when vetoed', () => {
  const host = effects({ allowAction: vi.fn(() => false) }), onRemoveRecords = vi.fn();
  render(<UiEffectsContext.Provider value={host}><Selection onRemoveRecords={onRemoveRecords} /></UiEffectsContext.Provider>);
  fireEvent.click(screen.getByText('Select both'));
  fireEvent.click(screen.getByRole('button', { name: 'Remove…' }));
  expect(host.allowAction).toHaveBeenCalledWith('remove-records');
  expect(host.confirm).not.toHaveBeenCalled();
  expect(window.confirm).not.toHaveBeenCalled();
  expect(onRemoveRecords).not.toHaveBeenCalled();
});
it('allowed remove uses the injected confirm before removing selected records', () => {
  const host = effects(), onRemoveRecords = vi.fn();
  render(<UiEffectsContext.Provider value={host}><Selection onRemoveRecords={onRemoveRecords} /></UiEffectsContext.Provider>);
  fireEvent.click(screen.getByText('Select both'));
  fireEvent.click(screen.getByRole('button', { name: 'Remove…' }));
  expect(host.confirm).toHaveBeenCalledWith('Remove 2 sequences from the workspace?');
  expect(onRemoveRecords).toHaveBeenCalledWith(new Set(['a', 'b']));
  expect(vi.mocked(host.allowAction).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(host.confirm).mock.invocationCallOrder[0]);
  expect(window.confirm).not.toHaveBeenCalled();
});
it('Apply vetoed shows no success message', () => {
  const host = effects({ allowAction: vi.fn(() => false) }), onSetDetail = vi.fn();
  render(<UiEffectsContext.Provider value={host}><Selection onSetDetail={onSetDetail} /></UiEffectsContext.Provider>);
  fireEvent.click(screen.getByText('Select both'));
  fireEvent.change(screen.getByLabelText('Detail value'), { target: { value: 'camel' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  expect(host.allowAction).toHaveBeenCalledWith('set-detail');
  expect(onSetDetail).not.toHaveBeenCalled();
  expect(screen.queryByText(/^Set .* on \d+ sequences/)).toBeNull();
  expect(window.confirm).not.toHaveBeenCalled();
});
it('discarding a dirty draft uses the injected confirm', () => {
  const host = effects();
  render(<UiEffectsContext.Provider value={host}><Panel /></UiEffectsContext.Provider>);
  const header = document.querySelector('[data-section-surface][data-state="current"]')!;
  fireEvent.click(within(header as HTMLElement).getByRole('button', { name: 'Edit details' }));
  fireEvent.change(screen.getByLabelText('Host'), { target: { value: 'camel draft' } });
  fireEvent.click(within(header as HTMLElement).getByRole('button', { name: 'Rename a' }));
  expect(host.confirm).toHaveBeenCalledWith('Discard unsaved changes to open another editor?');
  expect(window.confirm).not.toHaveBeenCalled();
  expect(screen.queryByLabelText('Host')).toBeNull();
  expect(screen.getByRole('textbox', { name: /display name/i })).toBeTruthy();
});
it('Export stays open after saving when closeExportOnSave is false', () => {
  const host = effects({ closeExportOnSave: false }), onExport = vi.fn();
  render(<UiEffectsContext.Provider value={host}><Export onExport={onExport} /></UiEffectsContext.Provider>);
  fireEvent.click(screen.getByRole('radio', { name: 'GenBank' }));
  fireEvent.click(screen.getByRole('button', { name: 'Export 2 sequences' }));
  expect(onExport).toHaveBeenCalledWith(['a', 'b'], 'genbank', expect.objectContaining({ fileName: 'sequences.gb' }));
  expect(screen.getByRole('dialog', { name: 'Export sequences' })).toBeTruthy();
  expect(screen.getByRole('radio', { name: 'GenBank' }).getAttribute('aria-checked')).toBe('true');
});
it('Export focus trap stands down while overlayActive and resumes afterward', () => {
  const host = effects(), onKeyDown = vi.fn();
  const { rerender } = render(<UiEffectsContext.Provider value={host}><Export onKeyDown={onKeyDown} /></UiEffectsContext.Provider>);
  const outside = screen.getByRole('button', { name: 'Outside' });
  outside.focus();
  expect(document.activeElement).not.toBe(outside);
  rerender(<UiEffectsContext.Provider value={{ ...host, overlayActive: true }}><Export onKeyDown={onKeyDown} /></UiEffectsContext.Provider>);
  outside.focus();
  expect(document.activeElement).toBe(outside);
  const last = screen.getByRole('button', { name: 'Export 2 sequences' });
  last.focus();
  expect(fireEvent.keyDown(last, { key: 'Tab' })).toBe(true);
  expect(onKeyDown).toHaveBeenCalledOnce();
  rerender(<UiEffectsContext.Provider value={host}><Export onKeyDown={onKeyDown} /></UiEffectsContext.Provider>);
  outside.focus();
  expect(document.activeElement).not.toBe(outside);
});
it('Export keeps focus inside the dialog when overlayActive ends, and pulls it back from outside', () => {
  const host = effects();
  const { rerender } = render(<UiEffectsContext.Provider value={host}><Export /></UiEffectsContext.Provider>);
  const dialog = screen.getByRole('dialog');
  const first = dialog.querySelector('button')!;
  expect(document.activeElement).toBe(first);
  rerender(<UiEffectsContext.Provider value={{ ...host, overlayActive: true }}><Export /></UiEffectsContext.Provider>);
  const last = within(dialog).getByRole('button', { name: 'Export 2 sequences' });
  last.focus();
  rerender(<UiEffectsContext.Provider value={host}><Export /></UiEffectsContext.Provider>);
  expect(document.activeElement).toBe(last);
  rerender(<UiEffectsContext.Provider value={{ ...host, overlayActive: true }}><Export /></UiEffectsContext.Provider>);
  screen.getByRole('button', { name: 'Outside' }).focus();
  rerender(<UiEffectsContext.Provider value={host}><Export /></UiEffectsContext.Provider>);
  expect(document.activeElement).toBe(first);
});
it('Export focus and Tab traps stand down inside an inert ancestor', () => {
  const host = effects(), onKeyDown = vi.fn();
  render(<UiEffectsContext.Provider value={host}><Export onKeyDown={onKeyDown} /></UiEffectsContext.Provider>);
  const dialog = screen.getByRole('dialog');
  dialog.parentElement!.setAttribute('inert', '');
  const outside = screen.getByRole('button', { name: 'Outside' });
  outside.focus();
  expect(document.activeElement).toBe(outside);
  const last = within(dialog).getByRole('button', { name: 'Export 2 sequences' });
  last.focus();
  expect(fireEvent.keyDown(last, { key: 'Tab' })).toBe(true);
  expect(onKeyDown).toHaveBeenCalledOnce();
});
it('Export and the shortcuts sheet portal into portalTarget', () => {
  render(<><div className="app-root" data-testid="fallback" /><div data-testid="portal" /></>);
  const target = screen.getByTestId('portal');
  const host = effects({ portalTarget: target });
  const { unmount } = render(<UiEffectsContext.Provider value={host}><Export /></UiEffectsContext.Provider>);
  expect(within(target).getByRole('dialog', { name: 'Export sequences' })).toBeTruthy();
  expect(screen.getByTestId('fallback').contains(screen.getByRole('dialog'))).toBe(false);
  unmount();
  render(<UiEffectsContext.Provider value={host}><ShortcutsSheet onClose={noop} /></UiEffectsContext.Provider>);
  expect(within(target).getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeTruthy();
  expect(screen.getByTestId('fallback').contains(screen.getByRole('dialog'))).toBe(false);
});
it('Export edit details is vetoed by allowAction', () => {
  const host = effects({ allowAction: vi.fn(() => false) });
  render(<UiEffectsContext.Provider value={host}><Panel /></UiEffectsContext.Provider>);
  fireEvent.click(within(screen.getByLabelText('Header tools')).getByRole('button', { name: 'Export…' }));
  fireEvent.click(screen.getByRole('radio', { name: 'GenBank' }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Edit details' }));
  expect(host.allowAction).toHaveBeenCalledWith('export-edit-details');
  expect(screen.queryByLabelText('Detail field')).toBeNull();
  expect(screen.queryByRole('form', { name: /^Details for/ })).toBeNull();
});
it('with no provider, Import clicks the input and remove calls window.confirm', () => {
  const click = vi.spyOn(HTMLInputElement.prototype, 'click'), onRemoveRecords = vi.fn();
  render(<><Imports /><Selection onRemoveRecords={onRemoveRecords} /></>);
  importItem('Sequences');
  expect(click).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByText('Select both'));
  fireEvent.click(screen.getByRole('button', { name: 'Remove…' }));
  expect(window.confirm).toHaveBeenCalledWith('Remove 2 sequences from the workspace?');
  expect(onRemoveRecords).not.toHaveBeenCalled();
});

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
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, screen, fireEvent, waitFor, installCanvasRecorder, stubResizeObserver } from '@/src/app/testing/renderHarness';
import App from '../App';
import { handleBioMessage } from '@/src/workers/handlers/bio';
import { serializeProject } from '@/src/app/logic/projectFile';
import type { BioWorkerRequest, BioWorkerResponse } from '@/src/workers/protocol';
import type { SeqRecord } from '@/src/domain/bio/types';
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const record = (id: string, name: string): SeqRecord => ({ id, name: id, sequence: 'AAAA', features: [{ name, type: 'gene', start: 0, end: 2, strand: 1 }] });
async function setup() {
  const workers: TestWorker[] = [];
  class TestWorker {
    onmessage: ((event: { data: BioWorkerResponse }) => void) | null = null;
    constructor() { workers.push(this); }
    postMessage(request: BioWorkerRequest) { this.onmessage?.({ data: handleBioMessage(request) }); }
    terminate() {}
  }
  vi.stubGlobal('Worker', TestWorker); installCanvasRecorder(); stubResizeObserver();
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(920);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(500);
  vi.spyOn(window, 'prompt').mockReturnValue('CLEAR'); vi.spyOn(window, 'confirm').mockReturnValue(true);
  render(<App />);
  await act(async () => workers[0].onmessage?.({ data: { type: 'PARSE_SUCCESS', filename: 'input.fa', records: [record('r', 'old'), record('keep', 'keep')] } }));
  fireEvent.click(screen.getByRole('button', { name: 'Annotation Hub' }));
  fireEvent.click(screen.getAllByRole('checkbox', { name: 'Select sequence r' })[0]);
  fireEvent.click(screen.getByLabelText('Select annotation old on r'));
  fireEvent.click(screen.getByRole('button', { name: 'Show only these' }));
  return workers;
}
describe('hub workspace identity', () => {
  it('clears old selection and subset filters after validated project replacement with reused IDs', async () => {
    await setup();
    const text = serializeProject({ records: [record('r', 'new'), record('fresh', 'fresh')], featureColors: {}, showAnnotations: true, showTranslation: false, showConservation: false });
    vi.spyOn(FileReader.prototype, 'readAsText').mockImplementation(function () {
      Object.defineProperty(this, 'result', { value: text }); this.onload?.call(this, new ProgressEvent('load'));
    });
    // Project replacement resolves a FileReader promise before React commits it.
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Load project file'), { target: { files: [new File([text], 'new.json')] } });
    });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Jump to sequence fresh' })).toBeTruthy());
    expect((screen.getByLabelText('Select annotation new on r') as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByLabelText('Selection actions')).toBeNull();
  });
  it('clears old selections before a cleared workspace imports the same IDs', async () => {
    const workers = await setup();
    fireEvent.click(screen.getByRole('button', { name: 'Workspace actions' })); fireEvent.click(screen.getByRole('menuitem', { name: 'Clear workspace…' }));
    await act(async () => workers[0].onmessage?.({ data: { type: 'PARSE_SUCCESS', filename: 'new.fa', records: [record('r', 'new'), record('fresh', 'fresh')] } }));
    expect(screen.getByRole('button', { name: 'Jump to sequence fresh' })).toBeTruthy();
    expect((screen.getByLabelText('Select annotation new on r') as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByLabelText('Selection actions')).toBeNull();
  });
  it('keeps one collapsed Log Terminal whose open state carries across workspaces', async () => {
    await setup(); const disclosure = screen.getByText('Log Terminal').closest('details');
    expect(disclosure).not.toBeNull(); expect(disclosure?.open).toBe(false);
    fireEvent.click(screen.getByText('Log Terminal')); expect(disclosure?.open).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Visual Viewport' }));
    expect(screen.getByText('Log Terminal').closest('details')).toBe(disclosure);
    expect(disclosure?.open).toBe(true);
  });
  it('prunes annotation selection when its record is removed', async () => {
    await setup(); fireEvent.click(screen.getByRole('button', { name: 'Remove…' }));
    expect(screen.queryByLabelText('Selection actions')).toBeNull();
  });
});


it('keeps the last focused annotation after deleting an earlier row and undoing', async () => {
  const workers = await setup();
  fireEvent.click(screen.getByRole('button', { name: 'Show all' }));
  await act(async () => workers[0].onmessage?.({ data: { type: 'PARSE_SUCCESS', filename: 'rows.fa', records: [{ ...record('rows', 'unused'), features: Array.from({ length: 6 }, (_, i) => ({ name: `row${i}`, type: 'gene', start: 0, end: 2, strand: 1 as const })) }] } }));
  fireEvent.click(screen.getByRole('button', { name: 'Jump to sequence rows' }));
  fireEvent.click(screen.getByRole('button', { name: 'Open row5 on rows in viewport' }));
  fireEvent.click(screen.getByRole('button', { name: /Back to Annotation Hub/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete row2 on rows' }));
  expect(screen.getByText('Last focused').closest('[data-row-key]')?.getAttribute('data-row-key')).toBe('rows:4');
  expect(screen.getByText('Last focused').closest('[data-row-key]')?.textContent).toContain('row5');
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  expect(screen.getByText('Last focused').closest('[data-row-key]')?.getAttribute('data-row-key')).toBe('rows:5');
});

it('toggles viewport visibility from the navigator without hiding a hub section', async () => {
  await setup();
  fireEvent.click(screen.getByRole('button', { name: 'Visual Viewport' }));
  fireEvent.click(screen.getByRole('button', { name: 'Hide r in viewport' }));
  const show = screen.getByRole('button', { name: 'Show r in viewport' });
  expect(show.parentElement!.parentElement!.className).toContain('opacity-60');
  fireEvent.click(screen.getByRole('button', { name: 'Annotation Hub' }));
  expect(screen.getAllByRole('button', { name: 'Hide r in hub' }).length).toBeGreaterThan(0);
});

it('keeps the focused outline through earlier deletion and undo, and clears it on focused deletion', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  const workers = await setup();
  fireEvent.click(screen.getByRole('button', { name: 'Show all' }));
  const features = ['red', 'blue', 'green'].map((color, i) => ({ name: `target${i}`, type: 'gene', start: i === 2 ? 2 : 0, end: i === 2 ? 3 : 2, strand: 1 as const, color }));
  await act(async () => workers[0].onmessage?.({ data: { type: 'PARSE_SUCCESS', filename: 'focus.fa', records: [{ ...record('target', 'unused'), features }] } }));
  fireEvent.click(screen.getByRole('button', { name: 'Jump to sequence target' }));
  fireEvent.click(screen.getByRole('button', { name: 'Open target1 on target in viewport' }));
  const outlined = () => [...document.querySelectorAll('path[data-annotation-part][stroke="#000"]')].map(path => path.getAttribute('fill'));
  expect(outlined()).toEqual(['blue']);
  fireEvent.click(screen.getByRole('button', { name: 'Annotation Hub' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete target0 on target' }));
  fireEvent.click(screen.getByRole('button', { name: 'Visual Viewport' }));
  expect(outlined()).toEqual(['blue']);
  fireEvent.click(screen.getByRole('button', { name: 'Annotation Hub' }));
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  fireEvent.click(screen.getByRole('button', { name: 'Visual Viewport' }));
  expect(outlined()).toEqual(['blue']);
  fireEvent.click(screen.getByRole('button', { name: 'Annotation Hub' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete target1 on target' }));
  fireEvent.click(screen.getByRole('button', { name: 'Visual Viewport' }));
  expect(outlined()).not.toContain('green');
  expect(screen.queryByText('target1 · 2 bp')).toBeNull();
});


async function loadCursorRows() {
  const workers = await setup();
  fireEvent.click(screen.getByRole('button', { name: 'Show all' }));
  await act(async () => workers[0].onmessage?.({ data: { type: 'PARSE_SUCCESS', filename: 'cursor.fa', records: [{ ...record('cursor', 'unused'), features: ['match-A', 'match-B', 'match-C'].map(name => ({ name, type: 'gene', start: 0, end: 2, strand: 1 as const })) }] } }));
  fireEvent.click(screen.getByRole('button', { name: 'Jump to sequence cursor' }));
}

it('clears a deleted keyboard cursor before X can select its successor', async () => {
  await loadCursorRows();
  fireEvent.click(screen.getByText('match-B').closest('[data-row-key]')!);
  fireEvent.click(screen.getByRole('button', { name: 'Delete match-B on cursor' }));
  fireEvent.keyDown(screen.getByRole('region', { name: 'Annotation Hub' }), { key: 'x' });
  expect((screen.getByLabelText('Select annotation match-C on cursor') as HTMLInputElement).checked).toBe(false);
  expect(screen.getByText('match-C').closest('[data-row-key]')?.getAttribute('aria-current')).toBe('false');
});

it('keeps a surviving keyboard cursor on its annotation through deletion and undo', async () => {
  await loadCursorRows();
  fireEvent.click(screen.getByText('match-C').closest('[data-row-key]')!);
  fireEvent.click(screen.getByRole('button', { name: 'Delete match-B on cursor' }));
  expect(screen.getByText('match-C').closest('[data-row-key]')?.getAttribute('aria-current')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  expect(screen.getByText('match-C').closest('[data-row-key]')?.getAttribute('aria-current')).toBe('true');
});

it('clears a deleted search cursor and steps from the first remaining match', async () => {
  await loadCursorRows();
  const search = screen.getByRole('searchbox', { name: 'Search annotations' });
  fireEvent.change(search, { target: { value: 'match-' } });
  fireEvent.keyDown(search, { key: 'Enter' });
  fireEvent.keyDown(search, { key: 'Enter' });
  expect(screen.getByText('2 / 3')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Delete match-B on cursor' }));
  expect(screen.getByText('0 / 2')).toBeTruthy();
  fireEvent.keyDown(search, { key: 'Enter' });
  expect(screen.getByText('match-A').closest('[data-row-key]')?.getAttribute('aria-current')).toBe('true');
});


it.each(['details', 'name'])('discards the removed record %s editor and draft before ID reuse', async kind => {
  const workers = await setup();
  if (kind === 'details') {
    fireEvent.click(screen.getByRole('button', { name: 'Edit details' }));
    fireEvent.change(screen.getByLabelText('Host'), { target: { value: 'stale host' } });
  } else {
    fireEvent.click(screen.getByRole('button', { name: 'Rename r' }));
    fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'stale name' } });
  }
  fireEvent.click(screen.getByRole('button', { name: 'Remove…' }));
  await act(async () => workers[0].onmessage?.({ data: { type: 'PARSE_SUCCESS', filename: 'reuse.fa', records: [record('r', 'replacement')] } }));
  fireEvent.click(screen.getByRole('button', { name: 'Jump to sequence r' }));
  expect(screen.queryByRole('form', { name: 'Details for r' })).toBeNull();
  expect(screen.queryByLabelText('Display name')).toBeNull();
  if (kind === 'details') {
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit details' })[0]);
    expect((screen.getByLabelText('Host') as HTMLInputElement).value).toBe('');
  } else {
    fireEvent.click(screen.getAllByRole('button', { name: 'Rename r' })[0]);
    expect((screen.getByLabelText('Display name') as HTMLInputElement).value).toBe('');
  }
});


it.each(['keyboard', 'search'])('clears the removed record %s cursor before ID reuse', async kind => {
  const workers = await setup();
  if (kind === 'search') {
    const search = screen.getByRole('searchbox', { name: 'Search annotations' });
    fireEvent.change(search, { target: { value: 'old' } });
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(screen.getByText('1 / 1')).toBeTruthy();
  } else {
    fireEvent.click(screen.getByText('old').closest('[data-row-key]')!);
  }
  fireEvent.click(screen.getByRole('button', { name: 'Remove…' }));
  await act(async () => workers[0].onmessage?.({ data: { type: 'PARSE_SUCCESS', filename: 'reuse.fa', records: [record('r', 'old')] } }));
  if (kind === 'search') expect(screen.getByText('0 / 1')).toBeTruthy();
  fireEvent.keyDown(screen.getByRole('region', { name: 'Annotation Hub' }), { key: 'x' });
  expect((screen.getByLabelText('Select annotation old on r') as HTMLInputElement).checked).toBe(false);
});

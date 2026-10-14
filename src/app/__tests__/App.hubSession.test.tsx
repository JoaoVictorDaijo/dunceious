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
    fireEvent.change(screen.getByLabelText('Load project file'), { target: { files: [new File([text], 'new.json')] } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Jump to sequence fresh' })).toBeTruthy());
    expect((screen.getByLabelText('Select annotation new on r') as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByLabelText('Selection actions')).toBeNull();
  });
  it('clears old selections before a cleared workspace imports the same IDs', async () => {
    const workers = await setup();
    fireEvent.click(screen.getByRole('button', { name: 'More workspace actions' })); fireEvent.click(screen.getByRole('menuitem', { name: 'Clear workspace…' }));
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

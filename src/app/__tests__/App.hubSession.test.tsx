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
  it('keeps the hub log collapsed until requested and preserves the viewport log', async () => {
    await setup(); const disclosure = screen.getByText('Log').closest('details');
    expect(disclosure).not.toBeNull(); expect(disclosure?.open).toBe(false);
    fireEvent.click(screen.getByText('Log')); expect(disclosure?.open).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Visual Viewport' }));
    expect(screen.getByText('Log Terminal')).toBeTruthy();
  });
  it('prunes annotation selection when its record is removed', async () => {
    await setup(); fireEvent.click(screen.getByRole('button', { name: 'Remove…' }));
    expect(screen.queryByLabelText('Selection actions')).toBeNull();
  });
});

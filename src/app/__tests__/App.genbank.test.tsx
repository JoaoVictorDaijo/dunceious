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
import { afterEach, expect, it, vi } from 'vitest';
import { act, render, screen, fireEvent, within, waitFor, installCanvasRecorder, stubResizeObserver } from '@/src/app/testing/renderHarness';
import { createDeferredWorker } from '@/src/app/testing/deferredWorker';
import { handleBioMessage } from '@/src/workers/handlers/bio';
import App from '../App';

const Worker = createDeferredWorker(handleBioMessage);
const gb = (id: string, residues = 'acgt', unit = 'bp') => `LOCUS ${id} 4 ${unit} DNA\nORIGIN\n 1 ${residues}\n//\n`;
const sevenNotes = `LOCUS R 9 bp DNA\nFEATURES\n${Array.from({ length: 7 }, (_, i) => `     CDS             1..9\n                     /gene="feature${i + 1}"\n                     /codon_start=4\n                     /transl_table=1\n`).join('')}ORIGIN\n 1 atgaaataa\n//\n`;
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function setup() {
  Worker.instances = []; vi.stubGlobal('Worker', Worker);
  installCanvasRecorder(); stubResizeObserver();
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1200);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(700);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  const view = render(<App />), worker = Worker.instances[0];
  const processed = new Set<number>();
  const flush = () => act(() => worker.requests.forEach((request, index) => {
    if (request.type === 'PROCESS_RECORDS' && !processed.has(index)) { processed.add(index); worker.release(index); }
  }));
  const pick = async (files: File[]) => {
    fireEvent.change(view.container.querySelector<HTMLInputElement>('input[data-drop-input][multiple]')!, { target: { files } });
    await waitFor(() => expect(files.every(file => worker.requests.some(r => r.type === 'PARSE_GENBANK' && r.filename === file.name))).toBe(true));
  };
  const release = async (filename: string) => {
    const index = worker.requests.findIndex(r => r.type === 'PARSE_GENBANK' && r.filename === filename);
    await act(async () => worker.release(index)); flush();
  };
  return { ...view, worker, pick, release, writeText, flush };
}

it.each([false, true])('shows one accumulated refusal dialog in arrival order with combined findings, reversed=%s', async reverse => {
  const h = setup(); await h.pick([new File([gb('existing')], 'existing.gb')]); await h.release('existing.gb');
  await h.pick([new File([gb('protein', 'MEF', 'aa')], 'protein.gb'), new File([gb('broken', 'ac-g')], 'broken.gb')]);
  const order = reverse ? ['broken.gb', 'protein.gb'] : ['protein.gb', 'broken.gb'];
  await h.release(order[0]);
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));
  await h.release(order[1]);
  const dialog = screen.getByRole('alertdialog', { name: "Can't open this GenBank file" });
  expect(screen.getAllByRole('alertdialog')).toHaveLength(1);
  expect(within(dialog).getAllByRole('heading', { level: 3 }).map(e => e.textContent)).toEqual(order.map(file => `${file} wasn't loaded`));
  expect(dialog.textContent).toContain('LOCUS says 4 aa, but ORIGIN has 3 residues');
  expect(dialog.textContent).toContain('session now holds nucleotide sequences');
  expect(dialog.textContent).toContain('contains "-"');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Copy details' }));
  expect(h.writeText.mock.calls[0][0]).toContain('protein.gb');
  expect(h.writeText.mock.calls[0][0]).toContain('broken.gb');
  expect(h.writeText.mock.calls[0][0]).toContain('session now holds nucleotide');
  expect(h.container.querySelector('[data-navigator-record="protein"]')).toBeNull();
  expect(h.container.querySelector('[data-navigator-record="broken"]')).toBeNull();
  expect(h.container.querySelector('[data-navigator-record="existing"]')).not.toBeNull();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
  expect(screen.queryByRole('alertdialog')).toBeNull();
});

it('opens the real status notes, expands and copies all seven, and clears without removing records', async () => {
  const h = setup(); await h.pick([new File([sevenNotes], 'notes.gb')]); await h.release('notes.gb');
  const status = h.container.querySelector('.app-status')!;
  fireEvent.click(within(status as HTMLElement).getByRole('button', { name: '7 import notes' }));
  const notes = screen.getByRole('region', { name: 'Import notes' });
  expect(notes.textContent).toContain('notes.gb'); expect(notes.textContent).toContain('feature5');
  expect(notes.textContent).not.toContain('feature7');
  fireEvent.click(within(notes).getByRole('button', { name: 'Show all 7' }));
  expect(notes.textContent).toContain('feature7');
  fireEvent.click(within(notes).getByRole('button', { name: 'Copy details' }));
  expect(h.writeText.mock.calls[0][0]).toContain('feature7');
  fireEvent.click(within(notes).getByRole('button', { name: 'Clear notes' }));
  expect(screen.queryByRole('button', { name: /import notes/ })).toBeNull();
  expect(screen.queryByRole('region', { name: 'Import notes' })).toBeNull();
  expect(h.container.querySelector('[data-navigator-record="R"]')).not.toBeNull();
  await h.pick([new File([sevenNotes], 'fresh-notes.gb')]); await h.release('fresh-notes.gb');
  expect(screen.getByRole('button', { name: '7 import notes' })).toBeTruthy();
  expect(screen.queryByRole('region', { name: 'Import notes' })).toBeNull();
});

it('names assigned duplicate IDs and removes notes only when their actual record is removed', async () => {
  const h = setup(); await h.pick([new File([gb('X')], 'existing.gb')]); await h.release('existing.gb');
  await h.pick([new File([gb('X') + gb('X')], 'duplicates.gb')]); await h.release('duplicates.gb');
  fireEvent.click(screen.getByRole('button', { name: '1 import notes' }));
  expect(screen.getByRole('region', { name: 'Import notes' }).textContent).toContain('X was imported as X_2');
  fireEvent.click(within(screen.getByRole('region', { name: 'Import notes' })).getByRole('button', { name: 'Close' }));
  fireEvent.click(screen.getByRole('button', { name: 'Remove X_1' })); h.flush();
  expect(screen.getByRole('button', { name: '1 import notes' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Remove X_2' })); h.flush();
  expect(screen.queryByRole('button', { name: /import notes/ })).toBeNull();
  expect(h.container.querySelector('[data-navigator-record="X"]')).not.toBeNull();
});

it('suppresses stale refusal and notes responses after the real workspace-clear flow', async () => {
  const h = setup();
  await h.pick([new File([gb('fast')], 'fast.gb'), new File([gb('bad', 'acg')], 'stale-bad.gb'), new File([sevenNotes], 'stale-notes.gb')]);
  await h.release('fast.gb');
  vi.spyOn(window, 'prompt').mockReturnValue('CLEAR');
  fireEvent.click(screen.getByRole('button', { name: 'Project and options' }));
  fireEvent.click(screen.getByRole('button', { name: 'Clear workspace…' }));
  const close = screen.queryByRole('button', { name: 'Close options' }); if (close) fireEvent.click(close);
  await h.release('stale-bad.gb'); await h.release('stale-notes.gb');
  expect(screen.queryByRole('alertdialog')).toBeNull();
  expect(screen.queryByRole('button', { name: /import notes/ })).toBeNull();
  expect(h.container.querySelectorAll('[data-navigator-record]')).toHaveLength(0);
  const log = h.container.querySelector('[data-log-terminal]')!.textContent!;
  for (const filename of ['stale-bad.gb', 'stale-notes.gb']) {
    expect(log.split(`${filename} was not loaded: the workspace was replaced`)).toHaveLength(2);
    expect(log).not.toContain(`${filename} not opened`); expect(log).not.toContain(`${filename} opened with`);
  }
});

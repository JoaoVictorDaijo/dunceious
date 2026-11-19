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
import { afterEach, it, expect, vi } from 'vitest';
import { act, render, screen, fireEvent, installCanvasRecorder, stubResizeObserver, within, waitFor } from '@/src/app/testing/renderHarness';
import App from '../App';
import type { BioWorkerResponse } from '@/src/workers/protocol';
import { handleBioMessage } from '@/src/workers/handlers/bio';
import { createDeferredWorker } from '@/src/app/testing/deferredWorker';
const Worker = createDeferredWorker(handleBioMessage);
const message = (data: BioWorkerResponse) => new MessageEvent<BioWorkerResponse>('message', { data });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it('keeps the confirmation above the real overlay while responses arrive and blocks workspace actions', () => {
  Worker.instances = []; vi.stubGlobal('Worker', Worker);
  installCanvasRecorder(); stubResizeObserver();
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(920);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(500);
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
  const view = render(<App />);
  const worker = Worker.instances[0];
  const deliver = (filename: string) => act(() => worker.onmessage?.(message(handleBioMessage({ type: 'PARSE_FASTA', filename, content: '>a\nAC--GT', workspaceRevision: 0, incomingCategory: 'nucleotide' }))));
  deliver('first.fa'); deliver('second.fa');
  expect(screen.getByText('1 of 2')).toBeTruthy();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Load without gaps' }));
  act(() => worker.onmessage?.(message({ type: 'PARSE_SUCCESS', filename: 'clean.gb', records: [{ id: 'clean', name: 'clean', sequence: 'ACGT', features: [] }] })));
  expect(screen.getByRole('alertdialog')).toBeTruthy();
  expect(screen.queryByText('Processing Genomic Data...')).toBeNull();
  const inputClick = vi.spyOn(HTMLInputElement.prototype, 'click');
  fireEvent.keyDown(document, { key: 'o', ctrlKey: true });
  fireEvent.keyDown(document, { key: 'o', metaKey: true });
  expect(inputClick).not.toHaveBeenCalled();
  expect([...view.container.querySelectorAll<HTMLInputElement>('input[data-drop-input]')].every(input => input.disabled)).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Project and options' }));
  const clear = screen.getByRole('button', { name: 'Clear workspace…' });
  expect(clear.hasAttribute('disabled')).toBe(true);
  fireEvent.click(clear);
  fireEvent.click(screen.getByRole('button', { name: 'Close options' }));
  expect(confirm).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Align sequences' }));
  expect(screen.queryByRole('dialog', { name: /Align/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: "Don't load" }));
  expect(screen.getByText('1 of 1')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Load without gaps' }));
  expect(screen.queryByRole('alertdialog')).toBeNull();
  expect(view.container.textContent).toContain('gap removal declined');
});
it('enables the pre-aligned picker on empty Sidebar and Hub, and blocks it when busy', () => {
  Worker.instances = []; vi.stubGlobal('Worker', Worker);
  installCanvasRecorder(); stubResizeObserver();
  const view = render(<App />);
  const aligned = view.container.querySelector<HTMLInputElement>('input[accept=".fasta,.fa"]')!;
  expect(aligned.disabled).toBe(false);
  expect(aligned.parentElement?.getAttribute('data-tip')).toBe('A pre-aligned FASTA: loads its sequences and alignment');
  fireEvent.click(screen.getByRole('button', { name: 'Annotation Hub' }));
  fireEvent.click(screen.getByRole('button', { name: 'Import' }));
  expect(screen.getByRole('menuitem', { name: 'Alignment' }).hasAttribute('disabled')).toBe(false);
  expect(screen.getByText('A pre-aligned FASTA: loads its sequences and alignment')).toBeTruthy();
  act(() => Worker.instances[0].onmessage?.(message(handleBioMessage({ type: 'PARSE_FASTA', filename: 'gaps.fa', content: '>a\nAC--GT' }))));
  expect(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Load without gaps' })).toBeTruthy();
});

it.each(['Sidebar', 'Hub', 'drop'] as const)('%s reaches the same pre-commit dialog', async path => {
  Worker.instances = []; vi.stubGlobal('Worker', Worker);
  installCanvasRecorder(); stubResizeObserver();
  const view = render(<App />);
  const file = new File(['>a\nAC--GT'], 'picked.fa');
  if (path !== 'Sidebar') fireEvent.click(screen.getByRole('button', { name: 'Annotation Hub' }));
  if (path === 'drop') fireEvent.drop(screen.getByRole('region', { name: 'Annotation Hub' }), { dataTransfer: { files: [file] } });
  else {
    const input = path === 'Hub' ? screen.getByLabelText('Import sequences files') : view.container.querySelector<HTMLInputElement>('input[data-drop-input][multiple]')!;
    fireEvent.change(input, { target: { files: [file] } });
  }
  const worker = Worker.instances[0];
  await waitFor(() => expect(worker.requests.some(request => request.type === 'PARSE_FASTA')).toBe(true));
  const index = worker.requests.findIndex(request => request.type === 'PARSE_FASTA');
  act(() => worker.release(index));
  expect(screen.getByRole('alertdialog', { name: 'Remove alignment gaps?' })).toBeTruthy();
  expect(view.container.querySelector('[data-navigator-record="a"]')).toBeNull();
  await act(async () => fireEvent.click(screen.getByRole('button', { name: "Don't load" })));
  expect(screen.queryByRole('alertdialog')).toBeNull();
  expect(view.container.querySelector('[data-navigator-record="a"]')).toBeNull();
});

it('updates conservation availability and mixed counts when an aligned row is hidden or shown', () => {
  Worker.instances = []; vi.stubGlobal('Worker', Worker);
  installCanvasRecorder(); stubResizeObserver();
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1920);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(800);
  const view = render(<App />);
  const worker = Worker.instances[0];
  act(() => worker.onmessage?.(message({ type: 'PARSE_SUCCESS', filename: 'fixture', records: [
    { id: 'a', name: 'a', sequence: 'ACGT', alignedSequence: 'AC--GT', features: [] },
    { id: 'b', name: 'b', sequence: 'ACTTGT', alignedSequence: 'ACTTGT', features: [] },
    { id: 'u', name: 'u', sequence: 'TTTTTTTT', features: [] },
  ] })));
  const flush = () => act(() => worker.release(worker.requests.length - 1));
  flush();
  const toggle = () => {
    if (!screen.queryByRole('button', { name: 'Conservation' })) fireEvent.click(screen.getByRole('button', { name: /^Layers/ }));
    return screen.getByRole('button', { name: 'Conservation' });
  };
  expect(toggle().getAttribute('aria-disabled')).toBe('false');
  expect(view.container.querySelector('[data-viewer-toolbar]')?.textContent).toContain('2 of 3 aligned');
  fireEvent.click(screen.getByRole('button', { name: 'Hide b in viewport' })); flush();
  expect(toggle().getAttribute('aria-disabled')).toBe('true');
  expect(toggle().getAttribute('data-tip')).toBe('Conservation needs at least two aligned sequences');
  expect(view.container.querySelector('[data-viewer-toolbar]')?.textContent).toContain('1 of 2 aligned');
  fireEvent.click(screen.getByRole('button', { name: 'Show b in viewport' })); flush();
  expect(toggle().getAttribute('aria-disabled')).toBe('false');
  expect(view.container.querySelector('[data-viewer-toolbar]')?.textContent).toContain('2 of 3 aligned');
});

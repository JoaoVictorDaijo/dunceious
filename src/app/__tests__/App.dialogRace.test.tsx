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
import { act, render, screen, fireEvent, within, installCanvasRecorder, stubResizeObserver } from '@/src/app/testing/renderHarness';
import { createDeferredWorker } from '@/src/app/testing/deferredWorker';
import { handleBioMessage } from '@/src/workers/handlers/bio';
import App from '@/src/app/App';

const Worker = createDeferredWorker(handleBioMessage);
const malformed = (id: string) => `LOCUS ${id} 4 bp DNA\nORIGIN\n 1 acg\n//\n`;
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function setup() {
  Worker.instances = [];
  vi.stubGlobal('Worker', Worker);
  installCanvasRecorder();
  stubResizeObserver();
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1200);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(700);
  const view = render(<App />);
  const worker = Worker.instances[0];
  const deliver = async (filename: string, content: string) => {
    const type = filename.endsWith('.fa') ? 'PARSE_FASTA' : 'PARSE_GENBANK';
    const data = handleBioMessage({ type, filename, content, workspaceRevision: 0 });
    await act(async () => worker.onmessage?.(new MessageEvent('message', { data })));
  };
  return { ...view, worker, deliver };
}

it.each(['gap-first', 'refusal-first'])('keeps one focus owner and explicit FASTA consent: %s', async order => {
  const h = setup();
  if (order === 'refusal-first') {
    await h.deliver('bad.gb', malformed('bad'));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));
  }
  await h.deliver('first.fa', '>gapped1\nAC--GT');
  await h.deliver('second.fa', '>gapped2\nAC--GT');
  if (order === 'gap-first') await h.deliver('bad.gb', malformed('bad'));
  await h.deliver('later.gb', malformed('later'));

  const gap = screen.getByRole('alertdialog', { name: 'Remove alignment gaps?' });
  expect(screen.getAllByRole('alertdialog')).toEqual([gap]);
  const load = within(gap).getByRole('button', { name: 'Load without gaps' });
  expect(document.activeElement).toBe(load);
  fireEvent.keyDown(load, { key: 'Tab' });
  expect(document.activeElement).toBe(within(gap).getByRole('link', { name: 'NCBI FASTA guidance' }));
  fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true });
  expect(document.activeElement).toBe(load);
  expect(h.worker.requests.some(r => r.type === 'PROCESS_RECORDS')).toBe(false);
  expect(h.container.querySelector('[data-navigator-record="gapped1"]')).toBeNull();
  expect(h.container.querySelector('[data-navigator-record="gapped2"]')).toBeNull();

  fireEvent.keyDown(load, { key: 'Escape' });
  const nextGap = screen.getByRole('alertdialog', { name: 'Remove alignment gaps?' });
  expect(screen.getAllByRole('alertdialog')).toEqual([nextGap]);
  expect(within(nextGap).getByText('second.fa')).toBeTruthy();
  const nextLoad = within(nextGap).getByRole('button', { name: 'Load without gaps' });
  expect(document.activeElement).toBe(nextLoad);
  expect(h.worker.requests.some(r => r.type === 'PROCESS_RECORDS')).toBe(false);
  await act(async () => fireEvent.click(nextLoad));
  act(() => h.worker.requests.forEach((r, i) => { if (r.type === 'PROCESS_RECORDS') h.worker.release(i); }));

  const refusal = screen.getByRole('alertdialog', { name: "Can't open this GenBank file" });
  expect(screen.getAllByRole('alertdialog')).toEqual([refusal]);
  expect(within(refusal).getAllByRole('heading', { level: 3 }).map(e => e.textContent)).toEqual(["bad.gb wasn't loaded", "later.gb wasn't loaded"]);
  const close = within(refusal).getByRole('button', { name: 'Close' });
  expect(document.activeElement).toBe(close);
  fireEvent.keyDown(close, { key: 'Tab' });
  expect(document.activeElement).toBe(within(refusal).getByRole('button', { name: 'Copy details' }));
  fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true });
  expect(document.activeElement).toBe(close);
  fireEvent.keyDown(close, { key: 'Escape' });
  expect(screen.queryByRole('alertdialog')).toBeNull();
  expect(h.container.querySelector('[data-navigator-record="gapped1"]')).toBeNull();
  expect(h.container.querySelector('[data-navigator-record="gapped2"]')).not.toBeNull();
  expect(h.container.textContent).toContain('gap removal declined');
});

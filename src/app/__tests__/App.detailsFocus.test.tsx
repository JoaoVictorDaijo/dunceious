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
import { act, render, screen, fireEvent, installCanvasRecorder, stubResizeObserver } from '@/src/app/testing/renderHarness';
import { handleBioMessage } from '@/src/workers/handlers/bio';
import type { BioWorkerRequest, BioWorkerResponse } from '@/src/workers/protocol';
import App from '../App';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('returns focus to the surviving details invoker after extra-list autofocus and modal closure', async () => {
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
 render(<App />);
 await act(async () => workers[0].onmessage?.({ data: { type: 'PARSE_SUCCESS', filename: 'r.gb', records: [{
   id: 'r', name: 'r', sequence: 'ATGAAATAA', moleculeType: 'dna', features: [{
     type: 'CDS', name: 'extra', start: 0, end: 9, strand: 1, segments: [{ start: 0, end: 9 }],
     metadata: { translation: 'MKVW', transl_table: '11' },
   }],
 }] } }));
 fireEvent.click(screen.getByRole('button', { name: 'Annotation Hub' }));
 const invoker = screen.getByRole('button', { name: 'Inspect extra on r' });
 invoker.focus(); fireEvent.click(invoker);
 expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Extra stored translation positions' }));
 fireEvent.click(screen.getByRole('button', { name: 'Close' }));
 expect(screen.queryByRole('heading', { name: 'Annotation Details' })).toBeNull();
 expect(invoker.isConnected).toBe(true);
 expect(document.activeElement).toBe(invoker);
});

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
import { act, render, screen, fireEvent, installCanvasRecorder, stubResizeObserver } from '@/src/app/testing/renderHarness';
import App from '../DesktopApp';
import { handleBioMessage } from '@/src/workers/handlers/bio';
import type { BioWorkerRequest, BioWorkerResponse } from '@/src/workers/protocol';
import type { SeqRecord } from '@/src/domain/bio/types';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('aligned annotation details', () => {
  it('resolves a clicked aligned bar to its biological feature', () => {
    const workers: TestWorker[] = [];
    class TestWorker {
      onmessage: ((event: { data: BioWorkerResponse }) => void) | null = null;
      constructor() { workers.push(this); }
      postMessage(request: BioWorkerRequest) {
        this.onmessage?.({ data: handleBioMessage(request) });
      }
      terminate() {}
    }
    vi.stubGlobal('Worker', TestWorker);
    installCanvasRecorder();
    stubResizeObserver();
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(920);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(500);
    const record: SeqRecord = { id: 'r', name: 'r', sequence: 'ACGT', alignedSequence: '--AC--GT--',
      features: [{ type: 'gene', name: 'gapped', start: 0, end: 4, strand: 1 }] };
    const { container } = render(<App />);
    act(() => { workers[0].onmessage?.({ data: { type: 'PARSE_SUCCESS', records: [record] } }); });
    const bar = container.querySelector('[data-annotation-part]');
    expect(bar).not.toBeNull();
    fireEvent.click(bar!);
    expect(screen.getByText('Annotation Details')).toBeTruthy();
    expect(screen.getByText('1..4')).toBeTruthy();
    expect(screen.getAllByText('4 bp')).toHaveLength(2);
    expect(screen.getByText('ACGT')).toBeTruthy();
  });
});

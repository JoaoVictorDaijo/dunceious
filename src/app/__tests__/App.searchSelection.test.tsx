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
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@/src/app/testing/renderHarness';
import { handleBioMessage } from '@/src/workers/handlers/bio';
import type { BioWorkerRequest, BioWorkerResponse } from '@/src/workers/protocol';
import type GenomeViewer from '@/src/app/viewer/GenomeViewer';
import App from '../App';

vi.mock('@/src/app/viewer/GenomeViewer', () => ({ default: ({ activeSelection, onSelectionChange }: ComponentProps<typeof GenomeViewer>) => <>
  <output aria-label="Viewport selection">{JSON.stringify(activeSelection)}</output>
  <button onClick={() => onSelectionChange({ start: 2, end: 4, recordIds: ['r'] })}>Select manually</button>
  <button onClick={() => onSelectionChange({ start: 0, end: 2, recordIds: ['r'] })}>Select same range manually</button>
</> }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function search() {
  const workers: TestWorker[] = [];
  class TestWorker {
    onmessage: ((event: { data: BioWorkerResponse }) => void) | null = null;
    constructor() { workers.push(this); }
    postMessage(request: BioWorkerRequest) { this.onmessage?.({ data: handleBioMessage(request) }); }
    terminate() {}
  }
  vi.stubGlobal('Worker', TestWorker);
  render(<App />);
  act(() => workers[0].onmessage?.({ data: { type: 'PARSE_SUCCESS', filename: 'search.fa', records: [{ id: 'r', name: 'r', sequence: 'ACGT', features: [] }] } }));
  fireEvent.change(screen.getByPlaceholderText('Enter IUPAC sequence...'), { target: { value: 'AC' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  await waitFor(() => expect(screen.getByLabelText('Viewport selection').textContent).toBe('{"start":0,"end":2,"recordIds":["r"]}'));
}

describe('search selection ownership', () => {
  it('clears the selection created by search', async () => {
    await search();
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByLabelText('Viewport selection').textContent).toBe('null');
    expect((screen.getByPlaceholderText('Enter IUPAC sequence...') as HTMLInputElement).value).toBe('');
  });
  it.each([
    { button: 'Select manually', selection: '{"start":2,"end":4,"recordIds":["r"]}' },
    { button: 'Select same range manually', selection: '{"start":0,"end":2,"recordIds":["r"]}' },
  ])('retains a later manual selection: $button', async ({ button, selection }) => {
    await search();
    fireEvent.click(screen.getByRole('button', { name: button }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByLabelText('Viewport selection').textContent).toBe(selection);
    expect((screen.getByPlaceholderText('Enter IUPAC sequence...') as HTMLInputElement).value).toBe('');
  });
});

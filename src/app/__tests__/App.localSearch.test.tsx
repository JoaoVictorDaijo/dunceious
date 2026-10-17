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
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within, stubResizeObserver } from '@/src/app/testing/renderHarness';
import { handleBioMessage } from '@/src/workers/handlers/bio';
import type { BioWorkerRequest, BioWorkerResponse, LocalSearchProgress, LocalSearchResult } from '@/src/workers/protocol';
import type GenomeViewer from '@/src/app/viewer/GenomeViewer';
import { withSearchHit } from '@/src/domain/bio/searchHit';
import type { SeqRecord } from '@/src/domain/bio/types';
import App from '../App';

const pool = vi.hoisted(() => ({ ready: true, error: null as string | null, run: vi.fn(), cancel: vi.fn() }));
const moduleState = vi.hoisted(() => ({ bytes: new ArrayBuffer(8), error: null as string | null }));
vi.mock('../hooks/useLocalSearchPool', () => ({ useLocalSearchPool: () => pool }));
vi.mock('../lib/localEngineModule', () => ({ useLocalEngineBytes: () => moduleState, loadLocalEngineBytes: () => Promise.resolve(moduleState.bytes) }));
vi.mock('@/src/app/viewer/GenomeViewer', () => ({ default: ({ records, completedSearch, searchResults, activeSelection, onViewDetails }: ComponentProps<typeof GenomeViewer>) => <>
  <output aria-label="Search in viewer">{JSON.stringify({ query: completedSearch?.query, mode: completedSearch?.mode, results: searchResults, selection: activeSelection })}</output>
  <output aria-label="Viewer records">{JSON.stringify(records)}</output>
  <button onClick={() => onViewDetails?.('r', records[0].features[0])}>Open hit details</button>
</> }));

beforeEach(() => { pool.ready = true; pool.error = null; moduleState.error = null; pool.run.mockReset(); pool.cancel.mockReset(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

function setup(records: SeqRecord[] = [{ id: 'r', name: 'r', sequence: 'ACGT', features: [] }]) {
  stubResizeObserver();
  const workers: TestWorker[] = [];
  class TestWorker {
    onmessage: ((event: { data: BioWorkerResponse }) => void) | null = null;
    constructor() { workers.push(this); }
    postMessage(request: BioWorkerRequest) { this.onmessage?.({ data: handleBioMessage(request) }); }
    terminate() {}
  }
  vi.stubGlobal('Worker', TestWorker);
  render(<App />);
  act(() => workers[0].onmessage?.({ data: { type: 'PARSE_SUCCESS', filename: 'local.fa', records } }));
  fireEvent.click(screen.getByRole('button', { name: 'Fuzzy' }));
}

it('passes Local module readiness and failure through the App to the search controls', () => {
  pool.ready = false;
  moduleState.error = 'Local module load failed: unavailable';
  setup();
  const local = screen.getByRole('button', { name: 'Local' }) as HTMLButtonElement;
  expect(local.disabled).toBe(true);
  expect(local.title).toBe(moduleState.error);
  expect(screen.getByText(moduleState.error)).toBeTruthy();
});

it('connects progress, monitor, pill, cancellation and completed local hits to the viewer', async () => {
  let complete!: (value: LocalSearchResult) => void;
  let report!: (value: LocalSearchProgress) => void;
  pool.run.mockImplementation((_request, progress) => {
    report = progress;
    return new Promise<LocalSearchResult>(resolve => { complete = resolve; });
  });
  setup();
  expect(screen.getByText('Local search ready')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Local' }));
  fireEvent.change(screen.getByPlaceholderText('Enter query sequence...'), { target: { value: 'AC' } });
  vi.useFakeTimers();
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  act(() => {
    report({ streamsDone: 1, streamsTotal: 2, currentFraction: 0.5 });
    vi.advanceTimersByTime(1000);
  });
  let monitor = screen.getByRole('dialog', { name: 'Local search job monitor' });
  expect(within(monitor).getByRole('progressbar', { name: 'Record strands searched' }).getAttribute('value')).toBe('1');
  fireEvent.click(within(monitor).getByRole('button', { name: 'Minimize' }));
  expect(screen.queryByRole('dialog', { name: 'Local search job monitor' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /Local search · 1\/2 — Open search job monitor/ }));
  monitor = screen.getByRole('dialog', { name: 'Local search job monitor' });
  fireEvent.click(within(monitor).getByRole('button', { name: 'Cancel' }));
  expect(pool.cancel).toHaveBeenCalledTimes(1);
  expect(within(monitor).queryByRole('button', { name: 'Cancel' })).toBeNull();
  expect(screen.getAllByText('Search cancelled').length).toBeGreaterThan(0);
  fireEvent.click(within(monitor).getByRole('button', { name: 'Close' }));
  const results = [{ recordId: 'r', start: 0, end: 2, strand: 1 as const, sequence: 'AC', cigar: '2=' }];
  const counts = { cutoff: null, streams: 2, noPositiveStreams: 1, skippedRecords: [], hiddenByOverlap: 0, hiddenByFilters: 0, beyondLimit: 0 };
  await act(async () => complete({ results, counts }));
  expect(JSON.parse(screen.getByLabelText('Search in viewer').textContent!)).toEqual({ results: [], selection: null });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  await act(async () => {
    complete({ results, counts });
  });
  act(() => vi.advanceTimersByTime(1));
  vi.useRealTimers();
  await waitFor(() => expect(JSON.parse(screen.getByLabelText('Search in viewer').textContent!)).toEqual({
    query: 'AC', mode: 'local', results, selection: { start: 0, end: 2, recordIds: ['r'] },
  }));
  expect(screen.getByText('Search done')).toBeTruthy();
  expect(screen.getByText('2 streams searched')).toBeTruthy();
  expect(screen.getByText(': Similar: dashed outline, positive matrix score')).toBeTruthy();
});

it('persists query display choice and removes search provenance only from the opened annotation', () => {
  const hit = withSearchHit({ type: 'gene', name: 'hit', start: 0, end: 2, strand: 1 }, {
    v: 1, query: 'AC', cigar: '2=', mode: 'local', alphabet: 'nucleotide', params: {}, strand: 1,
    span: { start: 0, end: 2, strand: 1 }, appVersion: 'test', createdAt: '', exportNote: false,
  });
  setup([{ id: 'r', name: 'r', sequence: 'ACGT', features: [hit, { ...hit, name: 'untouched' }] },
    { id: 'other', name: 'other', sequence: 'ACGT', features: [hit] }]);
  fireEvent.click(screen.getByRole('button', { name: 'Open hit details' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Bases inside' }), { target: { value: 'query' } });
  expect((screen.getByRole('combobox', { name: 'Bases inside' }) as HTMLSelectElement).value).toBe('query');
  let records = JSON.parse(screen.getByLabelText('Viewer records').textContent!) as SeqRecord[];
  expect(records[0].features[0].metadata?._showBases).toBe('query');
  fireEvent.click(screen.getByRole('button', { name: 'Remove search details' }));
  expect(screen.queryByRole('option', { name: 'Query aligned to record' })).toBeNull();
  records = JSON.parse(screen.getByLabelText('Viewer records').textContent!) as SeqRecord[];
  expect(records[0].features[0].metadata).toEqual({});
  expect(records[0].features[1].metadata?._searchHit).toBe(hit.metadata?._searchHit);
  expect(records[1].features[0].metadata?._searchHit).toBe(hit.metadata?._searchHit);
});

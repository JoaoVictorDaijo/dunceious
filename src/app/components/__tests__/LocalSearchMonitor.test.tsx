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
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@/src/app/testing/renderHarness';
import JobPill from '../JobPill';
import LocalSearchMonitor from '../search/LocalSearchMonitor';
import type { LocalSearchJob } from '../../hooks/useSearchWorker';
const job: LocalSearchJob = { phase: 'running', startedAt: 1000, progress: { phase: 'align' as const, streamsDone: 12, streamsTotal: 50, currentFraction: 0.5 } };
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(1000); vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} }); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it('waits one second, minimizes to a draggable pill, reopens and cancels', () => {
  const cancel = vi.fn();
  render(<LocalSearchMonitor job={job} onCancel={cancel} />);
  expect(screen.queryByRole('dialog')).toBeNull();
  act(() => vi.advanceTimersByTime(999));
  expect(screen.queryByRole('dialog')).toBeNull();
  act(() => vi.advanceTimersByTime(1));
  expect(screen.getByRole('dialog')).toBeTruthy();
  expect(screen.getAllByText('Local search')).toHaveLength(1);
  expect(screen.getByRole('status').textContent).toBe('Searching');
  expect(screen.getByText('12 of 50 record strands searched')).toBeTruthy();
  const progress = screen.getByRole('progressbar') as HTMLProgressElement;
  expect(progress.value).toBe(12);
  expect(progress.max).toBe(50);
  expect(screen.queryByText(/Current scoring pass|Enumeration continues/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Minimize' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /Local search · 12\/50.*Open search job monitor/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(cancel).toHaveBeenCalledOnce();
});
it('never flashes a monitor for a fast search; closes it on invalidation', () => {
  const h = render(<LocalSearchMonitor job={job} onCancel={vi.fn()} />);
  h.rerender(<LocalSearchMonitor job={{ ...job, phase: 'done', endedAt: 1200 }} onCancel={vi.fn()} />);
  act(() => vi.advanceTimersByTime(2000));
  expect(screen.queryByRole('dialog')).toBeNull();
});
it('keeps a minimized terminal status distinct from no hits', () => {
  const h = render(<LocalSearchMonitor job={job} onCancel={vi.fn()} />);
  act(() => vi.advanceTimersByTime(1000));
  fireEvent.click(screen.getByRole('button', { name: 'Minimize' }));
  h.rerender(<LocalSearchMonitor job={{ ...job, phase: 'cancelled', endedAt: 2000 }} onCancel={vi.fn()} />);
  expect(screen.getByRole('button', { name: /Search cancelled/ })).toBeTruthy();
});

it('stacks search and alignment pills without overlap and keeps positions separate', () => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function(this: HTMLElement) {
    return new DOMRect(Number.parseFloat(this.style.left) || 780, Number.parseFloat(this.style.top) || 720, 200, 48);
  });
  const h = render(<><JobPill label="Aligned" elapsed={1} active={false} done failed={false} monitorName="alignment" dataAttribute="data-alignment-job-pill" onOpen={vi.fn()} />
    <JobPill label="Local search · 12/50" elapsed={8} active done={false} failed={false} monitorName="search" dataAttribute="data-local-search-pill" onOpen={vi.fn()} /></>);
  const alignment = h.container.querySelector('[data-alignment-job-pill]')!.getBoundingClientRect();
  const local = h.container.querySelector('[data-local-search-pill]')!.getBoundingClientRect();
  expect(local.bottom + 8 <= alignment.top || alignment.bottom + 8 <= local.top).toBe(true);
  vi.restoreAllMocks();
});

it('names the scoring pass in the monitor and minimized pill', () => {
  const scoringJob: LocalSearchJob = { ...job, progress: { ...job.progress, phase: 'score' } };
  const h = render(<LocalSearchMonitor job={scoringJob} onCancel={vi.fn()} />);
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.getByRole('status').textContent).toBe('Scoring streams');
  expect(screen.getByText('12 of 50 record strands scored')).toBeTruthy();
  expect(screen.getByRole('progressbar', { name: 'Record strands scored' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Minimize' }));
  expect(screen.getByRole('button', { name: /Scoring streams · 12\/50/ })).toBeTruthy();
  h.rerender(<LocalSearchMonitor job={job} onCancel={vi.fn()} />);
  expect(screen.getByRole('button', { name: /Local search · 12\/50/ })).toBeTruthy();
});

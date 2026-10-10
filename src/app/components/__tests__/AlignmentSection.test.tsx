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
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@/src/app/testing/renderHarness';
import { createAlignmentProgress } from '@/src/app/logic/remoteAlignment';
import AlignmentSection from '../AlignmentSection';

afterEach(() => vi.useRealTimers());

describe('Alignment section', () => {
  it('disables alignment with no records and opens configuration when records are loaded', () => {
    const onOpen = vi.fn();
    const view = render(<AlignmentSection count={0} onOpen={onOpen} />);
    const button = screen.getByRole('button', { name: 'Align Sequences' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(onOpen).not.toHaveBeenCalled();
    view.rerender(<AlignmentSection count={2} onOpen={onOpen} />);
    expect(button.disabled).toBe(false);
    expect(button.getAttribute('data-tip')).toBe("Send the loaded sequences to EMBL-EBI's servers for alignment, then overlay the result");
    expect(screen.getByText('MAFFT · Kalign · Clustal Ω · MUSCLE via EMBL-EBI')).toBeTruthy();
    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('shows the engine, live stage and elapsed time, and reopens the monitor while locked', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-09T12:00:10.000Z'));
    const onOpen = vi.fn();
    const progress = createAlignmentProgress('kalign', 2, 100, Date.now() - 10000);
    const view = render(<AlignmentSection count={2} state={{ ...progress, phase: 'queued', jobId: 'job', since: Date.now() }} onOpen={onOpen} />);
    expect(screen.getByRole('status').textContent).toBe('Kalign · Queued at EBI');
    expect(screen.getByRole('status').parentElement?.textContent).toBe('Kalign · Queued at EBI · 10 s');
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByRole('status').parentElement?.textContent).toBe('Kalign · Queued at EBI · 11 s');
    view.rerender(<AlignmentSection count={2} state={{ ...progress, phase: 'running', jobId: 'job', since: Date.now() }} onOpen={onOpen} />);
    expect(screen.getByRole('status').textContent).toBe('Kalign · Aligning');
    const button = screen.getByRole('button', { name: 'Alignment running' }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(button.getAttribute('data-tip')).toBe('Show the running alignment');
    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalledOnce();
    view.rerender(<AlignmentSection count={2} state={{ phase: 'idle' }} onOpen={onOpen} />);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('button', { name: 'Align Sequences' })).toBeTruthy();
  });
});

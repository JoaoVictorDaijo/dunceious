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
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@/src/app/testing/renderHarness';
import { ALIGNMENT_ENGINES, preflightAlignment } from '@/src/core/alignment';
import { createAlignmentProgress } from '@/src/app/logic/remoteAlignment';
import AlignRemoteModal, { type AlignRemoteModalProps } from '../AlignRemoteModal';

function props(overrides: Partial<AlignRemoteModalProps> = {}): AlignRemoteModalProps {
  return {
    state: { phase: 'configuring' }, count: 3, bytes: 90000, moleculeKind: 'dna', hasAlignment: false,
    engineId: 'mafft', email: '', verifiedEmail: '', verdicts: Object.fromEntries(ALIGNMENT_ENGINES.map(e => [e.id, preflightAlignment(Array.from({ length: overrides.count ?? 3 }, (_, i) => ({ id: String(i), sequence: 'AC' })), e.id)])) as AlignRemoteModalProps['verdicts'], onEngineChange: vi.fn(), onEmailChange: vi.fn(),
    onSubmit: vi.fn(), onCancel: vi.fn(), onRetry: vi.fn(), onMinimize: vi.fn(), ...overrides,
  };
}

describe('AlignRemoteModal', () => {
  it('selects MAFFT with a Default pill and focuses it on open', () => {
    render(<AlignRemoteModal {...props()} />);
    const mafft = screen.getByRole('radio', { name: /^MAFFT/ }) as HTMLInputElement;
    expect(mafft.checked).toBe(true);
    expect(document.activeElement).toBe(mafft);
    expect(screen.getByText('Default')).toBeTruthy();
    expect(screen.getByRole('radiogroup')).toBeTruthy();
    expect(screen.getByText('3 sequences · 90 KB · nucleotide')).toBeTruthy();
  });
  it('shows disabled engine reasons without selecting a fallback', () => {
    render(<AlignRemoteModal {...props({ count: 612, engineId: null })} />);
    expect((screen.getByRole('radio', { name: /^MAFFT/ }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText('612 sequences — MAFFT takes up to 500')).toBeTruthy();
    expect(screen.getAllByRole('radio').every(r => !(r as HTMLInputElement).checked)).toBe(true);
    expect((screen.getByRole('button', { name: 'Align' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('requires a valid email and submits the configured choice', () => {
    const p = props();
    const view = render(<AlignRemoteModal {...p} />);
    expect((screen.getByRole('button', { name: 'Align' }) as HTMLButtonElement).disabled).toBe(true);
    view.rerender(<AlignRemoteModal {...p} email="a@b.org" />);
    fireEvent.click(screen.getByRole('button', { name: 'Align' }));
    expect(p.onSubmit).toHaveBeenCalledOnce();
    fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), { target: { value: 'new@b.org' } });
    expect(p.onEmailChange).toHaveBeenCalledWith('new@b.org');
  });
  it('warns that the current alignment will be replaced', () => {
    render(<AlignRemoteModal {...props({ hasAlignment: true })} />);
    expect(screen.getByText(/replace the current alignment/i)).toBeTruthy();
  });
  it('shows the failure detail and retry action', () => {
    const p = props({ state: { ...createAlignmentProgress('mafft', 3, 90000, 0), steps: { ...createAlignmentProgress('mafft', 3, 90000, 0).steps, queued: { status: 'failed' } }, phase: 'failed', reason: 'job-lost', detail: 'EBI no longer has this job.', jobId: 'job-1' } });
    render(<AlignRemoteModal {...p} />);
    expect(screen.getByText('EBI no longer has this job.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(p.onRetry).toHaveBeenCalledOnce();
  });
  it('minimizes with Escape without cancelling and restores focus on close', () => {
    const trigger = document.createElement('button'); document.body.append(trigger); trigger.focus();
    const p = props({ state: { ...createAlignmentProgress('mafft', 3, 90000, 0), phase: 'queued', jobId: 'job-1', since: Date.now() - 121000 } });
    const view = render(<AlignRemoteModal {...p} />);
    expect(screen.getByText(/EBI's queue is busy/)).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(p.onMinimize).toHaveBeenCalledOnce();
    expect(p.onCancel).not.toHaveBeenCalled();
    view.unmount(); expect(document.activeElement).toBe(trigger); trigger.remove();
  });
  it('traps Tab inside the dialog', () => {
    render(<AlignRemoteModal {...props({ email: 'a@b.org' })} />);
    const align = screen.getByRole('button', { name: 'Align' }); align.focus();
    fireEvent.keyDown(align, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: /^MAFFT/ }));
  });
});

describe('preflight and monitor UI', () => {
  it('shows structural email errors after blur and accepts the EBI structural examples', () => {
    const p = props({ email: 'a@localhost' }); const view = render(<AlignRemoteModal {...p} />);
    expect(screen.queryByText('Enter a structurally valid email address.')).toBeNull();
    fireEvent.blur(screen.getByRole('textbox', { name: 'Email' }));
    expect(screen.getByText('Enter a structurally valid email address.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Align' }) as HTMLButtonElement).disabled).toBe(true);
    view.rerender(<AlignRemoteModal {...p} email="a..b@x.com." />);
    expect((screen.getByRole('button', { name: 'Align' }) as HTMLButtonElement).disabled).toBe(false);
  });
  it('shows a global preflight issue once and disables Align', () => {
    render(<AlignRemoteModal {...props({ count: 1, email: 'a@x.com' })} />);
    expect(screen.getByRole('alert').textContent).toContain('At least 2 sequences');
    expect((screen.getByRole('button', { name: 'Align' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('renders EBI email errors inline while keeping the picker', () => {
    render(<AlignRemoteModal {...props({ state: { phase: 'configuring', emailError: "EBI could not verify this address's domain" } })} />);
    expect(screen.getByRole('radiogroup')).toBeTruthy();
    expect(screen.getByText("EBI could not verify this address's domain")).toBeTruthy();
  });
  it('renders done, skipped, active, and failed monitor rows', () => {
    const progress = createAlignmentProgress('mafft', 3, 90000, Date.now());
    progress.steps.validated = { status: 'done', enteredAt: 1000, leftAt: 2000 };
    progress.steps.queued = { status: 'skipped' };
    progress.steps.running = { status: 'active', enteredAt: Date.now() };
    const p = props({ state: { ...progress, phase: 'running', jobId: 'job', since: Date.now() } });
    const view = render(<AlignRemoteModal {...p} />);
    expect(screen.getByText('Skipped')).toBeTruthy();
    expect(screen.getByText(/1 s/)).toBeTruthy();
    view.rerender(<AlignRemoteModal {...p} state={{ ...progress, steps: { ...progress.steps, running: { status: 'failed' } }, phase: 'failed', reason: 'network', detail: 'Offline' }} />);
    expect(screen.getByText('Offline')).toBeTruthy();
  });
});

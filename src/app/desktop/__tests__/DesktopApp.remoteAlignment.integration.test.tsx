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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within, waitFor, stubResizeObserver, installCanvasRecorder } from '@/src/app/testing/renderHarness';
import type { SidebarProps } from '@/src/app/desktop/components/Sidebar';
import type { AnnotationHubPanelProps } from '@/src/app/desktop/components/AnnotationHubPanel';
import type { EbiClient, EbiResponse } from '@/src/app/shared/lib/ebiClient';
import type { BioWorkerRequest, BioWorkerResponse } from '@/src/workers/protocol';
import { handleBioMessage } from '@/src/workers/handlers/bio';
import { clearAlignConsent, readAlignConsent } from '@/src/app/shared/logic/alignConsentPref';
import App from '../DesktopApp';

const captured = vi.hoisted(() => ({ sidebar: null as SidebarProps | null, hub: null as AnnotationHubPanelProps | null, client: null as EbiClient | null }));
vi.mock('@/src/app/shared/lib/ebiClient', () => ({ createEbiClient: () => captured.client }));
vi.mock('@/src/app/desktop/components/Sidebar', async () => {
  const actual = await vi.importActual<typeof import('@/src/app/desktop/components/Sidebar')>('@/src/app/desktop/components/Sidebar');
  return { default: (props: SidebarProps) => { captured.sidebar = props; return <actual.default {...props} />; } };
});
vi.mock('@/src/app/desktop/components/AnnotationHubPanel', async () => {
  const actual = await vi.importActual<typeof import('@/src/app/desktop/components/AnnotationHubPanel')>('@/src/app/desktop/components/AnnotationHubPanel');
  return { default: (props: AnnotationHubPanelProps) => { captured.hub = props; return <actual.default {...props} />; } };
});
vi.mock('@/src/app/shared/viewer/GenomeViewer', () => ({ default: () => null }));

class LocalWorker {
  static instances: LocalWorker[] = [];
  onmessage: ((event: { data: BioWorkerResponse }) => void) | null = null;
  constructor() { LocalWorker.instances.push(this); }
  postMessage(request: BioWorkerRequest) { queueMicrotask(() => this.onmessage?.({ data: handleBioMessage(request) })); }
  terminate() { this.onmessage = null; }
}
const records = [{ id: 'seq1', name: 'seq1', sequence: 'AC', features: [] }, { id: 'seq1 (1)', name: 'seq1 (1)', sequence: 'AGC', features: [] }];
let finish!: (response: EbiResponse) => void;
beforeEach(() => {
  clearAlignConsent();
  LocalWorker.instances = []; captured.sidebar = null; captured.hub = null;
  stubResizeObserver(); installCanvasRecorder(); vi.stubGlobal('Worker', LocalWorker);
  vi.spyOn(window, 'confirm').mockReturnValue(true); vi.spyOn(window, 'prompt').mockReturnValue('CLEAR');
  captured.client = {
    submit: vi.fn<EbiClient['submit']>(async () => ({ kind: 'ok', data: 'job' })),
    status: vi.fn(() => new Promise<EbiResponse>(resolve => { finish = resolve; })),
    resultTypes: vi.fn<EbiClient['resultTypes']>(async () => ({ kind: 'ok', data: '<identifier>fa</identifier>' })),
    result: vi.fn<EbiClient['result']>(async () => ({ kind: 'ok', data: '>s1\nA-C\n>s2\nAGC' })),
  };
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

async function loadApp() {
  const view = render(<App />);
  await act(async () => LocalWorker.instances[0].onmessage?.({ data: { type: 'PARSE_SUCCESS', records } }));
  return view;
}
async function beginAlignment() {
  fireEvent.click(screen.getByRole('button', { name: /Align Sequences/ }));
  expect(captured.client!.submit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect(readAlignConsent()).not.toBeNull();
  fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), { target: { value: 'user@gmail.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Align' }));
  await waitFor(() => expect(captured.client!.status).toHaveBeenCalledOnce());
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
}
async function start() {
  const view = await loadApp(); await beginAlignment(); return view;
}

describe('remote alignment application integration', () => {
  it('locks controls and every mutation handler while permitting monitor reopen', async () => {
    const view = await start();
    const reader = vi.spyOn(FileReader.prototype, 'readAsText');
    for (const accept of ['.gb,.genbank,.fasta,.fa', '.fasta,.fa', '.json']) {
      const input = view.container.querySelector<HTMLInputElement>(`input[accept="${accept}"]`)!;
      expect(input.disabled).toBe(true);
      expect(input.parentElement?.getAttribute('data-tip')).toBe('Locked while the EBI alignment runs');
    }
    const event = { target: { files: [new File(['>x\nAC'], 'x.fa')], value: 'x' } } as unknown as React.ChangeEvent<HTMLInputElement>;
    act(() => {
      captured.sidebar!.onFileUpload(event); captured.sidebar!.onAlignmentUpload(event); captured.sidebar!.onProjectUpload(event);
      captured.sidebar!.onRemoveRecord('seq1'); captured.sidebar!.onSetActiveTab('features');
    });
    act(() => captured.hub!.onClearAll());
    expect(reader).not.toHaveBeenCalled(); expect(window.prompt).not.toHaveBeenCalled();
    expect(captured.sidebar!.records).toHaveLength(2);
    expect((screen.getByRole('button', { name: /Clear All/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByRole('button', { name: /^Remove / }).every(button => (button as HTMLButtonElement).disabled)).toBe(true);
    const alignmentSection = screen.getByRole('region', { name: 'Alignment' });
    expect(within(alignmentSection).getByRole('status').textContent).toBe('MAFFT · Checking job status');
    fireEvent.click(within(alignmentSection).getByRole('button', { name: 'Alignment running' }));
    expect(screen.getByRole('dialog')).toBeTruthy(); expect(captured.client!.submit).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(captured.sidebar!.isAlignmentLocked).toBe(false);
    await act(async () => finish({ kind: 'ok', data: 'FINISHED' }));
    expect(captured.sidebar!.records.every(record => !record.alignedSequence)).toBe(true);
  });
  it('applies exact IDs through the shared reducer and fades the successful pill', async () => {
    await start(); vi.useFakeTimers();
    await act(async () => finish({ kind: 'ok', data: 'FINISHED' }));
    expect(captured.sidebar!.records.map(record => [record.id, record.alignedSequence])).toEqual([['seq1', 'A-C'], ['seq1 (1)', 'AGC']]);
    expect(captured.sidebar!.logs.some(log => log.includes('External alignment applied successfully (3 bp).'))).toBe(true);
    expect(captured.sidebar!.isAlignmentLocked).toBe(false);
    expect(screen.getByRole('button', { name: /Aligned/ })).toBeTruthy();
    await act(async () => vi.advanceTimersByTimeAsync(4000));
    expect(screen.queryByRole('button', { name: /Aligned/ })).toBeNull();
  });
  it('keeps the failure pill until opened and releases locks', async () => {
    await start(); vi.useFakeTimers();
    await act(async () => finish({ kind: 'ok', data: 'NOT_FOUND' }));
    await act(async () => vi.advanceTimersByTimeAsync(10000));
    expect(captured.sidebar!.isAlignmentLocked).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /Alignment failed/ }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('EBI no longer has this job.')).toBeTruthy();
  });
  it('runs a clean second job from Try again and overlays its result', async () => {
    await start();
    await act(async () => finish({ kind: 'ok', data: 'NOT_FOUND' }));
    fireEvent.click(screen.getByRole('button', { name: /Alignment failed/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    fireEvent.click(screen.getByRole('button', { name: 'Align' }));
    await waitFor(() => expect(captured.client!.status).toHaveBeenCalledTimes(2));
    expect(captured.client!.submit).toHaveBeenCalledTimes(2);
    expect(captured.sidebar!.isAlignmentLocked).toBe(true);
    await act(async () => finish({ kind: 'ok', data: 'FINISHED' }));
    expect(captured.sidebar!.records.map(record => [record.id, record.alignedSequence])).toEqual([['seq1', 'A-C'], ['seq1 (1)', 'AGC']]);
    expect(captured.sidebar!.isAlignmentLocked).toBe(false);
  });
});

describe('file reads started before the lock', () => {
  it.each(['onFileUpload', 'onAlignmentUpload', 'onProjectUpload'] as const)('discards pending %s completion while locked', async handler => {
    await loadApp();
    const read = vi.spyOn(FileReader.prototype, 'readAsText').mockImplementation(() => {});
    const event = { target: { files: [new File(['unused'], 'pending.fa')], value: 'x' } } as unknown as React.ChangeEvent<HTMLInputElement>;
    act(() => captured.sidebar![handler](event));
    const reader = read.mock.contexts[0] as FileReader;
    await beginAlignment();
    const post = vi.spyOn(LocalWorker.instances[0], 'postMessage');
    Object.defineProperty(reader, 'result', { value: handler === 'onProjectUpload' ? JSON.stringify({ records: [] }) : '>wrong\nATC' });
    await act(async () => reader.onload?.call(reader, new ProgressEvent('load')));
    expect(captured.sidebar!.records).toHaveLength(2); expect(post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Alignment running/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await act(async () => finish({ kind: 'ok', data: 'FINISHED' }));
  });
});

it('reopens consent after revocation without sending a request', async () => {
  await loadApp();
  const alignCard = screen.getByRole('button', { name: /Align Sequences/ });
  expect(alignCard.getAttribute('data-tip')).toBe("Send the loaded sequences to EMBL-EBI's servers for alignment, then overlay the result");
  fireEvent.click(alignCard);
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  fireEvent.click(screen.getByRole('button', { name: 'Review' }));
  fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  fireEvent.click(alignCard);
  expect(screen.getByRole('dialog', { name: 'Your sequences will leave this browser' })).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement).disabled).toBe(true);
  expect(captured.client!.submit).not.toHaveBeenCalled();
});

it('places a dedicated Alignment section immediately above Sequence Search, outside Ingestion', async () => {
  await loadApp();
  const alignment = screen.getByRole('region', { name: 'Alignment' });
  const search = screen.getByRole('heading', { name: 'Sequence Search' }).closest('section');
  const ingestion = screen.getByRole('heading', { name: 'Ingestion' }).closest('section')!;
  expect(search?.previousElementSibling).toBe(alignment);
  expect(within(alignment).getByRole('heading', { name: 'Alignment' })).toBeTruthy();
  expect(within(alignment).getByRole('button', { name: 'Align Sequences' })).toBeTruthy();
  expect(within(ingestion).queryByRole('button', { name: 'Align Sequences' })).toBeNull();
  expect(screen.getAllByRole('button', { name: 'Align Sequences' })).toHaveLength(1);
});

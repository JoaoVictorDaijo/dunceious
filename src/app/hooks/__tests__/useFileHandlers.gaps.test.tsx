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
import { afterEach, beforeEach, it, expect, vi } from 'vitest';
import { act, renderHook } from '@/src/app/testing/renderHarness';
import { useBioWorker } from '../useBioWorker';
import { useFileHandlers } from '../useFileHandlers';
import { handleBioMessage } from '@/src/workers/handlers/bio';
import { createDeferredWorker } from '@/src/app/testing/deferredWorker';
import { DEFAULT_ALIGNMENT_COMPARISON } from '@/src/app/logic/alignmentComparison';
import type { ChangeEvent } from 'react';

const Worker = createDeferredWorker(handleBioMessage);
beforeEach(() => { Worker.instances = []; vi.stubGlobal('Worker', Worker); });
afterEach(() => vi.unstubAllGlobals());
const event = (names: string[]) => ({ target: { files: names.map(name => new File([], name)), value: '' } }) as unknown as ChangeEvent<HTMLInputElement>;
function setup() {
  let revision = 0;
  const reads = new Map<string, (text: string) => void>();
  const readText = (file: File) => new Promise<string>(resolve => reads.set(file.name, resolve));
  const log = vi.fn();
  const hook = renderHook(() => {
    const bio = useBioWorker(log, { getWorkspaceRevision: () => revision, onMismatch: error => files.showMismatchModal(error) });
    const files = useFileHandlers(bio.bioWorkerRef, bio.records, null, {},
      { showAnnotations: true, showTranslation: false, showConservation: false, alignmentComparison: DEFAULT_ALIGNMENT_COMPARISON },
      { setRecords: bio.setRecords, setIsProcessing: bio.setIsProcessing, setFeatureColors: vi.fn(), setActiveSelection: vi.fn(),
        setShowAnnotations: vi.fn(), setShowTranslation: vi.fn(), setShowConservation: vi.fn(), setAlignmentComparison: vi.fn() }, log, () => false,
      { requestBio: bio.requestBio, getRecords: bio.getRecords, getWorkspaceRevision: () => revision, readText });
    return { bio, files };
  });
  return { ...hook, reads, log, worker: Worker.instances.at(-1)!, replace: () => { revision++; } };
}
it.each(['before read', 'before response'] as const)('discards a stale alignment %s on empty and matching replacement workspaces', async timing => {
  for (const matching of [false, true]) {
    const h = setup();
    act(() => h.result.current.files.handleAlignmentUpload(event(['aligned.fa'])));
    if (timing === 'before read') {
      h.replace();
      act(() => h.result.current.bio.setRecords(matching ? [{ id: 'a', name: 'a', sequence: 'ACGT', features: [] }] : []));
    }
    await act(async () => h.reads.get('aligned.fa')!('>a\nAC--GT'));
    if (timing === 'before response') {
      h.replace();
      act(() => h.result.current.bio.setRecords(matching ? [{ id: 'a', name: 'a', sequence: 'ACGT', features: [] }] : []));
      act(() => h.worker.release(0));
    }
    expect(h.result.current.bio.records.every(row => row.alignedSequence === undefined)).toBe(true);
    expect(h.log).toHaveBeenCalledWith('aligned.fa was not loaded: the workspace was replaced');
    h.unmount();
  }
});
it('does not queue a slow gapped picker response or read after workspace replacement', async () => {
  const h = setup();
  act(() => h.result.current.files.handleFileUpload(event(['fast.fa', 'response.fa', 'read.fa'])));
  await act(async () => { h.reads.get('fast.fa')!('>fast\nACGT'); h.reads.get('response.fa')!('>old\nAC--GT'); });
  act(() => h.worker.release(0));
  h.replace();
  act(() => h.result.current.bio.setRecords([]));
  act(() => h.worker.release(1));
  await act(async () => h.reads.get('read.fa')!('>old2\nAC--GT'));
  expect(h.result.current.bio.pendingConfirmations).toEqual([]);
  expect(h.result.current.bio.records).toEqual([]);
  expect(h.log).toHaveBeenCalledWith('response.fa was not loaded: the workspace was replaced');
  expect(h.log).toHaveBeenCalledWith('read.fa was not loaded: the workspace was replaced');
});
it('sends every GenBank picker file to the worker and settles its category at commit', async () => {
  const h = setup();
  act(() => h.result.current.files.handleFileUpload(event(['protein.fa', 'dna.gb'])));
  await act(async () => h.reads.get('protein.fa')!('>p\nMEFW--'));
  act(() => h.worker.release(0));
  act(() => h.result.current.bio.confirmGapRemoval(1, true));
  await act(async () => h.reads.get('dna.gb')!('LOCUS       a 4 bp DNA linear\nORIGIN\n        1 acgt\n//'));
  const index = h.worker.requests.findIndex(r => r.type === 'PARSE_GENBANK');
  expect(index).toBeGreaterThanOrEqual(0);
  act(() => h.worker.release(index));
  expect(h.result.current.bio.records.map(r => r.id)).toEqual(['p']);
  expect(h.result.current.files.moleculeTypeMismatch).toEqual({ incoming: 'nucleotide', loaded: 'protein', fileName: 'dna.gb' });
});
it('keeps both gap-free picker files in the same workspace', async () => {
  const h = setup();
  act(() => h.result.current.files.handleFileUpload(event(['a.fa', 'b.fa'])));
  await act(async () => { h.reads.get('a.fa')!('>a\nACGT'); h.reads.get('b.fa')!('>b\nACTTGT'); });
  act(() => { h.worker.release(0); h.worker.release(1); });
  expect(h.result.current.bio.records.map(r => r.sequence)).toEqual(['ACGT', 'ACTTGT']);
  expect(h.result.current.bio.pendingConfirmations).toEqual([]);
});

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
import { it, expect, vi, afterEach } from 'vitest';
import { act, renderHook } from '@/src/app/testing/renderHarness';
import { useHubState } from '../useHubState';
import { useBioWorker } from '../useBioWorker';
import { DEFAULT_ALIGNMENT_COMPARISON } from '@/src/app/logic/alignmentComparison';
import { useFileHandlers } from '../useFileHandlers';
import { handleBioMessage } from '@/src/workers/handlers/bio';
import type { BioWorkerRequest, BioWorkerResponse } from '@/src/workers/protocol';

class LocalWorker {
  static instance: LocalWorker;
  onmessage: ((event: { data: BioWorkerResponse }) => void) | null = null;
  requests: BioWorkerRequest[] = [];
  constructor() { LocalWorker.instance = this; }
  postMessage(request: BioWorkerRequest) { this.requests.push(request); }
  respond(request: BioWorkerRequest) { this.onmessage?.({ data: handleBioMessage(request) }); }
  terminate() {}
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function setup(readText: (file: File) => Promise<string>, locked = () => false) {
  vi.stubGlobal('Worker', LocalWorker);
  const log = vi.fn();
  const hook = renderHook(() => {
    const bio = useBioWorker(log);
    const hub = useHubState();
    const handlers = useFileHandlers(bio.bioWorkerRef, bio.records, null, {},
      { showAnnotations: true, showTranslation: false, showConservation: false, alignmentComparison: DEFAULT_ALIGNMENT_COMPARISON },
      { onWorkspaceReplaced: hub.resetWorkspace, setRecords: bio.setRecords, setIsProcessing: bio.setIsProcessing, setFeatureColors: vi.fn(), setActiveSelection: vi.fn(),
        setShowAnnotations: vi.fn(), setShowTranslation: vi.fn(), setShowConservation: vi.fn(), setAlignmentComparison: vi.fn() }, log, locked,
      { requestBio: bio.requestBio, getRecords: bio.getRecords, getWorkspaceRevision: () => hub.workspaceRevision.current, readText });
    return { bio, handlers, hub };
  });
  return { ...hook, log };
}

it('waits for acknowledged worker commits and never treats a drop as an overlay', async () => {
  const { result } = setup(async file => file.name.endsWith('.fa') ? '>contig1\nACGT' : 'contig1\ts\tgene\t2\t3\t.\t+\t.\tID=g');
  let done!: Promise<void>;
  await act(async () => { done = result.current.handlers.handleDroppedFiles([new File([], 'contig.gff3'), new File([], 'contig.fa')]); });
  const worker = LocalWorker.instance;
  expect(worker.requests.map(r => r.type)).toEqual(['PARSE_FASTA']);
  expect(worker.requests[0]).toMatchObject({ filename: 'contig.fa', asAlignment: false });
  await act(async () => { worker.respond(worker.requests[0]); });
  const annotation = worker.requests.find(r => r.type === 'PARSE_ANNOTATIONS');
  expect(annotation).toMatchObject({ idMap: { contig1: 'contig1' } });
  expect(result.current.bio.records[0]).toMatchObject({ importedFrom: 'contig.fa', sequence: 'ACGT' });
  await act(async () => { worker.respond(annotation!); await done; });
  expect(result.current.bio.records[0].features).toMatchObject([{ start: 1, end: 3 }]);
});

it('does no reads or dispatches while alignment is locked', async () => {
  const readText = vi.fn(async () => '>a\nACGT');
  const { result } = setup(readText, () => true);
  await act(async () => { await result.current.handlers.handleDroppedFiles([new File([], 'a.fa')]); });
  expect(readText).not.toHaveBeenCalled();
  expect(LocalWorker.instance.requests).toEqual([]);
});

it('requires confirmation before reading a dropped project', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  const readText = vi.fn(async () => '{}');
  const { result } = setup(readText);
  await act(async () => { await result.current.handlers.handleDroppedFiles([new File([], 'workspace.json')]); });
  expect(window.confirm).toHaveBeenCalledOnce();
  expect(readText).not.toHaveBeenCalled();
});

it('settles a failed read with a filename-specific log', async () => {
  const { result, log } = setup(async () => { throw new Error('read failed'); });
  await act(async () => { await result.current.handlers.handleDroppedFiles([new File([], 'a.fa')]); });
  expect(log).toHaveBeenCalledWith(expect.stringContaining('a.fa'));
  expect(result.current.bio.isProcessing).toBe(false);
  expect(LocalWorker.instance.requests).toEqual([]);
});


it('blocks dispatch if the alignment lock appears while reading', async () => {
  let locked = false;
  let finishRead!: (text: string) => void;
  const text = new Promise<string>(resolve => { finishRead = resolve; });
  const { result, log } = setup(() => text, () => locked);
  let pending!: Promise<void>;
  await act(async () => { pending = result.current.handlers.handleDroppedFiles([new File([], 'a.fa')]); });
  locked = true;
  await act(async () => { finishRead('>a\nACGT'); await pending; });
  expect(LocalWorker.instance.requests).toEqual([]);
  expect(log).toHaveBeenCalledWith('Import stopped: alignment is locked.');
  expect(result.current.bio.isProcessing).toBe(false);
});

it('rejects a mixed molecule batch before dispatching its second sequence', async () => {
  const { result, log } = setup(async file => file.name === 'dna.fa' ? '>a\nACGT' : '>b\nMEFW');
  let pending!: Promise<void>;
  await act(async () => { pending = result.current.handlers.handleDroppedFiles([new File([], 'dna.fa'), new File([], 'protein.fa')]); });
  await act(async () => { LocalWorker.instance.respond(LocalWorker.instance.requests[0]); await pending; });
  expect(LocalWorker.instance.requests.filter(r => r.type === 'PARSE_FASTA')).toHaveLength(1);
  expect(result.current.bio.records.map(r => r.id)).toEqual(['a']);
  expect(result.current.handlers.moleculeTypeMismatch).toEqual({ incoming: 'protein', loaded: 'nucleotide', fileName: 'protein.fa' });
  expect(log).toHaveBeenCalledWith('Cannot load "protein.fa": molecule type differs from the session.');
});

it('rejects a worker error and stops the batch before annotations', async () => {
  const { result, log } = setup(async () => '>a\nACGT');
  let pending!: Promise<void>;
  await act(async () => { pending = result.current.handlers.handleDroppedFiles([new File([], 'a.fa'), new File([], 'a.gff')]); });
  const worker = LocalWorker.instance;
  await act(async () => { worker.onmessage?.({ data: { type: 'ERROR', requestId: worker.requests[0].requestId, error: 'parse failed' } }); await pending; });
  expect(worker.requests.map(r => r.type)).toEqual(['PARSE_FASTA']);
  expect(result.current.bio.records).toEqual([]);
  expect(log).toHaveBeenCalledWith('parse failed');
  expect(result.current.bio.isProcessing).toBe(false);
});


it('uses the current workspace category after a delayed read', async () => {
  let finishRead!: (text: string) => void;
  const text = new Promise<string>(resolve => { finishRead = resolve; });
  const { result } = setup(() => text);
  let pending!: Promise<void>;
  await act(async () => { pending = result.current.handlers.handleDroppedFiles([new File([], 'dna.fa')]); });
  act(() => { result.current.bio.setRecords([{ id: 'protein', name: 'protein', sequence: 'MEFW', moleculeType: 'protein', features: [] }]); });
  await act(async () => { finishRead('>dna\nACGT'); });
  expect(LocalWorker.instance.requests.filter(r => r.type === 'PARSE_FASTA')).toEqual([]);
  await pending;
  expect(result.current.handlers.moleculeTypeMismatch).toEqual({ incoming: 'nucleotide', loaded: 'protein', fileName: 'dna.fa' });
});

it('checks queued drops against the preceding synchronous import commit', async () => {
  const { result } = setup(async file => file.name === 'dna.fa' ? '>dna\nACGT' : '>protein\nMEFW');
  let first!: Promise<void>;
  let second!: Promise<void>;
  await act(async () => {
    first = result.current.handlers.handleDroppedFiles([new File([], 'dna.fa')]);
    second = result.current.handlers.handleDroppedFiles([new File([], 'protein.fa')]);
  });
  await act(async () => { LocalWorker.instance.respond(LocalWorker.instance.requests[0]); await first; });
  expect(LocalWorker.instance.requests.filter(r => r.type === 'PARSE_FASTA')).toHaveLength(1);
  await second;
  expect(result.current.bio.records.map(r => r.id)).toEqual(['dna']);
});

it('checks a sequence queued after project replacement against the new workspace', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  const project = JSON.stringify({ format: 2, records: [{ id: 'protein', name: 'protein', sequence: 'MEFW', moleculeType: 'protein', features: [] }],
    featureColors: {}, showAnnotations: true, showTranslation: false, showConservation: false });
  const { result } = setup(async file => file.name.endsWith('.json') ? project : '>dna\nACGT');
  let first!: Promise<void>;
  let second!: Promise<void>;
  await act(async () => {
    first = result.current.handlers.handleDroppedFiles([new File([], 'workspace.json')]);
    second = result.current.handlers.handleDroppedFiles([new File([], 'dna.fa')]);
    await first;
  });
  expect(LocalWorker.instance.requests.filter(r => r.type === 'PARSE_FASTA')).toEqual([]);
  await second;
  expect(result.current.bio.records.map(r => r.id)).toEqual(['protein']);
});


it.each(['clear', 'project'])('stops a batch after %s replaces the workspace during a delayed read', async route => {
  let finish!: (text: string) => void;
  const slow = new Promise<string>(resolve => { finish = resolve; });
  const project = JSON.stringify({ format: 2, records: [], featureColors: {}, showAnnotations: true, showTranslation: false, showConservation: false });
  const { result, log } = setup(file => file.name === 'new.json' ? Promise.resolve(project) : file.name === 'slow.fa' ? slow : Promise.resolve('>later\nACGT'));
  let pending!: Promise<void>;
  await act(async () => { pending = result.current.handlers.handleDroppedFiles([new File([], 'slow.fa'), new File([], 'later.fa'), new File([], 'later.gff3')]); });
  await act(async () => {
    if (route === 'clear') { result.current.hub.resetWorkspace(); result.current.bio.setRecords([]); }
    else result.current.handlers.handleProjectUpload({ target: { files: [new File([], 'new.json')], value: '' } } as unknown as React.ChangeEvent<HTMLInputElement>);
  });
  await act(async () => { finish('>old\nACGT'); });
  expect(LocalWorker.instance.requests).toEqual([]);
  await pending;
  expect(log).toHaveBeenCalledWith('Drop cancelled: the workspace was replaced');
  expect(result.current.bio.records).toEqual([]);
});

it('does not dispatch annotations after workspace replacement while awaiting a sequence worker', async () => {
  const { result, log } = setup(async file => file.name.endsWith('.fa') ? '>a\nACGT' : 'a\ts\tgene\t1\t2\t.\t+\t.\tID=g');
  let pending!: Promise<void>;
  await act(async () => { pending = result.current.handlers.handleDroppedFiles([new File([], 'a.fa'), new File([], 'a.gff3')]); });
  act(() => { result.current.hub.resetWorkspace(); result.current.bio.setRecords([]); });
  await act(async () => { LocalWorker.instance.respond(LocalWorker.instance.requests[0]); });
  expect(LocalWorker.instance.requests.map(request => request.type)).toEqual(['PARSE_FASTA']);
  expect(result.current.bio.records).toEqual([]);
  await pending;
  expect(log).toHaveBeenCalledWith('Drop cancelled: the workspace was replaced');
});

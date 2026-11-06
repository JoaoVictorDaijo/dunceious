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
    const hub = useHubState();
    const bio = useBioWorker(log, { getWorkspaceRevision: () => hub.workspaceRevision.current, isAlignmentLocked: locked, onMismatch: error => handlers.showMismatchModal(error) });
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
  await act(async () => { finishRead('>a\nACGT'); });
  await act(async () => { LocalWorker.instance.respond(LocalWorker.instance.requests[0]); await pending; });
  expect(result.current.bio.records).toEqual([]);
  expect(log).toHaveBeenCalledWith('a.fa was not loaded: the workspace is locked');
  expect(result.current.bio.isProcessing).toBe(false);
});

it('refuses a mixed molecule file at commit time and continues', async () => {
  const { result, log } = setup(async file => file.name === 'dna.fa' ? '>a\nACGT' : '>b\nMEFW');
  let pending!: Promise<void>;
  await act(async () => { pending = result.current.handlers.handleDroppedFiles([new File([], 'dna.fa'), new File([], 'protein.fa')]); });
  await act(async () => { LocalWorker.instance.respond(LocalWorker.instance.requests[0]); });
  await act(async () => { LocalWorker.instance.respond(LocalWorker.instance.requests.find(r => r.type === 'PARSE_FASTA' && r.filename === 'protein.fa')!); await pending; });
  expect(LocalWorker.instance.requests.filter(r => r.type === 'PARSE_FASTA')).toHaveLength(2);
  expect(result.current.bio.records.map(r => r.id)).toEqual(['a']);
  expect(result.current.handlers.moleculeTypeMismatch).toEqual({ incoming: 'protein', loaded: 'nucleotide', fileName: 'protein.fa' });
  expect(log).toHaveBeenCalledWith('protein.fa was not loaded: the session now holds nucleotide sequences');
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
  await act(async () => { LocalWorker.instance.respond(LocalWorker.instance.requests.find(r => r.type === 'PARSE_FASTA')!); await pending; });
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
  expect(LocalWorker.instance.requests.filter(r => r.type === 'PARSE_FASTA')).toHaveLength(2);
  await act(async () => { LocalWorker.instance.respond(LocalWorker.instance.requests.find(r => r.type === 'PARSE_FASTA' && r.filename === 'protein.fa')!); await second; });
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
  await act(async () => { LocalWorker.instance.respond(LocalWorker.instance.requests.find(r => r.type === 'PARSE_FASTA')!); await second; });
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
  expect(log).toHaveBeenCalledWith('the workspace was replaced');
});

it.each([['decline', false], ['decline', true], ['category', false], ['category', true]] as const)('continues after %s with null ownership, accepted duplicate=%s', async (refusal, duplicate) => {
  const { result, log } = setup(async file => file.name === 'a.fa' ? (refusal === 'decline' ? '>a\nAC--GT' : '>a\nMEFW')
    : file.name === 'b.fa' ? (duplicate ? '>a\nACGT\n>b\nACTTGT' : '>b\nACTTGT') : 'a\ts\tgene\t1\t2\t.\t+\t.\tID=wrong\nb\ts\tgene\t2\t3\t.\t+\t.\tID=right');
  act(() => result.current.bio.setRecords([{ id: 'a', name: 'a', sequence: 'ACGT', features: [] }]));
  let done!: Promise<void>;
  await act(async () => { done = result.current.handlers.handleDroppedFiles([new File([], 'a.fa'), new File([], 'b.fa'), new File([], 'genes.gff3')]); });
  const worker = LocalWorker.instance;
  await act(async () => worker.respond(worker.requests.find(r => r.type === 'PARSE_FASTA' && r.filename === 'a.fa')!));
  if (refusal === 'decline') await act(async () => result.current.bio.confirmGapRemoval(1, false));
  await act(async () => worker.respond(worker.requests.find(r => r.type === 'PARSE_FASTA' && r.filename === 'b.fa')!));
  const annotation = worker.requests.find(r => r.type === 'PARSE_ANNOTATIONS')!;
  expect(annotation).toMatchObject({ idMap: { a: null, b: 'b' } });
  await act(async () => { worker.respond(annotation); await done; });
  expect(result.current.bio.records.map(r => [r.id, r.features.map(f => f.name)])).toEqual(duplicate ? [['a', []], ['a_1', []], ['b', ['right']]] : [['a', []], ['b', ['right']]]);
  expect(log).toHaveBeenCalledWith('WARNING: Some IDs in file did not match active records: [a]');
});

it.each(['protein', 'nucleotide'] as const)('settles dropped protein GenBank against a %s workspace', async category => {
  const { result, log } = setup(async () => 'LOCUS       p 4 aa linear\nORIGIN\n        1 MEFW\n//');
  act(() => result.current.bio.setRecords([{ id: 'existing', name: 'existing', sequence: category === 'protein' ? 'MEFW' : 'ACGT',
    moleculeType: category === 'protein' ? 'protein' : 'dna', features: [] }]));
  let done!: Promise<void>;
  await act(async () => { done = result.current.handlers.handleDroppedFiles([new File([], 'protein.gb')]); });
  const worker = LocalWorker.instance;
  const request = worker.requests.find(request => request.type === 'PARSE_GENBANK')!;
  await act(async () => { worker.respond(request); await done; });
  expect(request).toMatchObject({ incomingCategory: undefined });
  expect(result.current.bio.records.map(record => [record.id, record.sequence])).toEqual(category === 'protein'
    ? [['existing', 'MEFW'], ['p', 'MEFW']] : [['existing', 'ACGT']]);
  expect(result.current.handlers.moleculeTypeMismatch).toBeNull();
  expect(result.current.bio.genBankRefusals).toEqual(category === 'protein' ? [] : [expect.objectContaining({ filename: 'protein.gb', findings: [expect.objectContaining({ code: 'category-mismatch' })] })]);
  if (category === 'nucleotide') expect(log).toHaveBeenCalledWith(expect.stringContaining('protein.gb not opened: 1 problems in 1 records (category-mismatch)'));
});

it('refuses a dropped annotation whose read completes after processing clears and alignment locks', async () => {
  let locked = false;
  let finish!: (text: string) => void;
  const text = new Promise<string>(resolve => { finish = resolve; });
  const { result, log } = setup(() => text, () => locked);
  act(() => result.current.bio.setRecords([{ id: 'a', name: 'a', sequence: 'ACGT', features: [] }]));
  let done!: Promise<void>;
  await act(async () => { done = result.current.handlers.handleDroppedFiles([new File([], 'a.gff3')]); });
  const worker = LocalWorker.instance;
  act(() => worker.respond(worker.requests.find(request => request.type === 'PROCESS_RECORDS')!));
  expect(result.current.bio.isProcessing).toBe(false);
  locked = true;
  await act(async () => finish('a\ts\tgene\t1\t2\t.\t+\t.\tID=forbidden'));
  const annotation = worker.requests.find(request => request.type === 'PARSE_ANNOTATIONS');
  await act(async () => { if (annotation) worker.respond(annotation); await done; });
  expect(annotation).toBeUndefined();
  expect(result.current.bio.records[0].features).toEqual([]);
  expect(log).toHaveBeenCalledWith('a.gff3 was not loaded: the workspace is locked');
});

it('handles an annotation response arriving after alignment locks without committing it', async () => {
  let locked = false;
  const { result, log } = setup(async () => 'a\ts\tgene\t1\t2\t.\t+\t.\tID=forbidden', () => locked);
  act(() => result.current.bio.setRecords([{ id: 'a', name: 'a', sequence: 'ACGT', features: [] }]));
  let done!: Promise<void>;
  await act(async () => { done = result.current.handlers.handleDroppedFiles([new File([], 'a.gff3')]); });
  const worker = LocalWorker.instance;
  const annotation = worker.requests.find(request => request.type === 'PARSE_ANNOTATIONS')!;
  expect(annotation).toMatchObject({ filename: 'a.gff3' });
  locked = true;
  await act(async () => { worker.respond(annotation); await done; });
  expect(result.current.bio.records[0].features).toEqual([]);
  expect(log).toHaveBeenCalledWith('Annotations were not loaded: the workspace is locked');
  expect(log).not.toHaveBeenCalledWith(expect.stringContaining('Annotation import complete:'));
});

it('refuses a picker annotation read completed after alignment locks', async () => {
  let locked = false;
  let finish!: (text: string) => void;
  const text = new Promise<string>(resolve => { finish = resolve; });
  const { result, log } = setup(() => text, () => locked);
  act(() => result.current.bio.setRecords([{ id: 'a', name: 'a', sequence: 'ACGT', features: [] }]));
  act(() => result.current.handlers.handleAnnotationUpload({ target: { files: [new File([], 'picker.gff3')], value: '' } } as unknown as React.ChangeEvent<HTMLInputElement>));
  locked = true;
  await act(async () => finish('a\ts\tgene\t1\t2\t.\t+\t.\tID=forbidden'));
  expect(LocalWorker.instance.requests.filter(request => request.type === 'PARSE_ANNOTATIONS')).toEqual([]);
  expect(result.current.bio.records[0].features).toEqual([]);
  expect(log).toHaveBeenCalledWith('picker.gff3 was not loaded: the workspace is locked');
});

it.each([
  ['validation', ['bad.gb', 'good.gb'], false],
  ['validation', ['good.gb', 'bad.gb'], false],
  ['validation', ['bad.gb', 'good.gb'], true],
  ['validation', ['good.gb', 'bad.gb'], true],
  ['category', ['bad.gb', 'good.gb'], false],
] as const)('continues a GenBank %s refusal in order %j, duplicate=%s, without attaching refused aliases', async (kind, order, duplicate) => {
  const bad = `LOCUS foo;bar 4 ${kind === 'category' ? 'aa' : 'bp'}\nACCESSION   AB123\nVERSION     AB123.1\nORIGIN\n 1 ${kind === 'category' ? 'MEFW' : 'acg'}\n//`;
  const good = (duplicate ? 'LOCUS foo_bar 4 bp DNA\nORIGIN\n 1 acgt\n//\n' : '') + 'LOCUS B 4 bp DNA\nORIGIN\n 1 acgt\n//';
  const annotations = ['foo;bar', 'foo_bar', 'AB123', 'AB123.1'].map(id => `${id}\ts\tgene\t1\t2\t.\t+\t.\tName=wrong`).join('\n') + '\nB\ts\tgene\t2\t3\t.\t+\t.\tName=right';
  const { result, log } = setup(async file => file.name === 'bad.gb' ? bad : file.name === 'good.gb' ? good : annotations);
  act(() => result.current.bio.setRecords([{ id: 'foo_bar', name: 'existing', accession: 'AB123', version: 'AB123.1', sequence: 'ACGT', features: [] }]));
  let done!: Promise<void>;
  await act(async () => { done = result.current.handlers.handleDroppedFiles([...order.map(name => new File([], name)), new File([], 'annotations.gff3')]); });
  const worker = LocalWorker.instance;
  for (const filename of order) await act(async () => worker.respond(worker.requests.find(r => r.type === 'PARSE_GENBANK' && r.filename === filename)!));
  const annotation = worker.requests.find(r => r.type === 'PARSE_ANNOTATIONS')!;
  expect(annotation).toMatchObject({ idMap: { 'foo;bar': null, foo_bar: null, AB123: null, 'AB123.1': null, B: 'B' } });
  await act(async () => { worker.respond(annotation); await done; });
  expect(result.current.bio.records.map(r => [r.id, r.features.map(f => f.name)])).toEqual(duplicate ? [['foo_bar', []], ['foo_bar_1', []], ['B', ['right']]] : [['foo_bar', []], ['B', ['right']]]);
  expect(result.current.bio.genBankRefusals[0].findings.map(f => f.code)).toContain(kind === 'category' ? 'category-mismatch' : 'length-mismatch');
  expect(result.current.handlers.moleculeTypeMismatch).toBeNull();
  expect(log).toHaveBeenCalledWith(expect.stringContaining('did not match active records: [foo;bar, foo_bar, AB123, AB123.1]'));
});

it('rejects a stale refused GenBank response and stops the drop without diagnostics', async () => {
  const { result, log } = setup(async file => file.name === 'bad.gb' ? 'LOCUS A 4 bp DNA\nORIGIN\n 1 acg\n//' : 'LOCUS B 4 bp DNA\nORIGIN\n 1 acgt\n//');
  let done!: Promise<void>;
  await act(async () => { done = result.current.handlers.handleDroppedFiles([new File([], 'bad.gb'), new File([], 'later.gb')]); });
  act(() => result.current.hub.resetWorkspace());
  await act(async () => { LocalWorker.instance.respond(LocalWorker.instance.requests[0]); await done; });
  expect(LocalWorker.instance.requests.map(r => r.type)).toEqual(['PARSE_GENBANK']);
  expect(result.current.bio.records).toEqual([]);
  expect(result.current.bio.genBankRefusals).toEqual([]);
  expect(log.mock.calls.filter(([message]) => message === 'bad.gb was not loaded: the workspace was replaced')).toHaveLength(1);
});

it('lets the parser decide the category of a picker file named AA from its bp unit', async () => {
  const { result } = setup(async () => 'LOCUS AA 4 bp DNA\nORIGIN\n 1 acgt\n//');
  act(() => result.current.bio.setRecords([{ id: 'existing', name: 'existing', sequence: 'ACGT', features: [] }]));
  await act(async () => result.current.handlers.handleFileUpload({ target: { files: [new File([], 'AA.gb')], value: '' } } as unknown as React.ChangeEvent<HTMLInputElement>));
  const worker = LocalWorker.instance;
  const request = worker.requests.find(r => r.type === 'PARSE_GENBANK')!;
  expect(request).toMatchObject({ filename: 'AA.gb' });
  expect(request.incomingCategory).toBeUndefined();
  await act(async () => worker.respond(request));
  expect(result.current.bio.records.map(r => r.id)).toEqual(['existing', 'AA']);
  expect(result.current.bio.genBankRefusals).toEqual([]);
});

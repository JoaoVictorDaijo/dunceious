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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@/src/app/testing/renderHarness';
import { createDeferredWorker } from '@/src/app/testing/deferredWorker';
import { handleBioMessage } from '@/src/workers/handlers/bio';
import type { SeqRecord } from '@/src/domain/bio/types';
import { useBioWorker } from '../useBioWorker';

const DeferredWorker = createDeferredWorker(handleBioMessage);
const original: SeqRecord = { id: 'original', name: 'original', sequence: 'AAAA', alignedSequence: 'AAAA', features: [] };
const replacement: SeqRecord = { id: 'replacement', name: 'replacement', sequence: 'CCCC', alignedSequence: 'CCCC', features: [] };

beforeEach(() => {
  DeferredWorker.instances = [];
  vi.stubGlobal('Worker', DeferredWorker);
});
afterEach(() => vi.unstubAllGlobals());

function setup() {
  const log = vi.fn();
  const hook = renderHook(() => useBioWorker(log));
  const worker = DeferredWorker.instances.at(-1)!;
  act(() => hook.result.current.setRecords([original]));
  return { ...hook, worker, log };
}

describe('deferred bio processing', () => {
  it.each(['clear', 'hide all'] as const)('keeps display and consensus empty after %s with processing in flight', action => {
    const h = setup();
    act(() => h.worker.release(0));
    expect(h.result.current.transposedRecords.map(r => r.id)).toEqual(['original']);
    expect(h.result.current.consensus).toBe('AAAA');
    act(() => h.result.current.setRecords([{ ...original, sequence: 'GGGG', alignedSequence: 'GGGG' }]));
    act(() => h.result.current.setRecords(action === 'clear' ? [] : [{ ...original, visible: false }]));
    expect(h.result.current.transposedRecords).toEqual([]);
    expect(h.result.current.consensus).toBe('');
    expect(h.result.current.isProcessing).toBe(false);
    const logCount = h.log.mock.calls.length;
    act(() => h.worker.release(1));
    expect(h.result.current.transposedRecords).toEqual([]);
    expect(h.result.current.consensus).toBe('');
    expect(h.result.current.isProcessing).toBe(false);
    expect(h.log).toHaveBeenCalledTimes(logCount);
  });

  it('keeps the newer processing result when replies arrive out of order after a record edit', () => {
    const h = setup();
    act(() => h.result.current.setRecords([{ ...original, sequence: 'CCCC', alignedSequence: 'CCCC' }]));
    act(() => h.worker.release(1));
    expect(h.result.current.transposedRecords[0].sequence).toBe('CCCC');
    expect(h.result.current.consensus).toBe('CCCC');
    const logCount = h.log.mock.calls.length;
    act(() => h.worker.release(0));
    expect(h.result.current.transposedRecords[0].sequence).toBe('CCCC');
    expect(h.result.current.consensus).toBe('CCCC');
    expect(h.log).toHaveBeenCalledTimes(logCount);
  });

  it('ignores the old workspace while replacement processing is pending', () => {
    const h = setup();
    act(() => h.result.current.setRecords([replacement]));
    const logCount = h.log.mock.calls.length;
    act(() => h.worker.release(0));
    expect(h.result.current.transposedRecords).toEqual([]);
    expect(h.result.current.consensus).toBe('');
    expect(h.result.current.isProcessing).toBe(true);
    expect(h.log).toHaveBeenCalledTimes(logCount);
    act(() => h.worker.release(1));
    expect(h.result.current.transposedRecords.map(r => r.id)).toEqual(['replacement']);
    expect(h.result.current.consensus).toBe('CCCC');
    expect(h.result.current.isProcessing).toBe(false);
  });
});

describe('deferred bio processing across record identity and teardown', () => {
  it('invalidates processing immediately when records change before effects run', () => {
    const h = setup();
    const logCount = h.log.mock.calls.length;
    act(() => {
      h.result.current.setRecords([replacement]);
      h.worker.release(0);
    });
    expect(h.result.current.transposedRecords).toEqual([]);
    expect(h.result.current.consensus).toBe('');
    expect(h.log).toHaveBeenCalledTimes(logCount);
  });

  it('does not revive old processing when the previous record array is restored', () => {
    const h = setup();
    const previous = h.result.current.records;
    act(() => h.result.current.setRecords([replacement]));
    act(() => h.result.current.setRecords(previous));
    const logCount = h.log.mock.calls.length;
    act(() => h.worker.release(0));
    expect(h.result.current.transposedRecords).toEqual([]);
    expect(h.result.current.consensus).toBe('');
    expect(h.result.current.isProcessing).toBe(true);
    expect(h.log).toHaveBeenCalledTimes(logCount);
    act(() => h.worker.release(2));
    expect(h.result.current.consensus).toBe('AAAA');
  });

  it('ignores a stale processing error while a newer request is pending', () => {
    const h = setup();
    act(() => h.result.current.setRecords([replacement]));
    const logCount = h.log.mock.calls.length;
    act(() => h.worker.release(0, { type: 'ERROR', requestId: h.worker.requests[0].requestId, error: 'old failure' }));
    expect(h.result.current.isProcessing).toBe(true);
    expect(h.log).toHaveBeenCalledTimes(logCount);
    act(() => h.worker.release(1));
    expect(h.result.current.consensus).toBe('CCCC');
  });

  it('terminates on unmount, rejects pending requests and ignores queued callbacks', async () => {
    const h = setup();
    const queuedProcessing = h.worker.queueResponse(0);
    const pending = h.result.current.requestBio({ type: 'PARSE_FASTA', filename: 'new.fa', content: '>new\nCCCC' });
    const rejected = expect(pending).rejects.toThrow('Worker terminated.');
    const queuedParse = h.worker.queueResponse(1);
    const queuedError = h.worker.onerror;
    const logCount = h.log.mock.calls.length;
    h.unmount();
    await rejected;
    expect(h.worker.terminationCount).toBe(1);
    expect(h.result.current.bioWorkerRef.current).toBeNull();
    act(() => {
      queuedProcessing();
      queuedParse();
      queuedError?.({ message: 'late failure' } as ErrorEvent);
    });
    expect(h.log).toHaveBeenCalledTimes(logCount);
    await expect(h.result.current.requestBio({ type: 'PROCESS_RECORDS', records: [] })).rejects.toThrow('unavailable');
  });
});

describe('gap confirmation ownership', () => {
  it('holds a response, commits to current records once, and settles its ID map', async () => {
    const h = setup();
    const promise = h.result.current.requestBio({ type: 'PARSE_FASTA', filename: 'a.fa', content: '>a\nAC..GT' });
    act(() => h.worker.release(1));
    expect(h.result.current.records.map(r => r.id)).toEqual(['original']);
    expect(h.result.current.pendingConfirmations).toEqual([{ token: 1, fileName: 'a.fa', records: [{ id: 'a', removed: 2 }] }]);
    act(() => h.result.current.setRecords(previous => [...previous, replacement]));
    act(() => h.result.current.confirmGapRemoval(1, true));
    act(() => h.result.current.confirmGapRemoval(1, true));
    await expect(promise).resolves.toMatchObject({ idMap: { a: 'a' } });
    expect(h.result.current.records.map(r => [r.id, r.sequence])).toEqual([['original', 'AAAA'], ['replacement', 'CCCC'], ['a', 'ACGT']]);
    expect(h.result.current.pendingConfirmations).toEqual([]);
  });
  it('queues in arrival order and declines every ID without rejecting', async () => {
    const h = setup();
    const first = h.result.current.requestBio({ type: 'PARSE_FASTA', filename: 'a.fa', content: '>a\nAC-GT\n>b\nA--C' });
    const second = h.result.current.requestBio({ type: 'PARSE_FASTA', filename: 'c.fa', content: '>c\nAC-GT' });
    act(() => { h.worker.release(1); h.worker.release(2); });
    expect(h.result.current.pendingConfirmations.map(e => e.fileName)).toEqual(['a.fa', 'c.fa']);
    act(() => h.result.current.confirmGapRemoval(1, false));
    await expect(first).resolves.toMatchObject({ idMap: { a: null, b: null } });
    expect(h.log).toHaveBeenCalledWith('a.fa was not loaded: gap removal declined');
    act(() => h.result.current.confirmGapRemoval(2, false));
    await second;
    expect(h.result.current.records).toEqual([original]);
  });
  it.each(['>a\nACGT\n>b\n---', '>a\nAC-GT\n>b\n'])('settles no-residue refusals as handled', async content => {
    const h = setup();
    const promise = h.result.current.requestBio({ type: 'PARSE_FASTA', filename: 'bad.fa', content });
    act(() => h.worker.release(1));
    await expect(promise).resolves.toMatchObject({ idMap: { a: null, b: null } });
    expect(h.result.current.records).toEqual([original]);
    expect(h.result.current.pendingConfirmations).toEqual([]);
  });
});

  function gated() {
    let revision = 0;
    let locked = false;
    const log = vi.fn();
    const mismatch = vi.fn();
    const hook = renderHook(() => useBioWorker(log, { getWorkspaceRevision: () => revision, isAlignmentLocked: () => locked, onMismatch: mismatch }));
    const worker = DeferredWorker.instances.at(-1)!;
    const send = (content: string, filename = 'file.fa', genbank = false) => {
      const promise = hook.result.current.requestBio({ type: genbank ? 'PARSE_GENBANK' : 'PARSE_FASTA', filename, content, workspaceRevision: revision,
        incomingCategory: content.includes('MEFW') ? 'protein' : 'nucleotide' });
      return { promise, index: worker.requests.length - 1 };
    };
    return { ...hook, worker, send, log, mismatch, replace: () => { revision++; }, lock: () => { locked = true; } };
  }

describe('import commit gates', () => {
  it.each([false, true])('accepts protein FASTA into empty workspace, gaps=%s', async gaps => {
    const h = gated();
    const { promise, index } = h.send(gaps ? '>p\nMEFW--' : '>p\nMEFW');
    act(() => h.worker.release(index));
    if (gaps) act(() => h.result.current.confirmGapRemoval(1, true));
    await expect(promise).resolves.toMatchObject({ idMap: { p: 'p' } });
    expect(h.result.current.records[0].sequence).toBe('MEFW');
  });
  it('accepts a protein GenBank into an empty workspace', async () => {
    const h = gated();
    const { promise, index } = h.send('LOCUS       p 4 aa linear\nORIGIN\n        1 MEFW\n//', 'p.gb', true);
    act(() => h.worker.release(index));
    await expect(promise).resolves.toMatchObject({ idMap: { p: 'p' } });
    expect(h.result.current.records[0].sequence).toBe('MEFW');
  });
  it('refuses a gap-free late response when alignment locks', async () => {
    const h = gated();
    const { promise, index } = h.send('>a\nACGT');
    h.lock();
    act(() => h.worker.release(index));
    await expect(promise).resolves.toMatchObject({ idMap: { a: null } });
    expect(h.result.current.records).toEqual([]);
    expect(h.log).toHaveBeenCalledWith('file.fa was not loaded: the workspace is locked');
  });
  it.each([false, true])('checks the current molecule category on every commit, GenBank=%s', async genbank => {
    const h = gated();
    const protein = h.send('>p\nMEFW--', 'p.fa');
    const dna = h.send(genbank ? 'LOCUS       a 4 bp DNA linear\nORIGIN\n        1 acgt\n//' : '>a\nACGT', 'a.file', genbank);
    act(() => h.worker.release(protein.index));
    act(() => h.worker.release(dna.index));
    await dna.promise;
    act(() => h.result.current.confirmGapRemoval(1, true));
    await expect(protein.promise).resolves.toMatchObject({ idMap: { p: null } });
    expect(h.result.current.records.map(r => r.id)).toEqual(['a']);
    expect(h.mismatch).toHaveBeenCalledWith({ incoming: 'protein', loaded: 'nucleotide', fileName: 'p.fa' });
  });
  it.each([false, true])('refuses the later DNA response after protein confirmation, GenBank=%s', async genbank => {
    const h = gated();
    const protein = h.send('>p\nMEFW--', 'p.fa');
    const dna = h.send(genbank ? 'LOCUS       a 4 bp DNA linear\nORIGIN\n        1 acgt\n//' : '>a\nACGT', 'a.file', genbank);
    act(() => { h.worker.release(protein.index); });
    act(() => h.result.current.confirmGapRemoval(1, true));
    await protein.promise;
    act(() => h.worker.release(dna.index));
    await expect(dna.promise).resolves.toMatchObject({ idMap: { a: null } });
    expect(h.result.current.records.map(r => r.id)).toEqual(['p']);
  });
  it.each(['before response', 'while queued'] as const)('rejects replacement %s and never queues or commits stale records', async timing => {
    const h = gated();
    const { promise, index } = h.send('>a\nAC--GT');
    const rejected = expect(promise).rejects.toThrow('the workspace was replaced');
    if (timing === 'while queued') act(() => h.worker.release(index));
    h.replace();
    if (timing === 'before response') act(() => h.worker.release(index));
    else h.rerender();
    act(() => h.result.current.confirmGapRemoval(1, true));
    await rejected;
    expect(h.result.current.records).toEqual([]);
    expect(h.result.current.pendingConfirmations).toEqual([]);
    expect(h.log).toHaveBeenCalledWith('file.fa was not loaded: the workspace was replaced');
  });
  it('clears and logs queued files on worker failure', async () => {
    const h = gated();
    const a = h.send('>a\nAC-GT', 'a.fa');
    const b = h.send('>b\nAC-GT', 'b.fa');
    const errors = [expect(a.promise).rejects.toThrow('failed'), expect(b.promise).rejects.toThrow('failed')];
    act(() => { h.worker.release(a.index); h.worker.release(b.index); });
    act(() => h.worker.onerror?.({ message: 'failed' } as ErrorEvent));
    await Promise.all(errors);
    expect(h.result.current.pendingConfirmations).toEqual([]);
    expect(h.log).toHaveBeenCalledWith('a.fa was not loaded: failed');
    expect(h.log).toHaveBeenCalledWith('b.fa was not loaded: failed');
    act(() => h.result.current.confirmGapRemoval(1, true));
    expect(h.result.current.records).toEqual([]);
  });
});

it('settles an annotation lock refusal as handled with no annotations or details', async () => {
  const h = gated();
  act(() => h.result.current.setRecords([{ id: 'a', name: 'a', sequence: 'ACGT', features: [] }]));
  const promise = h.result.current.requestBio({ type: 'PARSE_ANNOTATIONS', filename: 'a.gff3',
    content: 'a\ts\tregion\t1\t4\t.\t+\t.\tgbkey=Src;host=human\na\ts\tgene\t1\t2\t.\t+\t.\tID=forbidden', idMap: { a: 'a' } });
  const index = h.worker.requests.length - 1;
  h.lock();
  act(() => h.worker.release(index));
  const response = await promise;
  expect(response).toMatchObject({ type: 'ANNOTATIONS_SUCCESS', idMap: { a: 'a' } });
  if (response === 'stale' || response.type !== 'ANNOTATIONS_SUCCESS') throw new Error('Expected handled annotation refusal');
  expect(response.annotations).toEqual({});
  expect(response.details).toEqual({});
  expect(h.result.current.records).toEqual([{ id: 'a', name: 'a', sequence: 'ACGT', features: [] }]);
  expect(h.log).toHaveBeenCalledWith('Annotations were not loaded: the workspace is locked');
});

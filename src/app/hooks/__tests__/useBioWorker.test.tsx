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

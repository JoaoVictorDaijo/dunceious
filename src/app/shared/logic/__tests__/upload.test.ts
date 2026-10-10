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

import { describe, it, expect, vi } from 'vitest';
import { takeFiles, readFileAsText, postToWorker, dispatchFile } from '../upload';
import type { WorkerUploadDeps } from '../upload';
import type { BioWorkerRequest } from '@/src/workers/protocol';

/** A controllable FileReader stand-in: readAsText is inert; tests fire the events. */
function makeMockReader() {
  return {
    onload: null as null | (() => void),
    onerror: null as null | (() => void),
    onabort: null as null | (() => void),
    result: null as string | null,
    error: null as unknown,
    readAsText: vi.fn(),
  };
}

const dummyFile = (name = 'f.gb') => ({ name }) as unknown as File;

// ---------------------------------------------------------------------------
// takeFiles — #73: snapshot the selection and reset the input so the same file
// can be re-picked (a native <input type=file> fires no change for a repeat value).
// ---------------------------------------------------------------------------

describe('takeFiles', () => {
  it('returns the selected files and resets the input value', () => {
    const f = dummyFile();
    const input = { files: [f], value: 'C:/fakepath/f.gb' };
    expect(takeFiles(input)).toEqual([f]);
    expect(input.value).toBe('');
  });

  it('returns an empty array (and clears value) when nothing is selected', () => {
    const input = { files: null, value: 'stale' };
    expect(takeFiles(input)).toEqual([]);
    expect(input.value).toBe('');
  });
});

// ---------------------------------------------------------------------------
// readFileAsText — #74: a failed/aborted read must REJECT (native FileReader
// signals these via onerror/onabort), so callers can settle their state.
// ---------------------------------------------------------------------------

describe('readFileAsText', () => {
  it('resolves with the text content on load', async () => {
    const reader = makeMockReader();
    const p = readFileAsText(dummyFile(), () => reader);
    reader.result = 'hello world';
    reader.onload!();
    await expect(p).resolves.toBe('hello world');
    expect(reader.readAsText).toHaveBeenCalledOnce();
  });

  it('rejects when the read errors', async () => {
    const reader = makeMockReader();
    const p = readFileAsText(dummyFile(), () => reader);
    reader.error = new Error('disk failure');
    reader.onerror!();
    await expect(p).rejects.toThrow('disk failure');
  });

  it('rejects when the read is aborted', async () => {
    const reader = makeMockReader();
    const p = readFileAsText(dummyFile(), () => reader);
    reader.onabort!();
    await expect(p).rejects.toThrow(/abort/i);
  });
});

// ---------------------------------------------------------------------------
// postToWorker — #74: dispatch only when a worker exists; report absence so the
// caller can settle instead of hanging on a silent no-op.
// ---------------------------------------------------------------------------

describe('postToWorker', () => {
  const request = { type: 'PARSE_GENBANK', content: 'x' } as BioWorkerRequest;

  it('posts and returns true when a worker is present', () => {
    const worker = { postMessage: vi.fn() };
    expect(postToWorker(worker, request)).toBe(true);
    expect(worker.postMessage).toHaveBeenCalledWith(request);
  });

  it('returns false and does nothing when the worker is null', () => {
    expect(postToWorker(null, request)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// dispatchFile — #74: read → build request → post; settle processing on ANY
// failure (read error, or absent worker) so the overlay never hangs.
// ---------------------------------------------------------------------------

describe('dispatchFile', () => {
  const request = { type: 'PARSE_GENBANK', content: 'ATGC' } as BioWorkerRequest;

  function makeDeps(over: Partial<WorkerUploadDeps> = {}): WorkerUploadDeps {
    return {
      readText: vi.fn().mockResolvedValue('ATGC'),
      postToWorker: vi.fn().mockReturnValue(true),
      setProcessing: vi.fn(),
      addLog: vi.fn(),
      ...over,
    };
  }

  it('posts the built request to the worker on a successful read', async () => {
    const deps = makeDeps();
    await dispatchFile(dummyFile(), () => request, deps);
    expect(deps.postToWorker).toHaveBeenCalledWith(request);
    expect(deps.setProcessing).not.toHaveBeenCalled();
  });

  it('settles processing and logs when the read fails (never hangs)', async () => {
    const deps = makeDeps({ readText: vi.fn().mockRejectedValue(new Error('boom')) });
    await dispatchFile(dummyFile(), () => request, deps);
    expect(deps.postToWorker).not.toHaveBeenCalled();
    expect(deps.setProcessing).toHaveBeenCalledWith(false);
    expect(deps.addLog).toHaveBeenCalled();
  });

  it('settles processing and logs when the worker is unavailable', async () => {
    const deps = makeDeps({ postToWorker: vi.fn().mockReturnValue(false) });
    await dispatchFile(dummyFile(), () => request, deps);
    expect(deps.setProcessing).toHaveBeenCalledWith(false);
    expect(deps.addLog).toHaveBeenCalled();
  });

  it('does nothing further when the request builder returns null (caller handled it)', async () => {
    const deps = makeDeps();
    await dispatchFile(dummyFile(), () => null, deps);
    expect(deps.postToWorker).not.toHaveBeenCalled();
    expect(deps.setProcessing).not.toHaveBeenCalled();
  });
});

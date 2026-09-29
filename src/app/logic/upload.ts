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

/**
 * File-upload plumbing extracted from the React handlers so the failure paths
 * are unit-testable: reset the input for re-selection, read a file as text with
 * real error/abort handling, and dispatch to the bio worker while never leaving
 * the processing flag stuck.
 */

import type { BioWorkerRequest } from '@/src/workers/protocol';

export interface FileInputLike {
  files: FileList | File[] | null;
  value: string;
}

export interface WorkerUploadDeps {
  readText: (file: File) => Promise<string>;
  postToWorker: (request: BioWorkerRequest) => boolean;
  setProcessing: (value: boolean) => void;
  addLog: (message: string) => void;
}

/** Minimal FileReader surface, injectable so the read path is testable in node. */
interface TextReaderLike {
  onload: (() => void) | null;
  onerror: (() => void) | null;
  onabort: (() => void) | null;
  result: string | ArrayBuffer | null;
  error?: unknown;
  readAsText(blob: Blob): void;
}

/**
 * Snapshots the currently-selected files and clears the input's value.
 *
 * A native `<input type="file">` fires `change` only when the chosen value
 * differs, so without this reset, re-selecting the same file after a
 * remove/clear is silently ignored. The files are copied out first because
 * clearing `value` also empties `input.files`.
 */
export function takeFiles(input: FileInputLike): File[] {
  const files = input.files ? Array.from(input.files) : [];
  input.value = '';
  return files;
}

/**
 * Reads a file as text. Resolves with the content on load and REJECTS on a
 * failed or aborted read — native `FileReader` reports those via `onerror` /
 * `onabort` and otherwise never calls `onload`, which would strand any
 * processing state the caller set.
 */
export function readFileAsText(
  file: Blob,
  createReader: () => TextReaderLike = () => new FileReader() as unknown as TextReaderLike,
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = createReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(toError(reader.error, 'File read failed'));
    reader.onabort = () => reject(new Error('File read aborted'));
    reader.readAsText(file);
  });
}

/**
 * Posts a request to the bio worker when one exists. Returns `true` when
 * dispatched and `false` when the worker is absent, so callers can settle their
 * processing state rather than hang on a silent no-op.
 */
export function postToWorker(
  worker: { postMessage(request: BioWorkerRequest): void } | null | undefined,
  request: BioWorkerRequest,
): boolean {
  if (!worker) return false;
  worker.postMessage(request);
  return true;
}

/**
 * Reads one file, builds its worker request, and dispatches it. Any failure —
 * an unreadable file or an absent worker — clears the processing flag and logs,
 * so the processing overlay can never get stuck. `buildRequest` returning `null`
 * means the caller already handled the file (e.g. a molecule-type mismatch) and
 * owns its own settling.
 */
export async function dispatchFile(
  file: File,
  buildRequest: (content: string, file: File) => BioWorkerRequest | null,
  deps: WorkerUploadDeps,
): Promise<void> {
  let content: string;
  try {
    content = await deps.readText(file);
  } catch (err) {
    deps.addLog(`Could not read "${file.name}": ${errorMessage(err)}`);
    deps.setProcessing(false);
    return;
  }

  const request = buildRequest(content, file);
  if (request === null) return;

  if (!deps.postToWorker(request)) {
    deps.addLog(`Cannot process "${file.name}": the processing worker is unavailable.`);
    deps.setProcessing(false);
  }
}

function toError(value: unknown, fallback: string): Error {
  return value instanceof Error ? value : new Error(fallback);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

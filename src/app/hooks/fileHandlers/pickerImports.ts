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

import type { BioWorkerRequest } from '@/src/workers/protocol';
import { takeFiles, postToWorker, dispatchFile, type WorkerUploadDeps } from '@/src/app/logic/upload';
import { categoryLabel, previewMismatch } from '@/src/app/logic/sessionPreview';
import type { FileHandlerContext } from './context';

type InputEvent = React.ChangeEvent<HTMLInputElement>;

/**
 * Shared plumbing: read a file, dispatch to the worker, and always settle the processing flag
 * on failure (unreadable file, absent worker) so the ProcessingOverlay can never hang. See logic/upload.ts.
 */
function workerDeps(ctx: FileHandlerContext): WorkerUploadDeps {
  return {
    readText: ctx.readText,
    postToWorker: request => postToWorker(ctx.bioWorkerRef.current, request),
    setProcessing: ctx.setters.setIsProcessing,
    addLog: ctx.addLog,
  };
}

/** Refuses a sampled file of the other category before dispatch; returns true when refused. */
function refusedByPreview(ctx: FileHandlerContext, fileName: string, content: string, isFasta: boolean, noun: string, verb: string): boolean {
  const mismatch = previewMismatch(ctx.records, content, isFasta);
  if (!mismatch) return false;
  ctx.reportMismatch({ ...mismatch, fileName });
  ctx.addLog(`Cannot ${verb} ${categoryLabel(mismatch.incoming)} ${noun} "${fileName}": session contains ${categoryLabel(mismatch.loaded)} sequences.`);
  ctx.setters.setIsProcessing(false);
  return true;
}

function sequenceRequest(ctx: FileHandlerContext, file: File) {
  return (content: string): BioWorkerRequest | null => {
    if (ctx.isAlignmentLocked()) { ctx.setters.setIsProcessing(false); return null; }
    const isFasta = content.trimStart().startsWith('>');
    if (refusedByPreview(ctx, file.name, content, isFasta, 'file', 'load')) return null;
    return isFasta ? { type: 'PARSE_FASTA', filename: file.name, content } : { type: 'PARSE_GENBANK', filename: file.name, content };
  };
}

/** The sequence, alignment and annotation file-picker handlers. */
export function createPickerHandlers(ctx: FileHandlerContext) {
  const { addLog, isAlignmentLocked, setters: { setIsProcessing } } = ctx;
  const deps = workerDeps(ctx);

  const handleFileUpload = (e: InputEvent) => {
    if (isAlignmentLocked()) return;
    const files = takeFiles(e.target);
    if (files.length === 0) return;
    setIsProcessing(true);
    addLog(`Ingesting batch: ${files.length} file(s).`);
    // Dispatch in selection order: the worker answers in order, so the first file sets an
    // empty workspace's molecule type whichever read finishes first.
    void (async () => {
      for (const file of files) {
        try { await dispatchFile(file, sequenceRequest(ctx, file), deps); }
        catch (error) {
          addLog(`Cannot process "${file.name}": ${error instanceof Error ? error.message : String(error)}`);
          setIsProcessing(false);
        }
      }
    })();
  };

  const handleAlignmentUpload = (e: InputEvent) => {
    if (isAlignmentLocked()) return;
    const [file] = takeFiles(e.target);
    if (!file || ctx.records.length === 0) return;
    setIsProcessing(true);
    addLog(`Importing external alignment: ${file.name}`);
    dispatchFile(file, content => {
      if (isAlignmentLocked()) { setIsProcessing(false); return null; }
      if (refusedByPreview(ctx, file.name, content, true, 'alignment', 'import')) return null;
      return { type: 'PARSE_FASTA', filename: file.name, content, asAlignment: true };
    }, deps);
  };

  const handleAnnotationUpload = (e: InputEvent) => {
    const files = takeFiles(e.target);
    if (files.length === 0 || ctx.records.length === 0) return;
    setIsProcessing(true);
    addLog(`Importing annotations from ${files.length} files...`);
    files.forEach(file => dispatchFile(file, content => ({ type: 'PARSE_ANNOTATIONS', filename: file.name, content }), deps));
  };

  return { handleFileUpload, handleAlignmentUpload, handleAnnotationUpload };
}

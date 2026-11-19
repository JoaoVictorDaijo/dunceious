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

import { MixedFastaError } from '@/src/app/logic/bioResponse';
import { takeFiles, postToWorker, dispatchFile, type WorkerUploadDeps } from '@/src/app/logic/upload';
import type { FileHandlerContext } from './context';

type InputEvent = React.ChangeEvent<HTMLInputElement>;

/** Reads may finish in any order; wait for each commit or gap decision in selection order. */
async function importSelection(ctx: FileHandlerContext, workerDeps: WorkerUploadDeps, files: File[], revision: number) {
  const { addLog, getWorkspaceRevision, isAlignmentLocked, dropImport, setters: { setIsProcessing } } = ctx;
  const reads = files.map(async file => {
    try { return { file, content: await workerDeps.readText(file) }; }
    catch (error) { return { file, error }; }
  });

  for (const read of reads) {
    const result = await read;
    const { file } = result;
    if ('error' in result) {
      addLog(`Could not read "${file.name}": ${result.error instanceof Error ? result.error.message : String(result.error)}`);
      continue;
    }
    if (getWorkspaceRevision() !== revision) {
      addLog(`${file.name} was not loaded: the workspace was replaced`);
      continue;
    }
    if (isAlignmentLocked()) {
      addLog(`${file.name} was not loaded: the workspace is locked`);
      continue;
    }
    const { content } = result;
    try {
      if (!dropImport) throw new Error('The processing worker is unavailable.');
      setIsProcessing(true);
      await dropImport.requestBio({
        type: content.trimStart().startsWith('>') ? 'PARSE_FASTA' : 'PARSE_GENBANK',
        filename: file.name, content, workspaceRevision: revision,
      });
    } catch (error) {
      if (!(error instanceof MixedFastaError) && getWorkspaceRevision() === revision) {
        addLog(`Cannot process "${file.name}": ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  setIsProcessing(false);
}

export function createPickerHandlers(ctx: FileHandlerContext) {
  const { addLog, isAlignmentLocked, getWorkspaceRevision, records, setters: { setIsProcessing } } = ctx;
  const workerDeps: WorkerUploadDeps = {
    readText: ctx.readText,
    postToWorker: request => postToWorker(ctx.bioWorkerRef.current, request),
    setProcessing: setIsProcessing,
    addLog,
  };

  const handleFileUpload = (e: InputEvent) => {
    if (isAlignmentLocked()) return;
    const files = takeFiles(e.target);
    if (files.length === 0) return;
    setIsProcessing(true);
    const revision = getWorkspaceRevision();
    addLog(`Ingesting batch: ${files.length} file(s).`);
    void importSelection(ctx, workerDeps, files, revision);
  };

  const handleAlignmentUpload = (e: InputEvent) => {
    if (isAlignmentLocked()) return;
    const [file] = takeFiles(e.target);
    if (!file) return;
    const revision = getWorkspaceRevision();
    setIsProcessing(true);
    addLog(`Importing external alignment: ${file.name}`);
    dispatchFile(file, content => {
      if (isAlignmentLocked()) { setIsProcessing(false); return null; }
      if (getWorkspaceRevision() !== revision) { addLog(`${file.name} was not loaded: the workspace was replaced`); setIsProcessing(false); return null; }
      return { type: 'PARSE_FASTA', filename: file.name, content, asAlignment: true, workspaceRevision: revision };
    }, workerDeps);
  };

  const handleAnnotationUpload = (e: InputEvent) => {
    if (isAlignmentLocked()) return;
    const files = takeFiles(e.target);
    if (files.length === 0 || records.length === 0) return;
    setIsProcessing(true);
    addLog(`Importing annotations from ${files.length} files...`);
    files.forEach(file =>
      dispatchFile(
        file,
        content => {
          if (isAlignmentLocked()) {
            addLog(`${file.name} was not loaded: the workspace is locked`);
            setIsProcessing(false);
            return null;
          }
          return { type: 'PARSE_ANNOTATIONS', filename: file.name, content };
        },
        workerDeps,
      ),
    );
  };

  return { handleFileUpload, handleAlignmentUpload, handleAnnotationUpload };
}

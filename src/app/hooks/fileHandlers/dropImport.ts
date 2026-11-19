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

import type { MutableRefObject } from 'react';
import type { BatchIdMap, BioWorkerRequest, BioWorkerResponse } from '@/src/workers/protocol';
import { routeDroppedFiles, importDroppedBatch, type DropBatchDeps } from '@/src/app/logic/dropRouting';
import { MixedFastaError } from '@/src/app/logic/bioResponse';
import type { FileHandlerContext } from './context';

/**
 * Worker requests for one dropped batch. Each is refused once a project or clear replaces the
 * workspace (the revision moves), or while an alignment holds the lock.
 */
function batchRequester(ctx: FileHandlerContext) {
  const revision = ctx.getWorkspaceRevision();
  const shouldCommit = () => ctx.getWorkspaceRevision() === revision;
  const checkWorkspace = () => {
    if (!shouldCommit()) throw new Error('Drop cancelled: the workspace was replaced');
  };
  const request = async (message: BioWorkerRequest): Promise<BioWorkerResponse> => {
    checkWorkspace();
    if (message.type === 'PARSE_ANNOTATIONS' && ctx.isAlignmentLocked()) {
      ctx.addLog(`${message.filename} was not loaded: the workspace is locked`);
      return { type: 'ANNOTATIONS_SUCCESS', annotations: {}, details: {}, idMap: message.idMap };
    }
    if (!ctx.dropImport) throw new Error('The processing worker is unavailable.');
    const response = await ctx.dropImport.requestBio(message, shouldCommit);
    if (response === 'stale') throw new Error('Drop cancelled: the workspace was replaced');
    checkWorkspace();
    return response;
  };
  return { request, checkWorkspace, revision };
}

function batchDeps(ctx: FileHandlerContext, { request, checkWorkspace, revision }: ReturnType<typeof batchRequester>): DropBatchDeps<File> {
  const importSequence = async (file: File, content: string): Promise<BatchIdMap> => {
    checkWorkspace();
    const isFasta = ['fa', 'fasta'].includes(file.name.split('.').pop()!.toLowerCase());
    try {
      const response = await request({ type: isFasta ? 'PARSE_FASTA' : 'PARSE_GENBANK', filename: file.name, content, workspaceRevision: revision, incomingCategory: undefined, ...(isFasta ? { asAlignment: false } : {}) });
      if (response.type !== 'PARSE_SUCCESS' && response.type !== 'PARSE_REFUSED' && response.type !== 'FASTA_SUCCESS') throw new Error(`Unexpected sequence response for "${file.name}".`);
      if (!response.idMap) throw new Error(`Missing workspace assignments for "${file.name}".`);
      return response.idMap;
    } catch (error) {
      if (!(error instanceof MixedFastaError)) throw error;
      checkWorkspace();
      return error.idMap;
    }
  };
  const importAnnotations = async (file: File, content: string, idMap: BatchIdMap) => {
    const response = await request({ type: 'PARSE_ANNOTATIONS', filename: file.name, content, idMap });
    if (response.type !== 'ANNOTATIONS_SUCCESS') throw new Error(`Unexpected annotation response for "${file.name}".`);
  };
  return { readText: ctx.readText, importSequence, importAnnotations };
}

/**
 * Handles files dropped on the workbench. Drops queue behind each other, so each is checked
 * against the workspace the previous one left.
 */
export function createDropHandler(ctx: FileHandlerContext, dropQueue: MutableRefObject<Promise<void>>, loadProjectFile: (file: File) => Promise<void>) {
  const { addLog, isAlignmentLocked, setters: { setIsProcessing } } = ctx;
  return (files: File[]): Promise<void> => {
    if (isAlignmentLocked() || files.length === 0) return Promise.resolve();
    const route = routeDroppedFiles(files);
    if (route.kind === 'refused') {
      addLog(route.reason);
      return Promise.resolve();
    }
    const run = async () => {
      if (isAlignmentLocked()) return;
      if (route.kind === 'project') {
        if (window.confirm('Load this project and replace the workspace?')) await loadProjectFile(route.file);
        return;
      }
      const batch = batchRequester(ctx);
      setIsProcessing(true);
      try { await importDroppedBatch<File>(route, batchDeps(ctx, batch)); }
      catch (error) { addLog(error instanceof Error ? error.message : String(error)); }
      finally { setIsProcessing(false); }
    };
    const pending = dropQueue.current.then(run);
    dropQueue.current = pending;
    return pending;
  };
}

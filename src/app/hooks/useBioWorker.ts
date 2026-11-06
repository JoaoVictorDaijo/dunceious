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

import { useState, useRef, useEffect, useCallback, Dispatch, SetStateAction } from 'react';
import { isProteinSession } from '@/src/domain/bio/sequence';
import { SeqRecord } from '@/src/domain/bio/types';
import type { BioWorkerRequest, BioWorkerResponse, FastaAlignedRecord, ParseFastaSuccessResponse } from '@/src/workers/protocol';
import { applyParseSuccess, applyAnnotations, applyFastaAndLog, type GapRemoval } from '@/src/app/logic/bioResponse';

/** A pending FASTA consent preview; token identifies one exactly-once choice. */
export interface GapNotice { token: number; fileName: string; records: GapRemoval[] }

export interface UseBioWorkerReturn {
  getRecords: () => SeqRecord[];
  requestBio: (request: BioWorkerRequest, shouldCommit?: () => boolean) => Promise<BioWorkerResponse | 'stale'>;
  applyAlignmentOverlay: (records: FastaAlignedRecord[]) => number;
  records: SeqRecord[];
  setRecords: Dispatch<SetStateAction<SeqRecord[]>>;
  transposedRecords: SeqRecord[];
  consensus: string;
  isProcessing: boolean;
  setIsProcessing: Dispatch<SetStateAction<boolean>>;
  /** Ref to the underlying Worker instance — used by file-upload handlers. */
  bioWorkerRef: React.MutableRefObject<Worker | null>;
  /** Arrival-ordered confirmations hold files before records are committed. */
  pendingConfirmations: GapNotice[];
  confirmGapRemoval: (token: number, load: boolean) => void;
  invalidateImports: (reason: string) => void;
}

/**
 * Manages the bioWorker Web Worker lifecycle and all record / alignment state.
 *
 * The worker is created once on mount and terminated on unmount.
 * Whenever `records` changes the hook auto-dispatches a PROCESS_RECORDS
 * request so transposed records and consensus stay in sync.
 *
 * @param addLog - Callback to append a timestamped message to the activity log.
 */
export function useBioWorker(addLog: (msg: string) => void, options: {
  getWorkspaceRevision?: () => number;
  isAlignmentLocked?: () => boolean;
  onMismatch?: (error: { incoming: 'nucleotide' | 'protein'; loaded: 'nucleotide' | 'protein'; fileName: string }) => void;
} = {}): UseBioWorkerReturn {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const [records, setRecordsState] = useState<SeqRecord[]>([]);
  const recordsRef = useRef(records);
  const recordsGeneration = useRef(0);
  const silentProcessing = useRef(false);
  // The remote monitor needs the reducer outcome synchronously, including
  // record edits queued earlier in the same event.
  const setRecords = useCallback<Dispatch<SetStateAction<SeqRecord[]>>>(update => {
    const next = typeof update === 'function' ? update(recordsRef.current) : update;
    if (next !== recordsRef.current) recordsGeneration.current++;
    recordsRef.current = next;
    setRecordsState(next);
  }, []);
  const getRecords = useCallback(() => recordsRef.current, []);
  const applyAlignmentOverlay = useCallback((aligned: FastaAlignedRecord[]) => {
    const result = applyFastaAndLog(recordsRef.current, aligned, true, addLog);
    if (result.kind !== 'overlay') throw new Error(`Alignment overlay rejected: ${result.kind}`);
    silentProcessing.current = true;
    setRecords(result.next);
    return result.length;
  }, [addLog, setRecords]);
  const [transposedRecords, setTransposedRecords] = useState<SeqRecord[]>([]);
  const [consensus, setConsensus] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [pendingConfirmations, setPendingConfirmations] = useState<GapNotice[]>([]);
  const confirmationCounter = useRef(0);
  const queued = useRef(new Map<number, ParseFastaSuccessResponse>());

  const bioWorkerRef = useRef<Worker | null>(null);

  const requestCounter = useRef(0);
  const pendingRequests = useRef(new Map<number, {
    resolve: (response: BioWorkerResponse | 'stale') => void;
    shouldCommit?: () => boolean;
    reject: (error: Error) => void;
  }>());
  const requestBio = useCallback((request: BioWorkerRequest, shouldCommit?: () => boolean): Promise<BioWorkerResponse | 'stale'> => {
    const worker = bioWorkerRef.current;
    if (!worker) return Promise.reject(new Error('The processing worker is unavailable.'));
    const requestId = ++requestCounter.current;
    const generation = recordsGeneration.current;
    const canCommit = request.type === 'PROCESS_RECORDS'
      ? () => recordsGeneration.current === generation && (!shouldCommit || shouldCommit())
      : shouldCommit;
    return new Promise((resolve, reject) => {
      pendingRequests.current.set(requestId, { resolve, reject, shouldCommit: canCommit });
      try { worker.postMessage({ ...request, requestId }); }
      catch (error) {
        pendingRequests.current.delete(requestId);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }, []);

  const refuse = (msg: Extract<BioWorkerResponse, { type: 'FASTA_SUCCESS' | 'PARSE_SUCCESS' }>, reason: string) => {
    addLog(`${msg.filename} was not loaded: ${reason}`);
    const rows = msg.type === 'FASTA_SUCCESS' ? msg.alignedData : msg.records;
    return { ...msg, idMap: Object.fromEntries(rows.map(row => [row.id, null])) };
  };
  const settle = (msg: BioWorkerResponse, error?: string) => {
    if (msg.requestId === undefined) return;
    const pending = pendingRequests.current.get(msg.requestId);
    pendingRequests.current.delete(msg.requestId);
    if (error || msg.type === 'ERROR') pending?.reject(new Error(error ?? (msg.type === 'ERROR' ? msg.error : 'Import invalidated')));
    else pending?.resolve(msg);
  };
  const invalidReason = (msg: Extract<BioWorkerResponse, { type: 'FASTA_SUCCESS' | 'PARSE_SUCCESS' }>) => {
    const pending = msg.requestId === undefined ? undefined : pendingRequests.current.get(msg.requestId);
    if (pending?.shouldCommit && !pending.shouldCommit()
      || msg.workspaceRevision !== undefined && msg.workspaceRevision !== optionsRef.current.getWorkspaceRevision?.()) return 'the workspace was replaced';
    return undefined;
  };
  const commit = (msg: Extract<BioWorkerResponse, { type: 'FASTA_SUCCESS' | 'PARSE_SUCCESS' }>) => {
    const invalid = invalidReason(msg);
    if (invalid) { addLog(`${msg.filename} was not loaded: ${invalid}`); settle(msg, invalid); return; }
    if (optionsRef.current.isAlignmentLocked?.()) { settle(refuse(msg, 'the workspace is locked')); return; }
    const loaded = isProteinSession(recordsRef.current) ? 'protein' : 'nucleotide';
    if (recordsRef.current.length && msg.incomingCategory && msg.incomingCategory !== loaded) {
      optionsRef.current.onMismatch?.({ incoming: msg.incomingCategory, loaded, fileName: msg.filename });
      settle(refuse(msg, `the session now holds ${loaded} sequences`));
      return;
    }
    if (msg.type === 'PARSE_SUCCESS') {
      const result = applyParseSuccess(recordsRef.current, msg.records, msg.filename);
      setRecords(result.next);
      addLog(`Batch ingestion complete: ${result.count} records added.`);
      settle({ ...msg, idMap: result.idMap });
    } else {
      const result = applyFastaAndLog(recordsRef.current, msg.alignedData, msg.asAlignment, addLog, msg.filename);
      setRecords(result.next);
      settle(result.kind === 'batch' || result.kind === 'aligned-load'
        ? { ...msg, idMap: result.idMap } : result.kind === 'overlay' ? msg : refuse(msg, result.kind));
    }
  };
  const confirmGapRemoval = (token: number, load: boolean) => {
    const msg = queued.current.get(token);
    if (!msg) return;
    queued.current.delete(token);
    setPendingConfirmations(previous => previous.filter(entry => entry.token !== token));
    if (load) commit(msg);
    else settle(refuse(msg, 'gap removal declined'));
  };
  const invalidateImports = (reason: string) => {
    for (const msg of queued.current.values()) {
      addLog(`${msg.filename} was not loaded: ${reason}`);
      settle(msg, reason);
    }
    queued.current.clear();
    setPendingConfirmations([]);
  };

  const receiveSequence = (msg: Extract<BioWorkerResponse, { type: 'FASTA_SUCCESS' | 'PARSE_SUCCESS' }>) => {
    const invalid = invalidReason(msg);
    if (invalid) {
      addLog(`${msg.filename} was not loaded: ${invalid}`);
      settle(msg, invalid);
    } else if (msg.type === 'FASTA_SUCCESS' && !msg.asAlignment
      && msg.alignedData.some(row => /[-.]/.test(row.sequence))
      && msg.alignedData.every(row => row.sequence.replace(/[-.]/g, '').length > 0)) {
      const token = ++confirmationCounter.current;
      queued.current.set(token, msg);
      setPendingConfirmations(previous => [...previous, { token, fileName: msg.filename,
        records: msg.alignedData.map(row => ({ id: row.id, removed: (row.sequence.match(/[-.]/g) ?? []).length })).filter(row => row.removed > 0) }]);
    } else commit(msg);
    setIsProcessing(false);
  };

  // ── Worker setup ──────────────────────────────────────────────────────────
  useEffect(() => {
    const worker = new Worker(
      new URL('@/src/workers/bio.worker.ts', import.meta.url),
      { type: 'module' },
    );
    bioWorkerRef.current = worker;
    let active = true;

    worker.onmessage = (e: MessageEvent<BioWorkerResponse>) => {
      if (!active) return;
      const msg = e.data;
      const pending = msg.requestId === undefined ? undefined : pendingRequests.current.get(msg.requestId);
      if (msg.type === 'SUCCESS' && !pending) return;
      if (msg.type !== 'FASTA_SUCCESS' && msg.type !== 'PARSE_SUCCESS' && pending?.shouldCommit && !pending.shouldCommit()) {
        pendingRequests.current.delete(msg.requestId!);
        pending.resolve('stale');
        return;
      }

      if (msg.type === 'SUCCESS') {
        setTransposedRecords(msg.records);
        setConsensus(msg.consensus);
        setIsProcessing(false);
        addLog(`Genomic processing complete. ${msg.records.length} records ready.`);

      } else if (msg.type === 'PARSE_SUCCESS' || msg.type === 'FASTA_SUCCESS') {
        receiveSequence(msg);
        return;

      } else if (msg.type === 'ANNOTATIONS_SUCCESS') {
        if (optionsRef.current.isAlignmentLocked?.()) {
          addLog('Annotations were not loaded: the workspace is locked');
          setIsProcessing(false);
          settle({ ...msg, annotations: {}, details: {} });
          return;
        }
        const annotationResponse = msg;
        const annotations = msg.annotations;
        setRecords(prev => {
          const { next, totalAdded, unmatched } = applyAnnotations(prev, annotations, annotationResponse.details, annotationResponse.idMap);
          if (unmatched.length > 0) {
            addLog(
              `WARNING: Some IDs in file did not match active records: [${unmatched
                .slice(0, 5)
                .join(', ')}${unmatched.length > 5 ? '...' : ''}]`,
            );
          }
          addLog(`Annotation import complete: ${totalAdded} features added across records.`);
          return next;
        });
        setIsProcessing(false);

      } else if (msg.type === 'ERROR') {
        setIsProcessing(false);
        addLog(`Processing Error: ${msg.error}`);
      }
      if (msg.requestId !== undefined) {
        const pending = pendingRequests.current.get(msg.requestId);
        pendingRequests.current.delete(msg.requestId);
        if (msg.type === 'ERROR') pending?.reject(new Error(msg.error));
        else pending?.resolve(msg);
      }
    };

    worker.onerror = event => {
      if (!active) return;
      invalidateImports(event.message || 'Worker failed.');
      for (const pending of pendingRequests.current.values()) pending.reject(new Error(event.message || 'Worker failed.'));
      pendingRequests.current.clear();
      setIsProcessing(false);
      addLog(`Processing Error: ${event.message || 'Worker failed.'}`);
    };
    return () => {
      invalidateImports('Worker terminated.');
      active = false;
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
      bioWorkerRef.current = null;
      for (const pending of pendingRequests.current.values()) pending.reject(new Error('Worker terminated.'));
      pendingRequests.current.clear();
    };
    // addLog identity is stable (defined once in useAppLogger) so it is safe
    // to omit from deps without triggering stale-closure bugs.
  }, []);

  useEffect(() => {
    if ([...queued.current.values()].some(msg => invalidReason(msg))) invalidateImports('the workspace was replaced');
  });

  // ── Auto-dispatch PROCESS_RECORDS when records change ─────────────────────
  useEffect(() => {
    const visibleRecords = records.filter(r => r.visible !== false);
    const silent = silentProcessing.current;
    silentProcessing.current = false;
    if (visibleRecords.length > 0) {
      if (!silent) setIsProcessing(true);
      const request: BioWorkerRequest = { type: 'PROCESS_RECORDS', records: visibleRecords };
      // The message handler reports processing errors; automatic requests have no awaiting caller.
      void requestBio(request).catch(() => {});
    } else {
      setTransposedRecords([]);
      setConsensus('');
      setIsProcessing(false);
    }
  }, [records, requestBio]);

  return {
    getRecords,
    requestBio,
    applyAlignmentOverlay,
    records,
    setRecords,
    transposedRecords,
    consensus,
    isProcessing,
    setIsProcessing,
    bioWorkerRef,
    pendingConfirmations,
    confirmGapRemoval,
    invalidateImports,
  };
}

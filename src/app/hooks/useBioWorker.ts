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

import { useState, useRef, useEffect, useCallback, Dispatch, SetStateAction } from 'react';
import { SeqRecord } from '@/src/domain/bio/types';
import type { BioWorkerRequest, BioWorkerResponse, FastaAlignedRecord } from '@/src/workers/protocol';
import { applyParseSuccess, applyAnnotations, applyFastaAndLog } from '@/src/app/logic/bioResponse';

export interface UseBioWorkerReturn {
  getRecords: () => SeqRecord[];
  requestBio: (request: BioWorkerRequest) => Promise<BioWorkerResponse>;
  applyAlignmentOverlay: (records: FastaAlignedRecord[]) => number;
  records: SeqRecord[];
  setRecords: Dispatch<SetStateAction<SeqRecord[]>>;
  transposedRecords: SeqRecord[];
  consensus: string;
  isProcessing: boolean;
  setIsProcessing: Dispatch<SetStateAction<boolean>>;
  /** Ref to the underlying Worker instance — used by file-upload handlers. */
  bioWorkerRef: React.MutableRefObject<Worker | null>;
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
export function useBioWorker(addLog: (msg: string) => void): UseBioWorkerReturn {
  const [records, setRecordsState] = useState<SeqRecord[]>([]);
  const recordsRef = useRef(records);
  const silentProcessing = useRef(false);
  // The remote monitor needs the reducer outcome synchronously, including
  // record edits queued earlier in the same event.
  const setRecords = useCallback<Dispatch<SetStateAction<SeqRecord[]>>>(update => {
    const next = typeof update === 'function' ? update(recordsRef.current) : update;
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

  const bioWorkerRef = useRef<Worker | null>(null);

  const requestCounter = useRef(0);
  const pendingRequests = useRef(new Map<number, {
    resolve: (response: BioWorkerResponse) => void;
    reject: (error: Error) => void;
  }>());
  const requestBio = useCallback((request: BioWorkerRequest): Promise<BioWorkerResponse> => {
    const worker = bioWorkerRef.current;
    if (!worker) return Promise.reject(new Error('The processing worker is unavailable.'));
    const requestId = ++requestCounter.current;
    return new Promise((resolve, reject) => {
      pendingRequests.current.set(requestId, { resolve, reject });
      try { worker.postMessage({ ...request, requestId }); }
      catch (error) {
        pendingRequests.current.delete(requestId);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }, []);

  // ── Worker setup ──────────────────────────────────────────────────────────
  useEffect(() => {
    bioWorkerRef.current = new Worker(
      new URL('@/src/workers/bio.worker.ts', import.meta.url),
      { type: 'module' },
    );

    bioWorkerRef.current.onmessage = (e: MessageEvent<BioWorkerResponse>) => {
      let msg = e.data;

      if (msg.type === 'SUCCESS') {
        setTransposedRecords(msg.records);
        setConsensus(msg.consensus);
        setIsProcessing(false);
        addLog(`Genomic processing complete. ${msg.records.length} records ready.`);

      } else if (msg.type === 'PARSE_SUCCESS') {
        const result = applyParseSuccess(recordsRef.current, msg.records, msg.filename);
        setRecords(result.next);
        addLog(`Batch ingestion complete: ${result.count} records added.`);
        msg = { ...msg, idMap: result.idMap };
        setIsProcessing(false);

      } else if (msg.type === 'ANNOTATIONS_SUCCESS') {
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

      } else if (msg.type === 'FASTA_SUCCESS') {
        const result = applyFastaAndLog(recordsRef.current, msg.alignedData, msg.asAlignment, addLog, msg.filename);
        setRecords(result.next);
        if (result.kind === 'batch') msg = { ...msg, idMap: result.idMap };
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

    bioWorkerRef.current.onerror = event => {
      for (const pending of pendingRequests.current.values()) pending.reject(new Error(event.message || 'Worker failed.'));
      pendingRequests.current.clear();
      setIsProcessing(false);
      addLog(`Processing Error: ${event.message || 'Worker failed.'}`);
    };
    return () => {
      bioWorkerRef.current?.terminate();
      bioWorkerRef.current = null;
      for (const pending of pendingRequests.current.values()) pending.reject(new Error('Worker terminated.'));
      pendingRequests.current.clear();
    };
    // addLog identity is stable (defined once in useAppLogger) so it is safe
    // to omit from deps without triggering stale-closure bugs.
  }, []);

  // ── Auto-dispatch PROCESS_RECORDS when records change ─────────────────────
  useEffect(() => {
    const visibleRecords = records.filter(r => r.visible !== false);
    const silent = silentProcessing.current;
    silentProcessing.current = false;
    if (visibleRecords.length > 0) {
      if (!silent) setIsProcessing(true);
      const request: BioWorkerRequest = { type: 'PROCESS_RECORDS', records: visibleRecords };
      bioWorkerRef.current?.postMessage(request);
    } else {
      setTransposedRecords([]);
      setConsensus('');
    }
  }, [records]);

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
  };
}

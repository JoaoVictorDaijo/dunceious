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

import { useState, useRef, useEffect, useCallback, Dispatch, SetStateAction, MutableRefObject } from 'react';
import { SeqRecord } from '@/src/domain/bio/types';
import type { BioWorkerRequest, BioWorkerResponse, FastaAlignedRecord } from '@/src/workers/protocol';
import { applyFastaAndLog } from '@/src/app/logic/bioResponse';
import { commitBioResponse, type GapNotice, type ResponseEffects, type SessionTypeNotice } from './bioResponseCommit';

export type { GapNotice, SessionTypeNotice } from './bioResponseCommit';

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
  /** Files whose records lost '-' since the user last dismissed the notice. */
  gapNotices: GapNotice[];
  dismissGapNotices: () => void;
  sessionTypeNotice: SessionTypeNotice | null;
  dismissSessionTypeNotice: () => void;
}

interface PendingRequest {
  resolve: (response: BioWorkerResponse | 'stale') => void;
  shouldCommit?: () => boolean;
  reject: (error: Error) => void;
}
type PendingRequests = MutableRefObject<Map<number, PendingRequest>>;

/**
 * Record state whose setter applies updates to a ref first, so the remote monitor reads the
 * reducer outcome synchronously, including edits queued earlier in the same event.
 * `generation` counts committed changes, which lets stale PROCESS_RECORDS replies be dropped.
 */
function useRecordStore() {
  const [records, setRecordsState] = useState<SeqRecord[]>([]);
  const recordsRef = useRef(records);
  const generation = useRef(0);
  const setRecords = useCallback<Dispatch<SetStateAction<SeqRecord[]>>>(update => {
    const next = typeof update === 'function' ? update(recordsRef.current) : update;
    if (next !== recordsRef.current) generation.current++;
    recordsRef.current = next;
    setRecordsState(next);
  }, []);
  const getRecords = useCallback(() => recordsRef.current, []);
  return { records, setRecords, getRecords, generation };
}

/** Request/reply pairing over the worker; a PROCESS_RECORDS reply commits only if no record changed since it was sent. */
function useBioRequests(generation: MutableRefObject<number>) {
  const bioWorkerRef = useRef<Worker | null>(null);
  const requestCounter = useRef(0);
  const pendingRequests: PendingRequests = useRef(new Map<number, PendingRequest>());
  const requestBio = useCallback((request: BioWorkerRequest, shouldCommit?: () => boolean): Promise<BioWorkerResponse | 'stale'> => {
    const worker = bioWorkerRef.current;
    if (!worker) return Promise.reject(new Error('The processing worker is unavailable.'));
    const requestId = ++requestCounter.current;
    const sentAt = generation.current;
    const canCommit = request.type === 'PROCESS_RECORDS'
      ? () => generation.current === sentAt && (!shouldCommit || shouldCommit())
      : shouldCommit;
    return new Promise((resolve, reject) => {
      pendingRequests.current.set(requestId, { resolve, reject, shouldCommit: canCommit });
      try { worker.postMessage({ ...request, requestId }); }
      catch (error) {
        pendingRequests.current.delete(requestId);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }, [generation]);
  return { bioWorkerRef, pendingRequests, requestBio };
}

function rejectAll(pendingRequests: PendingRequests, message: string) {
  for (const pending of pendingRequests.current.values()) pending.reject(new Error(message));
  pendingRequests.current.clear();
}

/** Routes one worker message: drops stale replies, commits the rest, then settles the awaiting request. */
function receive(msg: BioWorkerResponse, pendingRequests: PendingRequests, fx: ResponseEffects) {
  const pending = msg.requestId === undefined ? undefined : pendingRequests.current.get(msg.requestId);
  if (msg.type === 'SUCCESS' && !pending) return;
  if (pending?.shouldCommit && !pending.shouldCommit()) {
    pendingRequests.current.delete(msg.requestId!);
    pending.resolve('stale');
    return;
  }
  const reply = commitBioResponse(msg, fx);
  if (reply.requestId === undefined) return;
  const awaiting = pendingRequests.current.get(reply.requestId);
  pendingRequests.current.delete(reply.requestId);
  if (reply.type === 'ERROR') awaiting?.reject(new Error(reply.error));
  else awaiting?.resolve(reply);
}

/**
 * Creates the worker on mount and terminates it on unmount. The effects object is read once:
 * its setters and `addLog` (defined once in useAppLogger) keep a stable identity.
 */
function useWorkerLifecycle(bioWorkerRef: MutableRefObject<Worker | null>, pendingRequests: PendingRequests, fx: ResponseEffects) {
  const effects = useRef(fx);
  useEffect(() => {
    const worker = new Worker(new URL('@/src/workers/bio.worker.ts', import.meta.url), { type: 'module' });
    bioWorkerRef.current = worker;
    let active = true;
    worker.onmessage = (e: MessageEvent<BioWorkerResponse>) => { if (active) receive(e.data, pendingRequests, effects.current); };
    worker.onerror = event => {
      if (!active) return;
      rejectAll(pendingRequests, event.message || 'Worker failed.');
      effects.current.setIsProcessing(false);
      effects.current.addLog(`Processing Error: ${event.message || 'Worker failed.'}`);
    };
    return () => {
      active = false;
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
      bioWorkerRef.current = null;
      rejectAll(pendingRequests, 'Worker terminated.');
    };
  }, [bioWorkerRef, pendingRequests]);
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
  const { records, setRecords, getRecords, generation } = useRecordStore();
  const { bioWorkerRef, pendingRequests, requestBio } = useBioRequests(generation);
  const silentProcessing = useRef(false);
  const [transposedRecords, setTransposedRecords] = useState<SeqRecord[]>([]);
  const [consensus, setConsensus] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [gapNotices, setGapNotices] = useState<GapNotice[]>([]);
  const dismissGapNotices = useCallback(() => setGapNotices([]), []);
  const [sessionTypeNotice, setSessionTypeNotice] = useState<SessionTypeNotice | null>(null);
  const dismissSessionTypeNotice = useCallback(() => setSessionTypeNotice(null), []);
  const applyAlignmentOverlay = useCallback((aligned: FastaAlignedRecord[]) => {
    const result = applyFastaAndLog(getRecords(), aligned, true, addLog);
    if (result.kind !== 'overlay') throw new Error(`Alignment overlay rejected: ${result.kind}`);
    silentProcessing.current = true;
    setRecords(result.next);
    return result.length;
  }, [addLog, getRecords, setRecords]);

  useWorkerLifecycle(bioWorkerRef, pendingRequests, {
    getRecords, setRecords, addLog, setTransposedRecords, setConsensus, setIsProcessing,
    addGapNotice: notice => setGapNotices(notices => [...notices, notice]),
    notifySessionType: setSessionTypeNotice,
  });

  // Keep transposed records and consensus in step with the visible records.
  useEffect(() => {
    const visibleRecords = records.filter(r => r.visible !== false);
    const silent = silentProcessing.current;
    silentProcessing.current = false;
    if (visibleRecords.length > 0) {
      if (!silent) setIsProcessing(true);
      // The message handler reports processing errors; automatic requests have no awaiting caller.
      void requestBio({ type: 'PROCESS_RECORDS', records: visibleRecords }).catch(() => {});
    } else {
      setTransposedRecords([]);
      setConsensus('');
      setIsProcessing(false);
    }
  }, [records, requestBio]);

  return {
    getRecords, requestBio, applyAlignmentOverlay, records, setRecords, transposedRecords, consensus,
    isProcessing, setIsProcessing, bioWorkerRef, gapNotices, dismissGapNotices, sessionTypeNotice, dismissSessionTypeNotice,
  };
}

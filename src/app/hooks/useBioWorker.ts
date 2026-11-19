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

import { useState, useRef, useEffect, useCallback, type Dispatch, type SetStateAction, type MutableRefObject } from 'react';
import type { SeqRecord } from '@/src/domain/bio/types';
import type { BioWorkerRequest, BioWorkerResponse, FastaAlignedRecord, ParseFastaSuccessResponse } from '@/src/workers/protocol';
import { applyFastaAndLog } from '@/src/app/logic/bioResponse';
import type { ImportDiagnosticFile } from '@/src/app/logic/genbankImport';
import { createBioResponseHandlers, type BioWorkerOptions, type GapNotice, type PendingRequests, type ResponseEffects } from './bioResponseCommit';

export type { GapNotice } from './bioResponseCommit';

export interface UseBioWorkerReturn {
  genBankRefusals: ImportDiagnosticFile[];
  dismissGenBankRefusals: () => void;
  importNotes: ImportDiagnosticFile[];
  clearImportNotes: () => void;
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
  const pendingRequests: PendingRequests = useRef(new Map());
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

/** Creates the worker once, using the stable record store and live options ref. */
function useWorkerLifecycle(bioWorkerRef: MutableRefObject<Worker | null>, pendingRequests: PendingRequests, responses: ReturnType<typeof createBioResponseHandlers>) {
  const initialResponses = useRef(responses);
  useEffect(() => {
    const worker = new Worker(new URL('@/src/workers/bio.worker.ts', import.meta.url), { type: 'module' });
    bioWorkerRef.current = worker;
    let active = true;
    const { receive, invalidateImports, setIsProcessing, addLog } = initialResponses.current;
    worker.onmessage = (event: MessageEvent<BioWorkerResponse>) => { if (active) receive(event.data); };
    worker.onerror = event => {
      if (!active) return;
      invalidateImports(event.message || 'Worker failed.');
      rejectAll(pendingRequests, event.message || 'Worker failed.');
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
      rejectAll(pendingRequests, 'Worker terminated.');
    };
  }, [bioWorkerRef, pendingRequests]);
}

function useImportResponses(records: SeqRecord[], fx: ResponseEffects, { pendingRequests, bioWorkerRef }: ReturnType<typeof useBioRequests>, options: BioWorkerOptions) {
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const [genBankRefusals, setGenBankRefusals] = useState<ImportDiagnosticFile[]>([]);
  const [importNotes, setImportNotes] = useState<ImportDiagnosticFile[]>([]);
  const [pendingConfirmations, setPendingConfirmations] = useState<GapNotice[]>([]);
  const confirmationCounter = useRef(0);
  const queued = useRef(new Map<number, ParseFastaSuccessResponse>());

  const responses = createBioResponseHandlers({
    ...fx, optionsRef, pendingRequests, queued, confirmationCounter,
    setGenBankRefusals, setImportNotes, setPendingConfirmations,
  });

  useWorkerLifecycle(bioWorkerRef, pendingRequests, responses);

  useEffect(() => {
    if ([...queued.current.values()].some(responses.invalidReason)) responses.invalidateImports('the workspace was replaced');
  });

  useEffect(() => {
    const ids = new Set(records.map(r => r.id));
    setImportNotes(previous => {
      const next = previous.flatMap(file => {
        const findings = file.findings.filter(f => f.record && ids.has(file.recordIds?.[f.record.index - 1] ?? ''));
        return findings.length ? [findings.length === file.findings.length ? file : { ...file, findings }] : [];
      });
      return next.length === previous.length && next.every((file, i) => file === previous[i]) ? previous : next;
    });
  }, [records]);

  return {
    genBankRefusals,
    dismissGenBankRefusals: () => setGenBankRefusals([]),
    importNotes,
    clearImportNotes: () => setImportNotes([]),
    pendingConfirmations,
    confirmGapRemoval: responses.confirmGapRemoval,
    invalidateImports: responses.invalidateImports,
  };
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
export function useBioWorker(addLog: (msg: string) => void, options: BioWorkerOptions = {}): UseBioWorkerReturn {
  const { records, setRecords, getRecords, generation } = useRecordStore();
  const requests = useBioRequests(generation);
  const { bioWorkerRef, requestBio } = requests;
  const silentProcessing = useRef(false);
  const [transposedRecords, setTransposedRecords] = useState<SeqRecord[]>([]);
  const [consensus, setConsensus] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const applyAlignmentOverlay = useCallback((aligned: FastaAlignedRecord[]) => {
    const result = applyFastaAndLog(getRecords(), aligned, true, addLog);
    if (result.kind !== 'overlay') throw new Error(`Alignment overlay rejected: ${result.kind}`);
    silentProcessing.current = true;
    setRecords(result.next);
    return result.length;
  }, [addLog, getRecords, setRecords]);

  const imports = useImportResponses(records, {
    getRecords, setRecords, addLog, setTransposedRecords, setConsensus, setIsProcessing,
  }, requests, options);

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
    ...imports,
    getRecords, requestBio, applyAlignmentOverlay, records, setRecords, transposedRecords, consensus,
    isProcessing, setIsProcessing, bioWorkerRef,
  };
}

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

import { useState, useRef, useEffect, Dispatch, SetStateAction } from 'react';
import { SeqRecord } from '@/src/domain/bio/types';
import type { BioWorkerRequest, BioWorkerResponse } from '@/src/workers/protocol';
import { applyParseSuccess, applyAnnotations, applyFastaResponse } from '@/src/app/logic/bioResponse';

export interface UseBioWorkerReturn {
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
  const [records, setRecords] = useState<SeqRecord[]>([]);
  const [transposedRecords, setTransposedRecords] = useState<SeqRecord[]>([]);
  const [consensus, setConsensus] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);

  const bioWorkerRef = useRef<Worker | null>(null);

  // ── Worker setup ──────────────────────────────────────────────────────────
  useEffect(() => {
    bioWorkerRef.current = new Worker(
      new URL('@/src/workers/bioWorker.ts', import.meta.url),
      { type: 'module' },
    );

    bioWorkerRef.current.onmessage = (e: MessageEvent<BioWorkerResponse>) => {
      const msg = e.data;

      if (msg.type === 'SUCCESS') {
        setTransposedRecords(msg.records);
        setConsensus(msg.consensus);
        setIsProcessing(false);
        addLog(`Genomic processing complete. ${msg.records.length} records ready.`);

      } else if (msg.type === 'PARSE_SUCCESS') {
        setRecords(prev => {
          const { next, count } = applyParseSuccess(prev, msg.records);
          addLog(`Batch ingestion complete: ${count} records added.`);
          return next;
        });
        setIsProcessing(false);

      } else if (msg.type === 'ANNOTATIONS_SUCCESS') {
        const annotations = msg.annotations;
        setRecords(prev => {
          const { next, totalAdded, unmatched } = applyAnnotations(prev, annotations);
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
        const { alignedData, asAlignment } = msg;
        setRecords(prev => {
          const res = applyFastaResponse(prev, alignedData, asAlignment);
          switch (res.kind) {
            case 'batch':
              addLog(`Batch ingestion complete: ${res.count} records added.`);
              break;
            case 'reject-mismatch':
              addLog(
                `ERROR: Sequence mismatch. Missing: [${res.missing.join(', ')}], Extra: [${res.extra.join(', ')}]`,
              );
              break;
            case 'reject-length':
              addLog(
                `ERROR: Aligned sequences must have identical lengths. Found: ${res.lengths.join(', ')}`,
              );
              break;
            case 'overlay':
              addLog(`External alignment applied successfully (${res.length} bp).`);
              break;
          }
          return res.next;
        });
        setIsProcessing(false);

      } else if (msg.type === 'ERROR') {
        setIsProcessing(false);
        addLog(`Processing Error: ${msg.error}`);
      }
    };

    return () => { bioWorkerRef.current?.terminate(); };
    // addLog identity is stable (defined once in useAppLogger) so it is safe
    // to omit from deps without triggering stale-closure bugs.
  }, []);

  // ── Auto-dispatch PROCESS_RECORDS when records change ─────────────────────
  useEffect(() => {
    const visibleRecords = records.filter(r => r.visible !== false);
    if (visibleRecords.length > 0) {
      setIsProcessing(true);
      const request: BioWorkerRequest = { type: 'PROCESS_RECORDS', records: visibleRecords };
      bioWorkerRef.current?.postMessage(request);
    } else {
      setTransposedRecords([]);
      setConsensus('');
    }
  }, [records]);

  return {
    records,
    setRecords,
    transposedRecords,
    consensus,
    isProcessing,
    setIsProcessing,
    bioWorkerRef,
  };
}

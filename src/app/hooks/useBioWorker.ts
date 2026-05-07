import { useState, useRef, useEffect, Dispatch, SetStateAction } from 'react';
import { SeqRecord, BioFeature, QuantitativeTrack } from '@/src/domain/bio/types';
import type { BioWorkerRequest, BioWorkerResponse } from '@/src/workers/protocol';

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
        const newRecords = msg.records.map(r => ({ ...r, visible: true }));
        setRecords(prev => [...prev, ...newRecords]);
        setIsProcessing(false);
        addLog(`Batch ingestion complete: ${newRecords.length} records added.`);

      } else if (msg.type === 'ANNOTATIONS_SUCCESS') {
        const annotations = msg.annotations;
        setRecords(prev => {
          let totalAdded = 0;
          const matchedIds = new Set<string>();

          /** Look up annotation items by record id, name, or accession. */
          const lookupItems = (r: SeqRecord) =>
            annotations[r.id] ??
            annotations[r.name] ??
            (r.accession ? annotations[r.accession] : undefined) ??
            [];

          const next = prev.map(r => {
            const items = lookupItems(r);
            if (items.length > 0) {
              // Discriminant: only QuantitativeTrack carries a `data` array field
              const newFeats = items.filter((i): i is BioFeature => !('data' in i));
              const newTracks = items.filter((i): i is QuantitativeTrack => 'data' in i);
              totalAdded += items.length;
              matchedIds.add(r.id);
              return {
                ...r,
                features: [...r.features, ...newFeats],
                tracks: [...(r.tracks ?? []), ...newTracks],
              };
            }
            return r;
          });

          const fileIds = Object.keys(annotations);
          const unmatched = fileIds.filter(
            id => !prev.some(r => r.id === id || r.name === id || r.accession === id),
          );
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
        const alignedData = msg.alignedData;
        setRecords(prev => {
          // No existing records — treat as primary sequence loading
          if (prev.length === 0) {
            const newRecords = alignedData.map(r => ({ ...r, visible: true }));
            addLog(`Batch ingestion complete: ${newRecords.length} records added.`);
            return newRecords;
          }

          // Existing records — treat as an external pre-aligned FASTA overlay
          const currentIds = new Set(prev.map(r => r.id));
          const uploadedIds = new Set(alignedData.map(d => d.id));
          const missingInUpload = prev.filter(r => !uploadedIds.has(r.id)).map(r => r.id);
          const extraInUpload = alignedData.filter(d => !currentIds.has(d.id)).map(d => d.id);

          if (missingInUpload.length > 0 || extraInUpload.length > 0) {
            addLog(
              `ERROR: Sequence mismatch. Missing: [${missingInUpload.join(', ')}], Extra: [${extraInUpload.join(', ')}]`,
            );
            return prev;
          }

          const lengths = new Set(alignedData.map(d => d.sequence.length));
          if (lengths.size > 1) {
            addLog(
              `ERROR: Aligned sequences must have identical lengths. Found: ${Array.from(lengths).join(', ')}`,
            );
            return prev;
          }

          addLog(
            `External alignment applied successfully (${alignedData[0]?.sequence.length ?? 0} bp).`,
          );
          return prev.map(r => {
            const match = alignedData.find(d => d.id === r.id);
            return { ...r, alignedSequence: match?.sequence };
          });
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

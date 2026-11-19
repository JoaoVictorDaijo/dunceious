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

import type { Dispatch, SetStateAction, MutableRefObject } from 'react';
import { findSessionTypeConflict, type MoleculeCategory, type SessionTypeConflict } from '@/src/domain/bio/sequence';
import type { SeqRecord } from '@/src/domain/bio/types';
import { noticesWarning, translationWarning } from '@/src/domain/bio/translation';
import { unplacedSummary } from '@/src/domain/bio/quantitativeTracks';
import { refusedGenBankIds, importLog, type ImportDiagnosticFile } from '@/src/app/logic/genbankImport';
import { sanitizeId } from '@/src/app/logic/idHelpers';
import type { BioWorkerResponse, FastaAlignedRecord, ParseFastaSuccessResponse, ParseGenBankRefusedResponse, ParseGenBankSuccessResponse } from '@/src/workers/protocol';
import { applyParseResponse, applyAnnotations, logAttachedTranslationWarning, applyFastaAndLog, MixedFastaError, remotePartsWarning, type GapRemoval } from '@/src/app/logic/bioResponse';

/** A pending FASTA consent preview; token identifies one exactly-once choice. */
export interface GapNotice { token: number; fileName: string; records: GapRemoval[] }

type SequenceResponse = Extract<BioWorkerResponse, { type: 'FASTA_SUCCESS' | 'PARSE_SUCCESS' | 'PARSE_REFUSED' }>;

export interface BioWorkerOptions {
  getWorkspaceRevision?: () => number;
  isAlignmentLocked?: () => boolean;
  onMismatch?: (error: SessionTypeConflict & { fileName: string }) => void;
}

interface PendingRequest {
  resolve: (response: BioWorkerResponse | 'stale') => void;
  shouldCommit?: () => boolean;
  reject: (error: Error) => void;
}
export type PendingRequests = MutableRefObject<Map<number, PendingRequest>>;

export interface ResponseEffects {
  getRecords: () => SeqRecord[];
  setRecords: Dispatch<SetStateAction<SeqRecord[]>>;
  addLog: (msg: string) => void;
  setTransposedRecords: Dispatch<SetStateAction<SeqRecord[]>>;
  setConsensus: Dispatch<SetStateAction<string>>;
  setIsProcessing: Dispatch<SetStateAction<boolean>>;
}

interface ImportEffects extends ResponseEffects {
  optionsRef: MutableRefObject<BioWorkerOptions>;
  pendingRequests: PendingRequests;
  queued: MutableRefObject<Map<number, ParseFastaSuccessResponse>>;
  confirmationCounter: MutableRefObject<number>;
  setGenBankRefusals: Dispatch<SetStateAction<ImportDiagnosticFile[]>>;
  setImportNotes: Dispatch<SetStateAction<ImportDiagnosticFile[]>>;
  setPendingConfirmations: Dispatch<SetStateAction<GapNotice[]>>;
}

type Settle = (msg: BioWorkerResponse, error?: string | Error) => void;

function isSequenceResponse(msg: BioWorkerResponse): msg is SequenceResponse {
  return msg.type === 'FASTA_SUCCESS' || msg.type === 'PARSE_SUCCESS' || msg.type === 'PARSE_REFUSED';
}

const refusedFastaIds = (rows: FastaAlignedRecord[]) => Object.fromEntries(
  rows.flatMap(({ id }) => [[id, null], [sanitizeId(id), null]]),
);

function reportGenBankRefusal(
  { setGenBankRefusals, addLog }: ImportEffects, settle: Settle,
  msg: ParseGenBankSuccessResponse | ParseGenBankRefusedResponse, categories: MoleculeCategory[], conflict: SessionTypeConflict | null,
) {
  const findings = [...(msg.findings ?? [])];
  if (conflict && !(conflict.incoming === 'mixed' && findings.some(finding => finding.code === 'molecule-mixture'))) {
    const index = conflict.incoming === 'mixed' ? -1 : categories.indexOf(conflict.incoming);
    findings.push({
      tier: 'refuse', code: 'category-mismatch',
      ...(index >= 0 && { record: { name: msg.records[index]?.id ?? msg.filename, index: index + 1 } }),
      message: conflict.incoming === 'mixed'
        ? 'This file mixes nucleotide and peptide records. A workspace holds one molecule type.'
        : `This file contains ${conflict.incoming} records, but the session now holds ${conflict.loaded} sequences.`,
    });
  }
  const file = { filename: msg.filename, findings };
  setGenBankRefusals(previous => [...previous, file]);
  addLog(importLog(file, true));
  settle({ ...msg, type: 'PARSE_REFUSED', findings, categories, idMap: refusedGenBankIds(msg.records) });
}

function commitGenBank(msg: ParseGenBankSuccessResponse | ParseGenBankRefusedResponse, fx: ImportEffects, settle: Settle) {
  const { getRecords, setRecords, setImportNotes, addLog } = fx;
  if (msg.type === 'PARSE_REFUSED') {
    const categories = msg.categories.map(category => ({ moleculeType: category === 'protein' ? 'protein' as const : 'dna' as const }));
    reportGenBankRefusal(fx, settle, msg, msg.categories, findSessionTypeConflict(getRecords(), categories));
    return;
  }

  const result = applyParseResponse(getRecords(), msg.records, msg.filename);
  if (result.kind === 'reject-session-type') {
    reportGenBankRefusal(fx, settle, msg, msg.records.map(r => r.moleculeType === 'protein' ? 'protein' : 'nucleotide'), result.conflict);
    return;
  }

  const assigned = result.next.slice(getRecords().length).map(r => r.id);
  const findings = (msg.findings ?? []).map(f => f.code === 'duplicate-locus' && f.record
    ? { ...f, message: `${f.record.name} was imported as ${assigned[f.record.index - 1]} because its LOCUS name is repeated.` } : f);
  setRecords(result.next);
  if (findings.length) {
    const file = { filename: msg.filename, findings, recordIds: assigned };
    setImportNotes(previous => [...previous, file]);
    addLog(importLog(file, false));
  }
  addLog(`Batch ingestion complete: ${result.count} records added.`);
  const exceptionWarning = msg.codeBreakNotices
    ? noticesWarning(msg.codeBreakNotices) : translationWarning(msg.records, { includeMismatches: false });
  if (exceptionWarning) addLog(exceptionWarning);
  const remoteWarning = remotePartsWarning(msg.records);
  if (remoteWarning) {
    addLog(remoteWarning);
    console.warn(remoteWarning);
  }
  settle({ ...msg, idMap: result.idMap });
}

function receiveAnnotations(msg: Extract<BioWorkerResponse, { type: 'ANNOTATIONS_SUCCESS' }>, fx: ImportEffects, settle: Settle) {
  const { optionsRef, addLog, setIsProcessing, setRecords } = fx;
  if (optionsRef.current.isAlignmentLocked?.()) {
    addLog('Annotations were not loaded: the workspace is locked');
    setIsProcessing(false);
    settle({ ...msg, annotations: {}, details: {} });
    return;
  }
  let annotationRefusal: string | undefined;
  setRecords(prev => {
    const { next, totalAdded, unmatched, warnings, refusal } = applyAnnotations(
      prev, msg.annotations, msg.details, msg.idMap, msg.originNotices,
    );
    if (refusal) { annotationRefusal = refusal; addLog(`ERROR: Annotation import refused: ${refusal}`); return prev; }
    logAttachedTranslationWarning(prev, next, addLog);
    for (const warning of warnings) addLog(`WARNING: ${warning}`);
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
  settle(msg, annotationRefusal);
}

function commitSequence(msg: SequenceResponse, fx: ImportEffects, settle: Settle, invalidReason: (msg: SequenceResponse) => string | undefined) {
  const { optionsRef, getRecords, setRecords, addLog } = fx;
  const invalid = invalidReason(msg);
  if (invalid) { addLog(`${msg.filename} was not loaded: ${invalid}`); settle(msg, invalid); return; }
  if (optionsRef.current.isAlignmentLocked?.()) { settle(refuse(msg, 'the workspace is locked', addLog)); return; }
  if (msg.type !== 'FASTA_SUCCESS') {
    commitGenBank(msg, fx, settle);
    return;
  }

  const result = applyFastaAndLog(getRecords(), msg.alignedData, msg.asAlignment, addLog, msg.filename);
  if (result.kind === 'reject-session-type') {
    optionsRef.current.onMismatch?.({ ...result.conflict, fileName: msg.filename });
    if (result.conflict.incoming === 'mixed') {
      settle(msg, new MixedFastaError(msg.filename, refusedFastaIds(msg.alignedData)));
      return;
    }
  }

  setRecords(result.next);
  settle(result.kind === 'batch' || result.kind === 'aligned-load'
    ? { ...msg, idMap: result.idMap } : result.kind === 'overlay' ? msg : { ...msg, idMap: refusedFastaIds(msg.alignedData) });
}

function refuse(msg: SequenceResponse, reason: string, addLog: ResponseEffects['addLog']) {
  addLog(`${msg.filename} was not loaded: ${reason}`);
  return { ...msg, idMap: msg.type === 'FASTA_SUCCESS' ? refusedFastaIds(msg.alignedData) : refusedGenBankIds(msg.records) };
}

function commitBioResponse(msg: Exclude<BioWorkerResponse, SequenceResponse>, fx: ImportEffects, settle: Settle) {
  const { setTransposedRecords, setConsensus, setIsProcessing, addLog } = fx;
  if (msg.type === 'ANNOTATIONS_SUCCESS') {
    receiveAnnotations(msg, fx, settle);
    return;
  }
  if (msg.type === 'ERROR') {
    setIsProcessing(false);
    addLog(`Processing Error: ${msg.error}`);
    settle(msg, new Error(msg.error));
    return;
  }
  setTransposedRecords(msg.records);
  for (const record of msg.records) for (const display of record.displayTracks ?? []) {
    if (display.unplaced.length) addLog(`Track ${display.track.name}: ${unplacedSummary(display)} (${display.unplaced.map(row => `${row.index + 1}: ${row.reason}`).join(', ')}).`);
  }
  setConsensus(msg.consensus);
  setIsProcessing(false);
  addLog(`Genomic processing complete. ${msg.records.length} records ready.`);
  settle(msg);
}

function receiveSequence(
  msg: SequenceResponse, fx: ImportEffects, settle: Settle,
  invalidReason: (msg: SequenceResponse) => string | undefined,
) {
  const { addLog, optionsRef, getRecords, confirmationCounter, queued, setPendingConfirmations, setIsProcessing } = fx;
  const invalid = invalidReason(msg);
  if (invalid) {
    addLog(`${msg.filename} was not loaded: ${invalid}`);
    settle(msg, invalid);
  } else if (msg.type === 'FASTA_SUCCESS' && !msg.asAlignment
    && !optionsRef.current.isAlignmentLocked?.()
    && msg.alignedData.some(row => /[-.]/.test(row.sequence))
    && msg.alignedData.every(row => row.sequence.replace(/[-.]/g, '').length > 0)
    && !findSessionTypeConflict(getRecords(), msg.alignedData)) {
    const token = ++confirmationCounter.current;
    queued.current.set(token, msg);
    setPendingConfirmations(previous => [...previous, { token, fileName: msg.filename,
      records: msg.alignedData.map(row => ({ id: row.id, removed: (row.sequence.match(/[-.]/g) ?? []).length })).filter(row => row.removed > 0) }]);
  } else commitSequence(msg, fx, settle, invalidReason);
  setIsProcessing(false);
}

/** Pairs worker replies with requests, holding a sequence reply until any gap choice settles. */
export function createBioResponseHandlers(fx: ImportEffects) {
  const { addLog, optionsRef, pendingRequests, queued, setPendingConfirmations, setImportNotes, setGenBankRefusals } = fx;
  const settle = (msg: BioWorkerResponse, error?: string | Error) => {
    if (msg.requestId === undefined) return;
    const pending = pendingRequests.current.get(msg.requestId);
    pendingRequests.current.delete(msg.requestId);
    if (error) pending?.reject(error instanceof Error ? error : new Error(error));
    else pending?.resolve(msg);
  };
  const invalidReason = (msg: SequenceResponse) => {
    const pending = msg.requestId === undefined ? undefined : pendingRequests.current.get(msg.requestId);
    if (pending?.shouldCommit && !pending.shouldCommit()
      || msg.workspaceRevision !== undefined && msg.workspaceRevision !== optionsRef.current.getWorkspaceRevision?.()) {
      return 'the workspace was replaced';
    }
    return undefined;
  };

  const confirmGapRemoval = (token: number, load: boolean) => {
    const msg = queued.current.get(token);
    if (!msg) return;
    queued.current.delete(token);
    setPendingConfirmations(previous => previous.filter(entry => entry.token !== token));
    if (load) commitSequence(msg, fx, settle, invalidReason);
    else settle(refuse(msg, 'gap removal declined', addLog));
  };
  const invalidateImports = (reason: string) => {
    if (reason === 'the workspace was replaced') { setImportNotes([]); setGenBankRefusals([]); }
    for (const msg of queued.current.values()) {
      addLog(`${msg.filename} was not loaded: ${reason}`);
      settle(msg, reason);
    }
    queued.current.clear();
    setPendingConfirmations([]);
  };

  const receive = (msg: BioWorkerResponse) => {
    const pending = msg.requestId === undefined ? undefined : pendingRequests.current.get(msg.requestId);
    if (msg.type === 'SUCCESS' && !pending) return;
    if (isSequenceResponse(msg)) {
      receiveSequence(msg, fx, settle, invalidReason);
      return;
    }
    if (pending?.shouldCommit && !pending.shouldCommit()) {
      pendingRequests.current.delete(msg.requestId!);
      pending.resolve('stale');
      return;
    }
    commitBioResponse(msg, fx, settle);
  };
  return { receive, invalidReason, confirmGapRemoval, invalidateImports, addLog, setIsProcessing: fx.setIsProcessing };
}

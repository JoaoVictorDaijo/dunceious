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

import type { SeqRecord } from '@/src/domain/bio/types';
import type { SessionTypeConflict } from '@/src/domain/bio';
import type { AnnotationsSuccessResponse, BioWorkerResponse, ParseFastaSuccessResponse, ParseGenBankSuccessResponse } from '@/src/workers/protocol';
import { applyParseResponse, applyAnnotations, applyFastaAndLog, sessionTypeConflictMessage, type GapRemoval } from '@/src/app/logic/bioResponse';

/** One FASTA file loaded as sequences whose records lost '-' gap characters. */
export interface GapNotice { fileName: string; records: GapRemoval[] }

/** A parsed file refused because its records would mix molecule categories in the workspace. */
export type SessionTypeNotice = SessionTypeConflict & { fileName: string };

/** The state writes a worker response may make; `getRecords` reads the live workspace. */
export interface ResponseEffects {
  getRecords: () => SeqRecord[];
  setRecords: (update: SeqRecord[] | ((prev: SeqRecord[]) => SeqRecord[])) => void;
  addLog: (message: string) => void;
  setTransposedRecords: (records: SeqRecord[]) => void;
  setConsensus: (consensus: string) => void;
  setIsProcessing: (value: boolean) => void;
  addGapNotice: (notice: GapNotice) => void;
  notifySessionType: (notice: SessionTypeNotice) => void;
}

/** A refused file fails its request, so a dropped batch attaches no annotations. */
const notLoaded = (msg: { requestId?: number; filename: string }): BioWorkerResponse =>
  ({ type: 'ERROR', requestId: msg.requestId, error: `${msg.filename} was not loaded.` });

function commitParse(msg: ParseGenBankSuccessResponse, fx: ResponseEffects): BioWorkerResponse {
  const result = applyParseResponse(fx.getRecords(), msg.records, msg.filename);
  if (result.kind === 'reject-session-type') {
    fx.addLog(sessionTypeConflictMessage(msg.filename, result.conflict));
    fx.notifySessionType({ ...result.conflict, fileName: msg.filename });
    return notLoaded(msg);
  }
  fx.setRecords(result.next);
  fx.addLog(`Batch ingestion complete: ${result.count} records added.`);
  return { ...msg, idMap: result.idMap };
}

function commitAnnotations(msg: AnnotationsSuccessResponse, fx: ResponseEffects): void {
  fx.setRecords(prev => {
    const { next, totalAdded, unmatched } = applyAnnotations(prev, msg.annotations, msg.details, msg.idMap);
    if (unmatched.length > 0) {
      fx.addLog(`WARNING: Some IDs in file did not match active records: [${unmatched.slice(0, 5).join(', ')}${unmatched.length > 5 ? '...' : ''}]`);
    }
    fx.addLog(`Annotation import complete: ${totalAdded} features added across records.`);
    return next;
  });
}

function commitFasta(msg: ParseFastaSuccessResponse, fx: ResponseEffects): BioWorkerResponse {
  const result = applyFastaAndLog(fx.getRecords(), msg.alignedData, msg.asAlignment, fx.addLog, msg.filename);
  fx.setRecords(result.next);
  if (result.kind === 'reject-session-type') {
    fx.notifySessionType({ ...result.conflict, fileName: msg.filename });
    return notLoaded(msg);
  }
  if (result.kind === 'reject-no-residues') return notLoaded(msg);
  if (result.kind !== 'batch') return msg;
  if (result.gapsRemoved.length > 0) fx.addGapNotice({ fileName: msg.filename, records: result.gapsRemoved });
  return { ...msg, idMap: result.idMap };
}

/** Commits one worker response to the workspace and returns the reply its request settles with. */
export function commitBioResponse(msg: BioWorkerResponse, fx: ResponseEffects): BioWorkerResponse {
  switch (msg.type) {
    case 'SUCCESS':
      fx.setTransposedRecords(msg.records);
      fx.setConsensus(msg.consensus);
      fx.setIsProcessing(false);
      fx.addLog(`Genomic processing complete. ${msg.records.length} records ready.`);
      return msg;
    case 'PARSE_SUCCESS': {
      const reply = commitParse(msg, fx);
      fx.setIsProcessing(false);
      return reply;
    }
    case 'ANNOTATIONS_SUCCESS':
      commitAnnotations(msg, fx);
      fx.setIsProcessing(false);
      return msg;
    case 'FASTA_SUCCESS': {
      const reply = commitFasta(msg, fx);
      fx.setIsProcessing(false);
      return reply;
    }
    case 'ERROR':
      fx.setIsProcessing(false);
      fx.addLog(`Processing Error: ${msg.error}`);
      return msg;
  }
}

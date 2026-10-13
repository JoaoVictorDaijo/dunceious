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

import { SeqRecord, BioFeature, QuantitativeTrack, DetailKey, SequenceDetails } from '@/src/domain/bio/types';
import { makeUniqueId } from '@/src/app/logic/idHelpers';
import { readDetails, writeDetails, isDetailEdited } from '@/src/domain/bio/details';
import type { GffSourceRegion } from '@/src/core/formats/gff3';
import type { BatchIdMap, FastaAlignedRecord } from '@/src/workers/protocol';

/**
 * The longest whitespace-bounded prefix of the FASTA header that names a loaded
 * record, else the parser's first-token ID. Exported headers keep IDs such as
 * "seq1 (1)" whole, and an external header may append a description after the ID.
 */
function resolveHeaderId(record: FastaAlignedRecord, currentIds: ReadonlySet<string>): string {
  const tokens = `${record.id} ${record.header ?? ''}`.trim().split(/\s+/);
  for (let end = tokens.length; end > 1; end--) {
    const candidate = tokens.slice(0, end).join(' ');
    if (currentIds.has(candidate)) return candidate;
  }
  return record.id;
}

/** Local identifiers are not database accessions. */
export function resolveAccession(incomingAccession: string | undefined): string | undefined {
  return incomingAccession?.trim() || undefined;
}

export function applyParseSuccess(
  prev: SeqRecord[], incoming: SeqRecord[], filename?: string,
): { next: SeqRecord[]; count: number; idMap: BatchIdMap } {
  const existingIds = prev.map(r => r.id);
  const idMap: BatchIdMap = Object.create(null);
  const newRecords = incoming.map(r => {
    const uniqueId = makeUniqueId(r.id, existingIds);
    existingIds.push(uniqueId);
    idMap[r.id] = Object.hasOwn(idMap, r.id) ? null : uniqueId;
    return {
      ...r, id: uniqueId, name: uniqueId,
      accession: resolveAccession(r.accession), visible: true,
      importedFrom: filename, fileDetails: readDetails(r),
    };
  });
  return { next: [...prev, ...newRecords], count: newRecords.length, idMap };
}

/** Batch ownership takes precedence over workspace aliases; ambiguous matches are refused. */
export function applyAnnotations(
  prev: SeqRecord[],
  annotations: Record<string, (BioFeature | QuantitativeTrack)[]>,
  details: Record<string, GffSourceRegion> = {},
  idMap?: BatchIdMap,
): { next: SeqRecord[]; totalAdded: number; unmatched: string[] } {
  let totalAdded = 0;
  const next = [...prev];
  const unmatched: string[] = [];
  for (const id of new Set([...Object.keys(annotations), ...Object.keys(details)])) {
    let matches: SeqRecord[];
    if (idMap && Object.hasOwn(idMap, id)) {
      matches = idMap[id] === null ? [] : prev.filter(r => r.id === idMap[id]);
    } else {
      matches = prev.filter(r => r.id === id);
      if (matches.length === 0) matches = prev.filter(r => r.name === id || r.accession === id);
    }
    if (matches.length !== 1) {
      unmatched.push(id);
      continue;
    }
    const index = prev.indexOf(matches[0]);
    let record = next[index];
    const items = [...(annotations[id] ?? [])];
    const candidate = details[id];
    if (candidate) {
      if (candidate.start === 0 && candidate.end === record.sequence.length) {
        const current = readDetails(record);
        const fills: SequenceDetails = {};
        for (const key of Object.keys(candidate.details) as DetailKey[]) {
          if (!current[key] && !isDetailEdited(record, key)) fills[key] = candidate.details[key];
        }
        if (Object.keys(fills).length > 0) record = writeDetails(record, fills);
      } else items.push(candidate.feature);
    }
    if (items.length > 0) {
      record = {
        ...record,
        features: [...record.features, ...items.filter((i): i is BioFeature => !('data' in i))],
        tracks: [...(record.tracks ?? []), ...items.filter((i): i is QuantitativeTrack => 'data' in i)],
      };
      totalAdded += items.length;
    }
    next[index] = record;
  }
  return { next, totalAdded, unmatched };
}

/** Alignment overlays change only aligned residues; batch loads capture file provenance. */
export function applyFastaResponse(
  prev: SeqRecord[],
  alignedData: FastaAlignedRecord[],
  asAlignment: boolean | undefined,
  filename?: string,
):
  | ({ next: SeqRecord[]; kind: 'batch'; count: number; idMap: BatchIdMap })
  | ({ next: SeqRecord[]; kind: 'overlay'; length: number })
  | ({ next: SeqRecord[]; kind: 'reject-mismatch'; missing: string[]; extra: string[] })
  | ({ next: SeqRecord[]; kind: 'reject-length'; lengths: number[] })
  | ({ next: SeqRecord[]; kind: 'reject-empty' }) {
  if (!asAlignment) {
    const incoming = alignedData.map(({ header: _header, details, ...r }) =>
      details && Object.keys(details).length > 0 ? writeDetails(r, details) : r);
    return { ...applyParseSuccess(prev, incoming, filename), kind: 'batch' };
  }

  const currentIds = new Set(prev.map(r => r.id));
  alignedData = alignedData.map(d => ({ ...d, id: resolveHeaderId(d, currentIds) }));
  const uploadedIds = new Set(alignedData.map(d => d.id));
  const missing = prev.filter(r => !uploadedIds.has(r.id)).map(r => r.id);
  const extra = alignedData.filter(d => !currentIds.has(d.id)).map(d => d.id);

  if (missing.length > 0 || extra.length > 0) {
    return { next: prev, kind: 'reject-mismatch', missing, extra };
  }

  if (alignedData.some(d => d.sequence.length === 0)) {
    return { next: prev, kind: 'reject-empty' };
  }

  const lengths = new Set(alignedData.map(d => d.sequence.length));
  if (lengths.size > 1) {
    return { next: prev, kind: 'reject-length', lengths: Array.from(lengths) };
  }

  const next = prev.map(r => {
    const match = alignedData.find(d => d.id === r.id);
    return { ...r, alignedSequence: match?.sequence };
  });
  return { next, kind: 'overlay', length: alignedData[0]?.sequence.length ?? 0 };
}

export function applyFastaAndLog(
  records: SeqRecord[], alignedData: FastaAlignedRecord[], asAlignment: boolean | undefined, addLog: (message: string) => void, filename?: string,
): ReturnType<typeof applyFastaResponse> {
  const result = applyFastaResponse(records, alignedData, asAlignment, filename);
  switch (result.kind) {
    case 'batch': addLog(`Batch ingestion complete: ${result.count} records added.`); break;
    case 'overlay': addLog(`External alignment applied successfully (${result.length} bp).`); break;
    case 'reject-mismatch': addLog(`ERROR: Sequence mismatch. Missing: [${result.missing.join(', ')}], Extra: [${result.extra.join(', ')}]`); break;
    case 'reject-length': addLog(`ERROR: Aligned sequences must have identical lengths. Found: ${result.lengths.join(', ')}`); break;
    case 'reject-empty': addLog('ERROR: Aligned sequences cannot be empty.'); break;
    default: {
      // Exhaustiveness guard: a new `kind` without a case is a compile error, and
      // an unhandled kind still logs instead of dropping silently.
      const _exhaustive: never = result;
      addLog(`ERROR: Unhandled FASTA response kind: ${JSON.stringify(_exhaustive)}`);
    }
  }
  return result;
}

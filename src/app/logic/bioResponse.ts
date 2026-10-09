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

import { SeqRecord, BioFeature, QuantitativeTrack } from '@/src/domain/bio/types';
import { makeUniqueId } from '@/src/app/logic/idHelpers';
import type { FastaAlignedRecord } from '@/src/workers/protocol';

/**
 * The longest whitespace-bounded prefix of the FASTA header that names a loaded
 * record, else the parser's first-token ID. Exported headers keep IDs such as
 * "seq1 (1)" whole, and an external header may append a description after the ID.
 */
function resolveHeaderId(record: FastaAlignedRecord, currentIds: ReadonlySet<string>): string {
  const tokens = record.header?.split(/\s+/) ?? [];
  for (let end = tokens.length; end > 1; end--) {
    const candidate = tokens.slice(0, end).join(' ');
    if (currentIds.has(candidate)) return candidate;
  }
  return record.id;
}

/** Accession precedence: trimmed incoming accession > incoming id (unless 'Unknown') > uniqueId. */
export function resolveAccession(
  incomingAccession: string | undefined,
  incomingId: string,
  uniqueId: string,
): string {
  const normalizedAccession = incomingAccession?.trim();
  if (normalizedAccession) return normalizedAccession;
  if (incomingId && incomingId !== 'Unknown') return incomingId;
  return uniqueId;
}

/** Batch-append parsed records with id dedup + accession resolution + visible:true. */
export function applyParseSuccess(
  prev: SeqRecord[],
  incoming: SeqRecord[],
): { next: SeqRecord[]; count: number } {
  const existingIds = prev.map(r => r.id);
  const newRecords = incoming.map(r => {
    const uniqueId = makeUniqueId(r.id, existingIds);
    existingIds.push(uniqueId);
    return {
      ...r,
      id: uniqueId,
      name: uniqueId,
      accession: resolveAccession(r.accession, r.id, uniqueId),
      visible: true,
    };
  });
  return { next: [...prev, ...newRecords], count: newRecords.length };
}

/** Merge annotation items into matching records, splitting features vs tracks by the `'data' in item` discriminant. */
export function applyAnnotations(
  prev: SeqRecord[],
  annotations: Record<string, (BioFeature | QuantitativeTrack)[]>,
): { next: SeqRecord[]; totalAdded: number; unmatched: string[] } {
  let totalAdded = 0;

  const lookupItems = (r: SeqRecord) =>
    annotations[r.id] ??
    annotations[r.name] ??
    (r.accession ? annotations[r.accession] : undefined) ??
    [];

  const next = prev.map(r => {
    const items = lookupItems(r);
    if (items.length > 0) {
      const newFeats = items.filter((i): i is BioFeature => !('data' in i));
      const newTracks = items.filter((i): i is QuantitativeTrack => 'data' in i);
      totalAdded += items.length;
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
  return { next, totalAdded, unmatched };
}

/**
 * FASTA_SUCCESS reducer. When !asAlignment: batch-append with dedup (like
 * applyParseSuccess but accession resolves from undefined). When asAlignment:
 * validate exact ID match (missing/extra), reject any overlay with an empty
 * sequence, and validate uniform length, then overlay alignedSequence onto
 * matching records.
 * Returns a discriminated `kind`.
 */
export function applyFastaResponse(
  prev: SeqRecord[],
  alignedData: FastaAlignedRecord[],
  asAlignment: boolean | undefined,
):
  | ({ next: SeqRecord[]; kind: 'batch'; count: number })
  | ({ next: SeqRecord[]; kind: 'overlay'; length: number })
  | ({ next: SeqRecord[]; kind: 'reject-mismatch'; missing: string[]; extra: string[] })
  | ({ next: SeqRecord[]; kind: 'reject-length'; lengths: number[] })
  | ({ next: SeqRecord[]; kind: 'reject-empty' }) {
  if (!asAlignment) {
    const existingIds = prev.map(r => r.id);
    const newRecords = alignedData.map(({ header: _header, ...r }) => {
      const uniqueId = makeUniqueId(r.id, existingIds);
      existingIds.push(uniqueId);
      return {
        ...r,
        id: uniqueId,
        name: uniqueId,
        accession: resolveAccession(undefined, r.id, uniqueId),
        visible: true,
      };
    });
    return { next: [...prev, ...newRecords], kind: 'batch', count: newRecords.length };
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
  records: SeqRecord[], alignedData: FastaAlignedRecord[], asAlignment: boolean | undefined, addLog: (message: string) => void,
): ReturnType<typeof applyFastaResponse> {
  const result = applyFastaResponse(records, alignedData, asAlignment);
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

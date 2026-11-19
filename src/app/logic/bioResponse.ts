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

import { malformedCodeBreakMessage, checkTranslation, translationWarning } from '@/src/domain/bio/translation';
import { SeqRecord, BioFeature, QuantitativeTrack, DetailKey, SequenceDetails } from '@/src/domain/bio/types';
import { makeUniqueId, sanitizeId } from '@/src/app/logic/idHelpers';
import { DETAIL_QUALIFIER, readDetails, writeDetails, isDetailEdited } from '@/src/domain/bio/details';
import { findSessionTypeConflict, isGappedCopyOf, type SessionTypeConflict } from '@/src/domain/bio/sequence';
import type { GffSourceRegion } from '@/src/core/formats/gff3';
import type { BatchIdMap, FastaAlignedRecord } from '@/src/workers/protocol';

const detailQualifiers = new Set([...Object.values(DETAIL_QUALIFIER), 'country', 'nat-host', 'collection-date']);

function readSourceLists(text: string | undefined): Record<string, unknown> {
  try {
    const lists: unknown = JSON.parse(text ?? '{}');
    return lists !== null && typeof lists === 'object' && !Array.isArray(lists) ? lists as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function mergeSourceRegion(record: SeqRecord, incoming: BioFeature, warnings: string[]): SeqRecord {
  const metadata = incoming.metadata ?? {};
  const bounds = incoming.segments?.[0];
  const qualifiers = Object.entries(metadata).filter(([key]) => !detailQualifiers.has(key) && key !== '_gffLists' && key !== '_gffNamespace');
  if (qualifiers.length === 0 && !bounds?.partialStart && !bounds?.partialEnd) return record;
  const updated = writeDetails(record, {});
  const sourceIndex = updated.features.findIndex(feature => feature.type === 'source');
  const source = updated.features[sourceIndex];
  const merged = { ...source.metadata };
  const lists = readSourceLists(source.metadata?._gffLists);
  const incomingLists = readSourceLists(metadata._gffLists);
  let listsAdded = false;
  for (const [key, value] of qualifiers) {
    if (Object.hasOwn(merged, key)) continue;
    merged[key] = value;
    if (key === 'ID' && metadata._gffNamespace !== undefined) merged._gffNamespace = metadata._gffNamespace;
    if (Object.hasOwn(incomingLists, key) && !Object.hasOwn(lists, key)) {
      lists[key] = incomingLists[key];
      listsAdded = true;
    }
  }
  if (listsAdded) merged._gffLists = JSON.stringify(lists);
  let keptStart = false;
  let keptEnd = false;
  const features = updated.features.map((feature, index) => {
    if (feature.type !== 'source') return feature;
    const parts = feature.segments?.length || feature.remoteParts?.length
      ? feature.segments ?? [] : [{ start: feature.start, end: feature.end }];
    const segments = parts.map(part => {
      const matchStart = bounds?.partialStart && part.start === bounds.start;
      const matchEnd = bounds?.partialEnd && part.end === bounds.end;
      keptStart ||= Boolean(matchStart);
      keptEnd ||= Boolean(matchEnd);
      const markStart = matchStart && !part.partialStart;
      const markEnd = matchEnd && !part.partialEnd;
      const startRange = matchStart && !part.gffStartRange && bounds.gffStartRange;
      const endRange = matchEnd && !part.gffEndRange && bounds.gffEndRange;
      if (!markStart && !markEnd && !startRange && !endRange) return part;
      return { ...part,
        ...(markStart && { partialStart: true as const }),
        ...(markEnd && { partialEnd: true as const }),
        ...(startRange && { gffStartRange: startRange }),
        ...(endRange && { gffEndRange: endRange }),
      };
    });
    const segmentsChanged = segments.some((part, i) => part !== parts[i]);
    if (!segmentsChanged && index !== sourceIndex) return feature;
    const marksChanged = segments.some((part, i) => part.partialStart !== parts[i].partialStart || part.partialEnd !== parts[i].partialEnd);
    return { ...feature, ...(index === sourceIndex && { metadata: merged }), ...(segmentsChanged && { segments }),
      ...(marksChanged && { locationString: undefined }) };
  });
  if (bounds?.partialStart && !keptStart) warnings.push(`${record.id}: Open source region start at base ${bounds.start + 1} could not be kept because no source interval starts there.`);
  if (bounds?.partialEnd && !keptEnd) warnings.push(`${record.id}: Open source region end at base ${bounds.end} could not be kept because no source interval ends there.`);
  return { ...updated, features };
}

/** A GFF3 attachment adds its own ID namespace to the target record. */
function annotationNamespace(record: SeqRecord): string {
  const occupied = new Set(record.features.map(feature => feature.metadata?._gffNamespace));
  let namespace = 1;
  while (occupied.has(String(namespace))) namespace++;
  return String(namespace);
}

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

/**
 * One warning per file naming the annotations with intervals in other records (INSDC FT 11.4
 * §3.4.2.1(e)), whose sequence Dunceious doesn't load or show (#245).
 */
export function remotePartsWarning(records: SeqRecord[]): string | null {
  const remote = records.flatMap(record => record.features).filter(feature => feature.remoteParts?.length);
  if (remote.length === 0) return null;
  const names = remote.map(feature => `${feature.name}: ${[...new Set(feature.remoteParts!.map(part => part.accession))].join(', ')}`).join('; ');
  const count = remote.length === 1 ? '1 annotation has intervals' : `${remote.length} annotations have intervals`;
  return `WARNING: ${count} in other records, which Dunceious doesn't load (${names}). Their sequence and translation aren't shown.`;
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

function topologyRefusal(
  id: string, record: SeqRecord, items: (BioFeature | QuantitativeTrack)[], source?: BioFeature,
): string | undefined {
  if (record.isCircular) return undefined;
  const landmark = [source, ...items].some(feature => feature && !('data' in feature)
    && (feature.type === 'region' || feature.type === 'SO:0000001')
    && feature.start === 0 && feature.end === record.sequence.length && feature.metadata?.Is_circular === 'true');
  if (landmark) return `GFF3 landmark ${id} declares Is_circular=true, but sequence ${record.id} is linear.`;
  const wrapped = items.find((item): item is BioFeature => !('data' in item)
    && (item.start > item.end || !!item.segments?.some(part => part.start > part.end)));
  if (wrapped) return `GFF3 landmark ${id} has a wrapped feature ${wrapped.name}, but sequence ${record.id} is linear.`;
}

/** Appends parsed sequence records after the workspace's molecule-category check (`findSessionTypeConflict`). */
export function applyParseResponse(prev: SeqRecord[], incoming: SeqRecord[], filename?: string):
  | ({ kind: 'batch' } & ReturnType<typeof applyParseSuccess>)
  | { next: SeqRecord[]; kind: 'reject-session-type'; conflict: SessionTypeConflict } {
  const conflict = findSessionTypeConflict(prev, incoming);
  if (conflict) return { next: prev, kind: 'reject-session-type', conflict };
  return { kind: 'batch', ...applyParseSuccess(prev, incoming, filename) };
}

const categoryLabel = (category: 'nucleotide' | 'protein') => category === 'protein' ? 'peptide' : 'nucleotide';

export function sessionTypeConflictMessage(filename: string | undefined, conflict: SessionTypeConflict): string {
  const file = filename ?? 'The file';
  if (conflict.incoming === 'mixed') return `ERROR: ${file} was not loaded: it mixes nucleotide and peptide records, and a workspace holds one molecule type.`;
  return `ERROR: ${file} was not loaded: its ${categoryLabel(conflict.incoming)} records do not match the ${categoryLabel(conflict.loaded!)} workspace.`;
}

/** Batch ownership takes precedence over workspace aliases; ambiguous matches are refused. */
export function applyAnnotations(
  prev: SeqRecord[],
  annotations: Record<string, (BioFeature | QuantitativeTrack)[]>,
  details: Record<string, GffSourceRegion> = {},
  idMap?: BatchIdMap,
): { next: SeqRecord[]; totalAdded: number; unmatched: string[]; warnings: string[]; refusal?: string } {
  let totalAdded = 0;
  const next = [...prev];
  const unmatched: string[] = [];
  const warnings: string[] = [];
  for (const id of new Set([...Object.keys(annotations), ...Object.keys(details)])) {
    let matches: SeqRecord[];
    if (idMap && Object.hasOwn(idMap, id)) {
      matches = idMap[id] === null ? [] : prev.filter(r => r.id === idMap[id]);
    } else {
      matches = prev.filter(r => r.id === id);
      if (matches.length === 0) matches = prev.filter(r => r.name === id || r.accession === id);
      if (matches.length === 0) matches = prev.filter(r => r.id === sanitizeId(id));
    }
    if (matches.length !== 1) {
      unmatched.push(id);
      continue;
    }
    const index = prev.indexOf(matches[0]);
    let record = next[index];
    const namespace = annotationNamespace(record);
    const withNamespace = (feature: BioFeature): BioFeature => {
      const metadata = feature.metadata;
      return metadata && (metadata.ID || metadata.Parent || metadata.Derives_from)
        ? { ...feature, metadata: { ...metadata, _gffNamespace: namespace } }
        : feature;
    };
    const items = (annotations[id] ?? []).map(item => !('data' in item) && item.metadata?._gffPhases !== undefined ? withNamespace(item) : item);
    const source = details[id];
    const candidate = source && { ...source, feature: withNamespace(source.feature) };
    const conflict = topologyRefusal(id, record, items, candidate?.feature);
    if (conflict) return { next: prev, totalAdded: 0, unmatched: [], warnings: [], refusal: conflict };
    if (candidate) {
      if (candidate.start === 0 && candidate.end === record.sequence.length) {
        const current = readDetails(record);
        const fills: SequenceDetails = {};
        for (const key of Object.keys(candidate.details) as DetailKey[]) {
          if (!current[key] && !isDetailEdited(record, key)) fills[key] = candidate.details[key];
        }
        if (Object.keys(fills).length > 0) {
          const fileDetails = { ...record.fileDetails };
          for (const key of Object.keys(fills) as DetailKey[]) {
            if (!fileDetails[key]) fileDetails[key] = fills[key];
          }
          record = { ...writeDetails(record, fills), fileDetails };
        }
        record = mergeSourceRegion(record, candidate.feature, warnings);
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
    for (const item of items) {
      if ('data' in item) continue;
      const refusal = malformedCodeBreakMessage(item, record);
      if (refusal) return { next: prev, totalAdded: 0, unmatched: [], warnings: [], refusal };
    }
    next[index] = { ...record, features: record.features.map(f => prev[index].features.includes(f) ? f : checkTranslation(f, record)) };
  }
  return { next, totalAdded, unmatched, warnings };
}

export class MixedFastaError extends Error {
  constructor(filename: string, readonly idMap: BatchIdMap) {
    super(`${filename} was not loaded.`);
  }
}

/** A record loaded as a sequence whose gap characters were removed, by workspace ID. */
export interface GapRemoval { id: string; removed: number }

/**
 * Alignment overlays change only aligned residues; batch loads capture file provenance.
 * A batch load removes '-' and '.' so a stored sequence holds residues only, as NCBI does for
 * sequences outside an alignment ("do not use "?" or "-" characters. These will be
 * stripped from the sequence.", https://www.ncbi.nlm.nih.gov/genbank/fastaformat/).
 * The removals are reported; a file with a record left without residues is refused whole.
 * A batch whose records break the workspace's single molecule category is refused whole.
 * An overlay row must hold its record's loaded residues once '-' is removed from both,
 * ignoring ASCII case (`isGappedCopyOf`); '.' is refused rather than read as a residue or a gap.
 * Each record appears once, as the remote-result check (`remapAlignment`) also requires.
 */
export function applyFastaResponse(
  prev: SeqRecord[],
  alignedData: FastaAlignedRecord[],
  asAlignment: boolean | undefined,
  filename?: string,
):
  | ({ next: SeqRecord[]; kind: 'batch' | 'aligned-load'; length?: number; count: number; idMap: BatchIdMap; gapsRemoved: GapRemoval[] })
  | ({ next: SeqRecord[]; kind: 'reject-no-residues'; ids: string[] })
  | ({ next: SeqRecord[]; kind: 'reject-session-type'; conflict: SessionTypeConflict })
  | ({ next: SeqRecord[]; kind: 'reject-duplicate'; ids: string[] })
  | ({ next: SeqRecord[]; kind: 'overlay'; length: number })
  | ({ next: SeqRecord[]; kind: 'reject-mismatch'; missing: string[]; extra: string[] })
  | ({ next: SeqRecord[]; kind: 'reject-length'; lengths: number[] })
  | ({ next: SeqRecord[]; kind: 'reject-empty' })
  | ({ next: SeqRecord[]; kind: 'reject-dot-gap'; ids: string[] })
  | ({ next: SeqRecord[]; kind: 'reject-residues'; ids: string[] }) {
  if (!asAlignment) {
    const residues = alignedData.map(d => d.sequence.replace(/[-.]/g, ''));
    const empty = alignedData.filter((_, i) => residues[i].length === 0).map(d => d.id);
    if (empty.length > 0) return { next: prev, kind: 'reject-no-residues', ids: empty };
    const conflict = findSessionTypeConflict(prev, alignedData);
    if (conflict) return { next: prev, kind: 'reject-session-type', conflict };
    // Ungap before writeDetails so the generated source feature spans residues only.
    const incoming = alignedData.map(({ header: _header, details, ...r }, i) => {
      const record = { ...r, sequence: residues[i] };
      return details && Object.keys(details).length > 0 ? writeDetails(record, details) : record;
    });
    const loaded = applyParseSuccess(prev, incoming, filename);
    const added = loaded.next.slice(prev.length);
    const gapsRemoved = alignedData
      .map((d, i) => ({ id: added[i].id, removed: d.sequence.length - residues[i].length }))
      .filter(gap => gap.removed > 0);
    return { ...loaded, kind: 'batch', gapsRemoved };
  }

  if (prev.length === 0) {
    if (alignedData.length === 0 || alignedData.some(d => !d.sequence.length)) return { next: prev, kind: 'reject-empty' };
    const lengths = [...new Set(alignedData.map(d => d.sequence.length))];
    if (lengths.length > 1) return { next: prev, kind: 'reject-length', lengths };
    const dots = alignedData.filter(d => d.sequence.includes('.')).map(d => d.id);
    if (dots.length) return { next: prev, kind: 'reject-dot-gap', ids: dots };
    const empty = alignedData.filter(d => !d.sequence.replace(/-/g, '').length).map(d => d.id);
    if (empty.length) return { next: prev, kind: 'reject-no-residues', ids: empty };
    const result = applyFastaResponse(prev, alignedData, false, filename);
    if (result.kind !== 'batch') return result;
    return { ...result, kind: 'aligned-load', length: lengths[0],
      next: result.next.map((record, i) => ({ ...record, alignedSequence: alignedData[i].sequence })) };
  }

  const currentIds = new Set(prev.map(r => r.id));
  alignedData = alignedData.map(d => ({ ...d, id: resolveHeaderId(d, currentIds) }));
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const d of alignedData) (seen.has(d.id) ? repeated : seen).add(d.id);
  if (repeated.size > 0) return { next: prev, kind: 'reject-duplicate', ids: [...repeated] };
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

  const dotGapIds = alignedData.filter(d => d.sequence.includes('.')).map(d => d.id);
  if (dotGapIds.length > 0) return { next: prev, kind: 'reject-dot-gap', ids: dotGapIds };

  const loaded = new Map(prev.map(r => [r.id, r.sequence]));
  const changedIds = alignedData.filter(d => !isGappedCopyOf(d.sequence, loaded.get(d.id)!)).map(d => d.id);
  if (changedIds.length > 0) return { next: prev, kind: 'reject-residues', ids: changedIds };

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
    case 'aligned-load': addLog(`Loaded ${result.count} aligned sequences (${result.length} columns) from ${filename ?? 'the FASTA file'}`); break;
    case 'batch': {
      addLog(`Batch ingestion complete: ${result.count} records added.`);
      const gaps = result.gapsRemoved;
      if (gaps.length > 0) {
        addLog(`Removed alignment gaps ("${alignedData.some(d => d.sequence.includes('.')) ? '- and .' : '-'}") from ${gaps.length} record${gaps.length === 1 ? '' : 's'} in ${filename ?? 'the FASTA file'}: ${gaps.map(gap => `${gap.id} (${gap.removed})`).join(', ')}.`);
      }
      break;
    }
    case 'reject-session-type': addLog(sessionTypeConflictMessage(filename, result.conflict)); break;
    case 'reject-duplicate': addLog(`ERROR: Each record may appear only once in an alignment; repeated: [${result.ids.join(', ')}]`); break;
    case 'reject-no-residues': addLog(`ERROR: ${filename ?? 'The FASTA file'} was not loaded: records with no residues: [${result.ids.join(', ')}].`); break;
    case 'overlay': addLog(`External alignment applied successfully (${result.length} columns).`); break;
    case 'reject-mismatch': addLog(`ERROR: Sequence mismatch. Missing: [${result.missing.join(', ')}], Extra: [${result.extra.join(', ')}]. Unaligned missing IDs: [${records.filter(r => !r.alignedSequence && result.missing.includes(r.id)).map(r => r.id).join(', ')}]`); break;
    case 'reject-length': addLog(`ERROR: Aligned sequences must have identical lengths. Found: ${result.lengths.join(', ')}`); break;
    case 'reject-empty': addLog('ERROR: Aligned sequences cannot be empty.'); break;
    case 'reject-dot-gap': addLog(`ERROR: Alignment gaps must be written as "-"; "." found in: [${result.ids.join(', ')}]`); break;
    case 'reject-residues': addLog(`ERROR: Aligned residues differ from the loaded sequence ("-" removed from both, case ignored): [${result.ids.join(', ')}]`); break;
    default: {
      // Exhaustiveness guard: a new `kind` without a case is a compile error, and
      // an unhandled kind still logs instead of dropping silently.
      const _exhaustive: never = result;
      addLog(`ERROR: Unhandled FASTA response kind: ${JSON.stringify(_exhaustive)}`);
    }
  }
  return result;
}

/** One file warning counts only the annotations introduced by this attachment. */
export function logAttachedTranslationWarning(previous: SeqRecord[], next: SeqRecord[], addLog: (message: string) => void): void {
  const attached = next.map(r => ({ ...r, features: r.features.filter(f => !previous.find(p => p.id === r.id)?.features.includes(f)) }));
  const warning = translationWarning(attached);
  if (warning) addLog(warning);
}

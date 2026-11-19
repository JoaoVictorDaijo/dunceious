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

import { featureParts, projectGffRange, splitFeaturePart, splitWrapAround, storedLocalParts } from './featureParts';
import type { SelectionArea, SelectionLoss } from './types';
import { conceptualTranslation, isCds, geometryCodeBreakEvidence, removeChangedProteinId, translationReason } from './translation';
import { validCodonStart } from './codonStart';
import type { FeatureSegment, BioFeature, RemotePart, SeqRecord } from './types';
import { isBetweenBasesSite, isOrderLocation, SINGLE_ORDER_CDS_OMISSION } from './locationFlags';
import { expandedRemoteParts, expandedWrittenOrder, keptWrittenOrder } from './featureEnvelope';
import { proteinBondEndpoints } from './proteinBond';

export { splitWrapAround } from './featureParts';

/**
 * Clips an interval `[start, end)` to fit within the bounds `[min, max)`.
 *
 * Returns `null` when the interval does not overlap the clipping bounds at
 * all (i.e., `end <= min` or `start >= max`).
 */
export const clipInterval = (
  start: number,
  end: number,
  min: number,
  max: number
): FeatureSegment | null => {
  const clippedStart = Math.max(start, min);
  const clippedEnd = Math.min(end, max);

  if (clippedStart >= clippedEnd) return null;

  return { start: clippedStart, end: clippedEnd };
};

/**
 * Given a list of segments and a viewport `[viewStart, viewEnd)`, returns
 * only the portions of those segments that fall within the viewport.
 *
 * Segments that lie entirely outside the viewport are omitted.
 */
export const clipSegments = (
  segments: FeatureSegment[],
  viewStart: number,
  viewEnd: number
): FeatureSegment[] => {
  const result: FeatureSegment[] = [];

  for (const seg of segments) {
    const clipped = clipInterval(seg.start, seg.end, viewStart, viewEnd);
    if (clipped !== null) {
      result.push(clipped);
    }
  }

  return result;
};

// ---------------------------------------------------------------------------
// Selection-export helpers
// ---------------------------------------------------------------------------

type TrackDataItem = { start: number; end: number; value: number };

/**
 * Clips a single half-open `[start, end)` interval to the selection window
 * `[selStart, selEnd)` and rebases the result to selection-local coordinates.
 * Returns `null` when there is no overlap or the clipped interval is zero-length.
 */
export function clipAndRebaseInterval(
  start: number,
  end: number,
  selStart: number,
  selEnd: number
): FeatureSegment | null {
  if (!(start < selEnd && end > selStart)) return null;
  const length = Math.max(0, selEnd - selStart);
  const out: FeatureSegment = {
    start: Math.max(0, start - selStart),
    end: Math.min(length, end - selStart),
  };
  return out.end > out.start ? out : null;
}

/** INSDC FT 11.4 §3.4.2.1: an origin site adjoins the record's last and first bases. */
function siteNeighboursSelected(boundary: number, length: number, circular: boolean, selStart: number, selEnd: number): boolean {
  const left = boundary === 0 && circular ? length - 1 : boundary - 1;
  const right = boundary === length && circular ? 0 : boundary;
  return left >= 0 && right < length && left >= selStart && left < selEnd && right >= selStart && right < selEnd;
}

function projectClippedPart(segment: FeatureSegment, clipped: FeatureSegment, selStart: number, selEnd: number): FeatureSegment {
  const { gffStartRange, gffEndRange, ...part } = segment;
  const retained = clipped.start !== segment.start || clipped.end !== segment.end ? clipped : undefined;
  const startRange = projectGffRange(gffStartRange, clipped.start + selStart, -selStart, retained);
  const endRange = projectGffRange(gffEndRange, clipped.end + selStart, -selStart, retained);
  return { ...part, ...clipped,
    ...(segment.start < selStart && { partialStart: true as const }),
    ...(segment.end > selEnd && { partialEnd: true as const }),
    ...(startRange && { gffStartRange: startRange }),
    ...(endRange && { gffEndRange: endRange }),
  };
}

/**
 * Clips a `BioFeature` (including its `segments` array) to the selection window
 * and rebases all coordinates to be selection-local.
 * Returns `null` when the feature does not overlap the selection at all.
 */
function clipFeature(
  feature: BioFeature,
  seq: string,
  selStart: number,
  selEnd: number,
  circular: boolean,
): BioFeature | null {
  if (isBetweenBasesSite(feature)) {
    // A site lies between two bases (LOC-5); it stays only when both of them are selected.
    if (!siteNeighboursSelected(feature.start, seq.length, circular, selStart, selEnd)) return null;
    const boundary = feature.start - selStart;
    const result = { ...feature, start: boundary, end: boundary, segments: [{ start: boundary, end: boundary }] };
    if (boundary !== feature.start) delete result.locationString;
    return result;
  }
  const segments = feature.segments?.length || feature.remoteParts?.length
    ? featureParts(feature, { length: seq.length, isCircular: circular })
    : splitWrapAround(feature.start, feature.end, seq.length);
  const kept: number[] = [];
  const newSegments = segments.flatMap((segment, i) => {
    const clipped = segment.start === segment.end
      ? siteNeighboursSelected(segment.start, seq.length, circular, selStart, selEnd) ? { start: segment.start - selStart, end: segment.end - selStart } : null
      : clipAndRebaseInterval(segment.start, segment.end, selStart, selEnd);
    if (!clipped) return [];
    kept.push(i);
    return [projectClippedPart(segment, clipped, selStart, selEnd)];
  });
  if (!newSegments.length) return null;
  // INSDC FT 11.4 §3.4.2.2: the first/last visit, not the genomic envelope, defines each end.
  const perPart = segments.some(part => part.strand !== undefined);
  const order = segments.flatMap((part, i) => part.start < part.end ? [i] : []);
  if (!perPart && feature.strand === -1) order.reverse();
  const selected = order.filter(i => kept.includes(i));
  for (const first of [true, false]) {
    const index = first ? selected[0] : selected.at(-1);
    if (index === undefined) continue;
    const original = segments[index];
    const retained = newSegments[kept.indexOf(index)];
    const reverse = (original.strand ?? feature.strand) === -1;
    const key = first !== reverse ? 'partialStart' : 'partialEnd';
    const coordinate = key === 'partialStart' ? 'start' : 'end';
    if (index !== (first ? order[0] : order.at(-1)) || retained[coordinate] + selStart !== original[coordinate]) retained[key] = true;
  }

  const result: BioFeature = {
    ...feature,
    ...(isOrderLocation(feature) && { operator: 'order' }),
    start: Math.min(...newSegments.map(segment => segment.start)),
    end: Math.max(...newSegments.map(segment => segment.end)),
    // A segment that gained a cut-end marker must be kept, or the marker is lost with it (LOC-4).
    segments: feature.segments?.length || feature.start > feature.end || newSegments.some(s => s.partialStart || s.partialEnd)
      ? newSegments : undefined,
  };
  if (feature.remoteParts?.length) result.remoteParts = keptRemoteParts(feature.remoteParts, segments.length, kept);
  const clipped = segments.some(segment => segment.start < segment.end && (segment.start < selStart || segment.end > selEnd));
  if (selStart !== 0 || clipped || kept.length !== segments.length || result.start !== feature.start || result.end !== feature.end) {
    delete result.locationString;
  }
  if (!result.locationString) {
    const writtenOrder = keptWrittenOrder(feature.writtenOrder, kept);
    if (writtenOrder) result.writtenOrder = writtenOrder;
    else delete result.writtenOrder;
  }
  if (!clipped) return result;
  if (feature.metadata) {
    result.metadata = { ...feature.metadata };
    delete result.metadata.translation;
    delete result.metadata._gffPhases;
    delete result.metadata._gffPhaseState;
    delete result.metadata.phase;
  }
  if (isCds(feature)) {
    const removed = removedTranscriptionBases(segments, feature.strand, seq, selStart, selEnd);
    const codonStart = Number(feature.metadata?.codon_start ?? 1);
    const offset = [1, 2, 3].includes(codonStart) ? codonStart - 1 : 0;
    if (validCodonStart(feature.metadata?.codon_start)) result.metadata = { ...result.metadata, codon_start: String(((offset - removed) % 3 + 3) % 3 + 1) };
  }
  return result;
}

/**
 * Remote parts keep their own coordinates (another entry's), and their place among the stored
 * intervals moves up past each local interval the selection dropped before them.
 */
export function keptRemoteParts(parts: RemotePart[], localCount: number, kept: number[]): RemotePart[] {
  const stored: (number | RemotePart)[] = Array.from({ length: localCount }, (_, i) => i);
  for (const part of [...parts].sort((a, b) => a.index - b.index)) stored.splice(Math.min(part.index, stored.length), 0, part);
  const remaining = stored.filter(item => typeof item !== 'number' || kept.includes(item));
  return remaining.flatMap((item, index) => (typeof item === 'number' ? [] : [{ ...item, index }]));
}

/** Counts only biological bases preceding the first selected part in transcription order. */
function removedTranscriptionBases(
  segments: FeatureSegment[],
  strand: 1 | -1,
  seq: string,
  selStart: number,
  selEnd: number
): number {
  const mixed = segments.some(segment => segment.strand !== undefined);
  const ordered = !mixed && strand === -1 ? [...segments].reverse() : segments;
  let removed = 0;
  for (const segment of ordered) {
    const reverse = mixed ? segment.strand === -1 : strand === -1;
    const overlap = clipInterval(segment.start, segment.end, selStart, selEnd);
    const start = overlap && !reverse ? overlap.start : segment.end;
    const end = overlap && reverse ? overlap.end : segment.start;
    const prefix = reverse ? seq.slice(end, segment.end) : seq.slice(segment.start, start);
    removed += prefix.replace(/-/g, '').length;
    if (overlap) break;
  }
  return removed;
}

/** Splitting a stored wrap also expands its positions in written order and among remote parts. */
function selectionGeometry(feature: BioFeature, length: number, isCircular: boolean): BioFeature {
  const stored = storedLocalParts(feature);
  if (!isCircular || !stored?.some(part => part.start > part.end)) {
    return stored === feature.segments ? feature : { ...feature, segments: stored };
  }
  const expanded = stored.map(part => splitFeaturePart(part, { length, isCircular }));
  const writtenOrder = expandedWrittenOrder(feature.writtenOrder, stored, expanded);
  const remoteParts = expandedRemoteParts(feature.remoteParts ?? [], expanded);
  return { ...feature, segments: expanded.flat(), writtenOrder,
    ...(feature.remoteParts && { remoteParts }) };
}

/**
 * Slices all records to the selection window `[selStart, selEnd)`, rebasing
 * feature/segment coordinates and filtering zero-length track intervals.
 */
export function sliceRecordsBySelection(
  records: SeqRecord[],
  selStart: number,
  selEnd: number
): { records: SeqRecord[]; losses: SelectionLoss[] } {
  const losses: SelectionLoss[] = [];
  const sliced = records.map(record => {
    const seq = record.alignedSequence || record.sequence;
    const slicedSeq = seq.substring(Math.max(0, selStart), Math.min(seq.length, selEnd));
    const unchangedCircle = record.isCircular === true && slicedSeq === record.sequence && selStart <= 0 && selEnd >= seq.length;
    const selectedRecord = { ...record, sequence: slicedSeq, isCircular: unchangedCircle };

    const slicedFeatures = record.features
      .map(original => {
        if (record.moleculeType === 'protein' && original.locationString) {
          const endpoints = proteinBondEndpoints(original.locationString);
          if (endpoints) {
            const offset = Math.max(0, selStart);
            if (endpoints.some(point => point <= offset || point > Math.min(selEnd, seq.length))) {
              losses.push({ ...selectionFeature(record, original), reason: `Bond ${original.locationString} omitted because every endpoint must be selected` });
              return null;
            }
            if (offset === 0) return original;
            const rebased = endpoints.map(point => point - offset);
            const segment = { start: rebased[0] - 1, end: rebased[0] };
            return { ...original, ...segment, segments: [segment], locationString: `bond(${rebased.join(',')})` };
          }
        }
        if (unchangedCircle) {
          const stored = original.segments?.length ? original.segments : [original];
          // A wrap with an empty origin-side piece is a single linear interval (LOC-6).
          const hasEmptyWrapPiece = stored.some(part => part.start > part.end && (part.start === seq.length || part.end === 0));
          if (!hasEmptyWrapPiece) return original;
        }
        const feature = selectionGeometry(original, seq.length, record.isCircular === true);
        const result = clipFeature(feature, seq, selStart, selEnd, record.isCircular === true);
        const loss = selectionFeature(record, feature);
        const parts = featureParts(feature, { length: seq.length, isCircular: record.isCircular });
        for (const part of parts) {
          if (part.start === part.end && !siteNeighboursSelected(part.start, seq.length, record.isCircular === true, selStart, selEnd)) {
            losses.push({ ...loss, reason: 'Between-base site omitted; both neighbouring bases must be selected' });
          }
        }
        if (!result) return null;
        const remoteCount = feature.remoteParts?.length ?? 0;
        if (isCds(feature) && isOrderLocation(feature) && parts.length + remoteCount > 1
          && result.segments?.length === 1 && remoteCount === 0) {
          losses.push({ ...loss, reason: SINGLE_ORDER_CDS_OMISSION });
          return null;
        }
        const clipped = parts.some(part => part.start < part.end && (part.start < selStart || part.end > selEnd));
        if (clipped && isCds(feature)) losses.push({ ...loss, reason: 'CDS clipped; annotation continues beyond the selection' });
        if (feature.translationExceptions) result.translationExceptions = selectedCodeBreaks(feature, record, result, selectedRecord, { start: selStart, end: selEnd }, losses);
        if (result.metadata) { result.metadata = { ...result.metadata }; delete result.metadata._translationCheck; }
        if (clipped && isCds(result)) {
          const product = conceptualTranslation(result, selectedRecord);
          result.metadata = { ...result.metadata, _translationSource: product.status === 'ok' && !product.internalStops.length ? 'computed' : 'removed' };
          if (product.status === 'ok' && !product.internalStops.length) {
            result.metadata.translation = product.residues;
            result.metadata._translationMessage = 'Translation recomputed after selection clipping';
          } else {
            delete result.metadata.translation;
            result.metadata._translationMessage = `Translation removed after selection clipping: ${translationReason(product, result)}`;
          }
          const notice = removeChangedProteinId(original, result, record);
          if (notice) losses.push({ ...loss, reason: notice });
        }
        return result;
      })
      .filter((f): f is BioFeature => f !== null);

    const slicedTracks = record.tracks?.map(track => ({
      ...track,
      data: track.data
        .map(d => {
          const clippedInterval = clipAndRebaseInterval(d.start, d.end, selStart, selEnd);
          return clippedInterval ? { ...d, ...clippedInterval } : null;
        })
        .filter((d): d is TrackDataItem => d !== null),
    }));

    return {
      ...record,
      sequence: slicedSeq,
      alignedSequence: undefined,
      features: slicedFeatures,
      tracks: slicedTracks,
    };
  });
  return { records: sliced, losses };
}

function selectionFeature(record: SeqRecord, feature: BioFeature): Pick<SelectionLoss, 'record' | 'feature' | 'key'> {
  return { record: record.id, feature: feature.name, key: feature.type };
}

function selectedCodeBreaks(
  feature: BioFeature,
  record: SeqRecord,
  selectedFeature: BioFeature,
  selectedRecord: SeqRecord,
  selection: Pick<SelectionArea, 'start' | 'end'>,
  losses: SelectionLoss[],
): string[] {
  const loss = selectionFeature(record, feature);
  const candidates = geometryCodeBreakEvidence(feature, record, selection).flatMap(source => {
    if (source.status === 'applied') return [{ source, value: source.rebased! }];
    losses.push({ ...loss, occurrence: source.occurrence, raw: source.raw, reason: source.reason ?? source.status });
    return source.status === 'dropped' ? [] : [{ source, value: source.raw }];
  });
  const evaluated = geometryCodeBreakEvidence({ ...selectedFeature, translationExceptions: candidates.map(item => item.value) }, selectedRecord);
  return candidates.flatMap(({ source, value }, index) => {
    const transformed = evaluated[index];
    // Surviving bases can cease to be a codon when clipping removes other visits in a multipart CDS.
    if (source.status === 'applied' && transformed.status !== 'applied') {
      losses.push({ ...loss, occurrence: source.occurrence, raw: source.raw, reason: transformed.reason ?? transformed.status });
      return [];
    }
    return [value];
  });
}

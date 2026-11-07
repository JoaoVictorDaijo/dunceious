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

import { checkTranslation, conceptualTranslation, isCds, translationReason, geometryCodeBreakEvidence } from '@/src/domain/bio/translation';
import { codeBreakMessage, transformCodeBreak } from '@/src/domain/bio/translationExceptions';
import { invalidLocationPart } from '@/src/domain/bio/featureParts';
import { getFeatureStrand } from '@/src/domain/bio/strand';
import { SeqRecord, BioFeature, SelectionArea } from '@/src/domain/bio/types';
import { featureEnvelope } from '@/src/domain/bio/featureEnvelope';
import { getOriginalPos } from '@/src/domain/bio';

/** Insert (featureIndex === -1) or replace a feature on the matching record. */
export function saveEditedFeature(
  records: SeqRecord[],
  recordId: string,
  featureIndex: number,
  feature: BioFeature,
  addLog: (message: string) => void = () => {},
): SeqRecord[] {
  return records.map(r => {
    if (r.id !== recordId) return r;
    const newFeatures = [...r.features];
    const hubEdit = featureIndex === -1 || r.features[featureIndex]?.hubEdit === 'added' ? 'added' : 'edited';
    const marked: BioFeature = { ...feature, ...featureEnvelope(feature), hubEdit };
    const previous = r.features[featureIndex];
    if (!previous && !marked.segments?.length && marked.start < marked.end) marked.segments = [{ start: marked.start, end: marked.end }];
    if (previous && (previous.start !== feature.start || previous.end !== feature.end
      || previous.strand !== feature.strand || JSON.stringify(previous.segments) !== JSON.stringify(feature.segments)
      || previous.metadata?.codon_start !== feature.metadata?.codon_start)) {
      marked.metadata = { ...feature.metadata };
      delete marked.metadata.phase;
      delete marked.metadata._gffPhases;
      delete marked.metadata._gffPhaseState;
    }
    const changed = !previous || !isCds(previous) || previous.start !== marked.start || previous.end !== marked.end
      || getFeatureStrand(previous) !== getFeatureStrand(marked)
      || JSON.stringify(previous.segments) !== JSON.stringify(marked.segments)
      || JSON.stringify(previous.remoteParts) !== JSON.stringify(marked.remoteParts) || previous.operator !== marked.operator
      || JSON.stringify(previous.translationExceptions) !== JSON.stringify(marked.translationExceptions)
      || ['codon_start', 'transl_table', 'transl_except'].some(key => previous.metadata?.[key] !== marked.metadata?.[key]);
    marked.metadata = { ...marked.metadata };
    const previousEvidence = previous ? geometryCodeBreakEvidence(previous, r) : [];
    const matched = matchPreviousOccurrences(previous?.translationExceptions ?? [], marked.translationExceptions ?? []);
    const displacement = previous && marked.translationExceptions?.length ? plainMoveOffset(previous, marked, r) : undefined;
    if (previous && displacement !== undefined) {
      marked.translationExceptions = marked.translationExceptions?.map((raw, i) => matched[i] !== undefined && previousEvidence[matched[i]!]?.status === 'applied'
        ? transformCodeBreak(raw, previous.strand, displacement, true, r.isCircular ? r.sequence.length : undefined) : raw);
    }
    const evaluated = geometryCodeBreakEvidence(marked, r);
    const dropped = new Set<number>();
    for (const evidence of evaluated) {
      const previousOccurrence = matched[evidence.occurrence];
      const inherited = previousOccurrence !== undefined && previousEvidence[previousOccurrence]?.status === 'applied';
      if (evidence.status === 'malformed' && !inherited) {
        addLog(`WARNING: ${codeBreakMessage(evidence)}; Save refused`);
        return r;
      }
      if (evidence.status === 'dropped' || (evidence.status === 'malformed' && inherited)) {
        addLog(`WARNING: ${codeBreakMessage(evidence)}; removed before Save`);
        dropped.add(evidence.occurrence);
      }
    }
    if (dropped.size) marked.translationExceptions = marked.translationExceptions?.filter((_, i) => !dropped.has(i));
    if (!isCds(marked)) {
      if (marked.metadata.translation !== undefined) addLog(`Translation removed from ${marked.name}: feature is not a CDS`);
      delete marked.metadata.translation; delete marked.metadata._translationSource; delete marked.metadata._translationCheck;
    } else if (changed) {
      const result = conceptualTranslation(marked, r);
      const reason = translationReason(result, marked);
      if (result.status === 'ok' && !result.internalStops.length) {
        marked.metadata.translation = result.residues;
        marked.metadata._translationSource = 'computed';
        marked.metadata._translationMessage = previous ? 'Translation recomputed after edit' : 'Translation computed at creation';
      } else {
        delete marked.metadata.translation;
        marked.metadata._translationSource = 'removed';
        marked.metadata._translationMessage = `${previous ? 'Translation removed after edit' : 'No translation stored at creation'}: ${reason}`;
        addLog(`WARNING: ${marked.name}: ${reason}`);
      }
    } else {
      for (const key of ['translation', '_translationSource', '_translationMessage']) {
        delete marked.metadata[key];
        if (previous.metadata?.[key] !== undefined) marked.metadata[key] = previous.metadata[key];
      }
    }
    const checked = checkTranslation(marked, r);
    if (featureIndex === -1) newFeatures.push(checked);
    else newFeatures[featureIndex] = checked;
    return { ...r, features: newFeatures, annotationsEdited: true };
  });
}

/** Splice out a feature; returns the new records and the removed feature's name (undefined if out of range). */
export function removeFeature(
  records: SeqRecord[],
  recordId: string,
  featureIndex: number,
): { next: SeqRecord[]; removedName: string | undefined } {
  let removedName: string | undefined;
  const next = records.map(r => {
    if (r.id !== recordId) return r;
    if (featureIndex < 0 || featureIndex >= r.features.length || r.features[featureIndex].type === 'source') return r;
    const newFeatures = [...r.features];
    const removed = newFeatures.splice(featureIndex, 1);
    removedName = removed[0]?.name;
    return { ...r, features: newFeatures, annotationsEdited: true };
  });
  return { next, removedName };
}

/** Undefined visibility means shown, matching the viewer's visibility filter. */
export function toggleRecordVisibility(records: SeqRecord[], recordId: string): SeqRecord[] {
  return records.map(r => (r.id === recordId ? { ...r, visible: r.visible === false } : r));
}

/** Default coordinates for a new feature, seeded from the current selection (or 0..100). */
export function newFeatureFromSelection(
  records: SeqRecord[],
  activeSelection: SelectionArea | null,
): { targetRecordId: string; start: number; end: number } | null {
  if (records.length === 0) return null;
  let start = 0;
  let end = 100;
  let targetRecordId = records[0].id;

  if (activeSelection) {
    targetRecordId = activeSelection.recordIds[0] || records[0].id;
    const targetRecord = records.find(r => r.id === targetRecordId);
    if (targetRecord) {
      start = getOriginalPos(
        targetRecord.alignedSequence || targetRecord.sequence,
        Math.min(activeSelection.start, activeSelection.end),
      );
      end = getOriginalPos(
        targetRecord.alignedSequence || targetRecord.sequence,
        Math.max(activeSelection.start, activeSelection.end),
      );
    }
  }
  return { targetRecordId, start, end };
}

/** Convert viewport (aligned) match coordinates to original-sequence coordinates for a new annotation. */
export function annotationCoords(
  targetRecord: SeqRecord | undefined,
  start: number,
  end: number,
  segments?: { start: number; end: number }[],
): { start: number; end: number; segments?: { start: number; end: number }[] } {
  let finalStart = start;
  let finalEnd = end;
  let finalSegments = segments;

  if (targetRecord) {
    const seq = targetRecord.alignedSequence || targetRecord.sequence;
    finalStart = getOriginalPos(seq, start);
    finalEnd = getOriginalPos(seq, end);
    if (segments) {
      finalSegments = segments
        .map(seg => ({
          start: getOriginalPos(seq, seg.start),
          end: getOriginalPos(seq, seg.end),
        }))
        .sort((a, b) => a.start - b.start);
    }
  }
  return { start: finalStart, end: finalEnd, segments: finalSegments };
}

/** Compare ordered logical parts; only origin-contiguous splits describe one circular part. */
function plainMoveOffset(previous: BioFeature, next: BioFeature, record: SeqRecord): number | undefined {
  if (getFeatureStrand(previous) !== getFeatureStrand(next) || previous.metadata?.codon_start !== next.metadata?.codon_start) return;
  const before = moveParts(previous, record), after = moveParts(next, record);
  if (!before?.length || !after || before.length !== after.length) return;
  const shift = (value: number) => record.isCircular ? ((value % record.sequence.length) + record.sequence.length) % record.sequence.length : value;
  const offset = shift(after[0].start - before[0].start);
  if (!offset) return;
  if (before.every((part, i) => part.strand === after[i].strand && part.length === after[i].length
    && shift(after[i].start - part.start) === offset && shift(after[i].end - part.end) === offset)) return offset;
}

function moveParts(feature: BioFeature, record: SeqRecord) {
  const strand = getFeatureStrand(feature);
  if (strand !== 1 && strand !== -1) return;
  const parts = feature.segments?.length ? feature.segments : [feature];
  if (parts.some(part => invalidLocationPart(part, { length: record.sequence.length, isCircular: record.isCircular }))) return;
  const ordered = !parts.some(part => part.strand !== undefined) && strand === -1 ? [...parts].reverse() : parts;
  const normalized: { start: number; end: number; strand: 1 | -1; length: number }[] = [];
  const length = record.sequence.length;
  for (const part of ordered) {
    const current = { start: part.start, end: part.end, strand: part.strand ?? strand, length: part.end >= part.start ? part.end - part.start : length - part.start + part.end };
    const last = normalized.at(-1);
    if (record.isCircular && last?.strand === current.strand
      && (current.strand === 1 ? last.end === length && current.start === 0 : last.start === 0 && current.end === length)) {
      if (current.strand === 1) last.end = current.end;
      else last.start = current.start;
      last.length += current.length;
    } else normalized.push(current);
  }
  return normalized;
}

function matchPreviousOccurrences(previous: string[], next: string[]): (number | undefined)[] {
  const occurrences = new Map<string, number[]>();
  previous.forEach((raw, index) => {
    const values = occurrences.get(raw) ?? [];
    values.push(index);
    occurrences.set(raw, values);
  });
  return next.map(raw => occurrences.get(raw)?.shift());
}

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

import { SeqRecord, BioFeature, SelectionArea } from '@/src/domain/bio/types';
import { getOriginalPos } from '@/src/domain/bio';

/** Insert (featureIndex === -1) or replace a feature on the matching record. */
export function saveEditedFeature(
  records: SeqRecord[],
  recordId: string,
  featureIndex: number,
  feature: BioFeature,
): SeqRecord[] {
  return records.map(r => {
    if (r.id !== recordId) return r;
    const newFeatures = [...r.features];
    const hubEdit = featureIndex === -1 || r.features[featureIndex]?.hubEdit === 'added' ? 'added' : 'edited';
    const marked: BioFeature = { ...feature, hubEdit };
    const previous = r.features[featureIndex];
    if (previous && (previous.start !== feature.start || previous.end !== feature.end
      || previous.strand !== feature.strand || JSON.stringify(previous.segments) !== JSON.stringify(feature.segments)
      || previous.metadata?.codon_start !== feature.metadata?.codon_start)) {
      marked.metadata = { ...feature.metadata };
      delete marked.metadata.phase;
      delete marked.metadata._gffPhases;
      delete marked.metadata._gffPhaseState;
    }
    if (featureIndex === -1) newFeatures.push(marked);
    else newFeatures[featureIndex] = marked;
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

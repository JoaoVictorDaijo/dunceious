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
import { getOriginalPos } from '@/services/bioUtils';
import type { FlatItem } from '../components/DatabaseHubPanel';

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
    if (featureIndex === -1) newFeatures.push(feature);
    else newFeatures[featureIndex] = feature;
    return { ...r, features: newFeatures };
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
    const newFeatures = [...r.features];
    const removed = newFeatures.splice(featureIndex, 1);
    removedName = removed[0]?.name;
    return { ...r, features: newFeatures };
  });
  return { next, removedName };
}

/** Flip the `visible` flag on the matching record (undefined → true). */
export function toggleRecordVisibility(records: SeqRecord[], recordId: string): SeqRecord[] {
  return records.map(r => (r.id === recordId ? { ...r, visible: !r.visible } : r));
}

/** Per-record features filtered case-insensitively by name/type/definition/metadata, with original index attached. */
export function groupFeaturesBySearch(
  records: SeqRecord[],
  featureSearch: string,
): Record<string, (BioFeature & { index: number })[]> {
  const groups: Record<string, (BioFeature & { index: number })[]> = {};
  const search = featureSearch.toLowerCase();
  records.forEach(r => {
    groups[r.id] = r.features
      .map((f, idx) => ({ ...f, index: idx }))
      .filter(f => {
        const inName = f.name.toLowerCase().includes(search);
        const inType = f.type.toLowerCase().includes(search);
        const inDef = r.definition?.toLowerCase().includes(search);
        const inMeta = f.metadata
          ? Object.values(f.metadata).some(v => v.toLowerCase().includes(search))
          : false;
        return inName || inType || inDef || inMeta;
      });
  });
  return groups;
}

/** Flat header/track/feature list for the virtualised DatabaseHubPanel. */
export function buildFlattenedFeatures(records: SeqRecord[], featureSearch: string): FlatItem[] {
  const groupedFeatures = groupFeaturesBySearch(records, featureSearch);
  const items: FlatItem[] = [];
  Object.entries(groupedFeatures).forEach(([recordId, features]) => {
    const record = records.find(r => r.id === recordId);
    const tracks = record?.tracks || [];
    if (features.length === 0 && tracks.length === 0 && featureSearch) return;
    items.push({ type: 'header', recordId, count: features.length + tracks.length });
    tracks.forEach(t => items.push({ type: 'track', recordId, track: t }));
    features.forEach(f => items.push({ type: 'feature', recordId, feature: f }));
  });
  return items;
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

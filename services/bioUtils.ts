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


import { SeqRecord } from '../types';

// Translation + coordinate-mapping primitives now live in the domain layer;
// re-exported here for existing `services/bioUtils` importers until Phase C.
export {
  translateSequence,
  extractCodingSequence,
  detectEarlyStop,
  getOriginalPos,
} from '../src/domain/bio';

export const downloadBlob = (content: string, filename: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// ---------------------------------------------------------------------------
// Selection-export helpers
// ---------------------------------------------------------------------------

export type Interval = { start: number; end: number };
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
): Interval | null {
  if (!(start < selEnd && end > selStart)) return null;
  const length = Math.max(0, selEnd - selStart);
  const out: Interval = {
    start: Math.max(0, start - selStart),
    end: Math.min(length, end - selStart),
  };
  return out.end > out.start ? out : null;
}

/**
 * Clips a `BioFeature` (including its `segments` array) to the selection window
 * and rebases all coordinates to be selection-local.
 * Returns `null` when the feature does not overlap the selection at all.
 */
function clipFeature(
  feature: import('../types').BioFeature,
  selStart: number,
  selEnd: number
): import('../types').BioFeature | null {
  const clipped = clipAndRebaseInterval(feature.start, feature.end, selStart, selEnd);
  if (!clipped) return null;
  const newSegments = feature.segments
    ?.map(s => clipAndRebaseInterval(s.start, s.end, selStart, selEnd))
    .filter((s): s is Interval => s !== null);
  return {
    ...feature,
    ...clipped,
    segments: newSegments?.length ? newSegments : undefined,
  };
}

/**
 * Slices all records to the selection window `[selStart, selEnd)`, rebasing
 * feature/segment coordinates and filtering zero-length track intervals.
 */
export function sliceRecordsBySelection(
  records: import('../types').SeqRecord[],
  selStart: number,
  selEnd: number
): import('../types').SeqRecord[] {
  return records.map(record => {
    const seq = record.alignedSequence || record.sequence;
    const slicedSeq = seq.substring(Math.max(0, selStart), Math.min(seq.length, selEnd));

    const slicedFeatures = record.features
      .map(f => clipFeature(f, selStart, selEnd))
      .filter((f): f is import('../types').BioFeature => f !== null);

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
}

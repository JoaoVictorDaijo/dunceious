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

import { alignedEnvelope, displayTracks } from '@/src/domain/bio/quantitativeTracks';
import { featureEnvelope } from '@/src/domain/bio/featureEnvelope';
import { transposeInterval } from '@/src/domain/bio/coordinate';
import type { BioFeature, SelectionArea, SeqRecord, QuantitativeTrack } from '@/src/domain/bio/types';
import { featureLength, featureLengthText } from './viewModel';

/** An annotation the viewport should frame: aligned columns, plus its name and biological length for the label. */
export interface FocusTarget {
  recordId: string;
  featureIndex?: number;
  start: number;
  end: number;
  label: string;
  length: number;
  /** The feature's length as `featureLengthText` words it, in the record's unit. */
  lengthText?: string;
}

/** Frames the feature's whole envelope, so every part of a joined feature is in view. */
export function featureFocusTarget(record: SeqRecord, feature: BioFeature): FocusTarget {
  const bounds = featureEnvelope(feature);
  const { start, end } = record.alignedSequence
    ? transposeInterval(bounds.start, bounds.end, record.alignedSequence)
    : bounds;
  return {
    recordId: record.id,
    featureIndex: record.features.indexOf(feature),
    start,
    end,
    label: feature.name,
    length: featureLength(record.sequence.length, feature.start, feature.end, feature.segments),
    lengthText: featureLengthText(record, feature),
  };
}

/** A selection edited away from the focused region no longer is that annotation. */
export function isFocusedSelection(target: FocusTarget | null, selection: SelectionArea | null): boolean {
  return !!target && !!selection
    && selection.start === target.start && selection.end === target.end
    && selection.recordIds.length === 1 && selection.recordIds[0] === target.recordId;
}

/** Track focus uses only placed biological support, expressed in aligned columns. */
export function trackFocusTarget(record: SeqRecord, track: QuantitativeTrack): FocusTarget | null {
  const display = displayTracks(record).find(item => item.track === track)!;
  if (!display.placed.length) return null;
  let start = Infinity, end = -Infinity;
  let biologicalStart = Infinity, biologicalEnd = -Infinity;
  for (const index of display.placed) {
    const envelope = alignedEnvelope(display, index);
    start = Math.min(start, envelope.start); end = Math.max(end, envelope.end);
    biologicalStart = Math.min(biologicalStart, track.data[index].start);
    biologicalEnd = Math.max(biologicalEnd, track.data[index].end);
  }
  return { recordId: record.id, start, end, label: track.name, length: biologicalEnd - biologicalStart };
}

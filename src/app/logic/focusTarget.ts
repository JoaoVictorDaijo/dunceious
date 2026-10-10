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

import { transposeInterval } from '@/src/domain/bio/coordinate';
import type { BioFeature, SelectionArea, SeqRecord } from '@/src/domain/bio/types';
import { featureLength } from './viewModel';

/** An annotation the viewport should frame: aligned columns, plus its name and biological length for the label. */
export interface FocusTarget {
  recordId: string;
  start: number;
  end: number;
  label: string;
  length: number;
}

/** Frames the feature's whole envelope, so every part of a joined feature is in view. */
export function featureFocusTarget(record: SeqRecord, feature: BioFeature): FocusTarget {
  const { start, end } = record.alignedSequence
    ? transposeInterval(feature.start, feature.end, record.alignedSequence)
    : feature;
  return {
    recordId: record.id,
    start,
    end,
    label: feature.name,
    length: featureLength(record.sequence.length, feature.start, feature.end, feature.segments),
  };
}

/** A selection edited away from the focused region no longer is that annotation. */
export function isFocusedSelection(target: FocusTarget | null, selection: SelectionArea | null): boolean {
  return !!target && !!selection
    && selection.start === target.start && selection.end === target.end
    && selection.recordIds.length === 1 && selection.recordIds[0] === target.recordId;
}

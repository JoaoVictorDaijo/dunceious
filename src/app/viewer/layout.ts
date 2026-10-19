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

import type { SeqRecord, BioFeature, QuantitativeTrack } from '@/src/domain/bio/types';
import { ANNOT_BAR_HEIGHT, ANNOT_BASES_HEIGHT, ANNOT_LANE_GAP, AA_ROW_HEIGHT, NT_ROW_HEIGHT } from './constants';
import { SEARCH_QUERY_LANE_HEIGHT } from './hitMarks';
import type { SearchResult } from '@/src/domain/bio/types';
import { showsAnnotationBases } from './annotationPresentation';
import { assignTranslationLanes, NO_TRANSLATION_LANES, type TranslationLanes } from './cds';

/** A quantitative-track data point: a value over the half-open bp interval [start, end). */
export type TrackDatum = { start: number; end: number; value: number };

/** A track plus its computed vertical geometry. `packedRows` groups non-overlapping
 *  interval data into lanes (empty for `line` tracks). */
export interface TrackLayout extends QuantitativeTrack {
  height: number;
  top: number;
  packedRows: TrackDatum[][];
}

/** A feature assigned to a packing lane (`row`). Wrap-around features (start > end)
 *  are packed as two intervals but keep a single placement. */
export interface FeaturePlacement {
  feature: BioFeature;
  row: number;
}

/** Full per-record vertical layout: annotation lanes, quantitative tracks, and the
 *  sequence/translation band, with absolute y-offsets (px) and total row `height`. */
export interface RecordLayout {
  id: string;
  record: SeqRecord;
  placements: FeaturePlacement[];
  /** Top of each annotation lane (px from the annotation area's top) and its height. */
  laneTops: number[];
  laneHeights: number[];
  annotHeight: number;
  quantHeight: number;
  topPadding: number;
  height: number;
  seqBaseY: number;
  translationVisible: boolean;
  /** Kept after translation hides so the closing fade still has its rows. */
  translationLanes: TranslationLanes;
  trackLayouts: TrackLayout[];
}

export interface LayoutOptions {
  searchResultsByRecord?: Record<string, SearchResult[]>;
  showAnnotations: boolean;
  /** Bases are legible at this zoom: opted-in annotations open to show them. */
  basesVisible?: boolean;
  translationVisible: boolean;
  showTracks: boolean;
}

// Packing reads every CDS's frame (O(sequence) each); layouts rerun on every
// display toggle, so lanes are computed once per record object.
const translationLaneCache = new WeakMap<SeqRecord, TranslationLanes>();

function translationLanesFor(record: SeqRecord, visible: boolean): TranslationLanes {
  const cached = translationLaneCache.get(record);
  if (cached || !visible) return cached ?? NO_TRANSLATION_LANES;
  const lanes = assignTranslationLanes(record.features, record.alignedSequence || record.sequence, record.moleculeType);
  translationLaneCache.set(record, lanes);
  return lanes;
}

interface AnnotationPacking {
  placements: FeaturePlacement[];
  laneHasBases: boolean[];
}

// Record edits replace identity; weak keys let removed records and placements be collected.
const annotationPackingCache = new WeakMap<SeqRecord, AnnotationPacking>();

function annotationPackingFor(record: SeqRecord): AnnotationPacking {
  const cached = annotationPackingCache.get(record);
  if (cached) return cached;
  const genomeLength = (record.alignedSequence || record.sequence).length;
  // Imported finite coordinates can extend beyond the sequence. The bounded
  // sweep proof does not cover those intervals, so they retain exact comparisons.
  const bounded = record.features.every(feature => Number.isFinite(feature.start) && Number.isFinite(feature.end)
    && feature.start >= 0 && feature.end >= 0 && feature.start <= genomeLength && feature.end <= genomeLength);
  const rows: { firstStart: number; lastEnd: number; intervals: { start: number; end: number }[] }[] = [];
  const laneHasBases: boolean[] = [];
  const placements = [...record.features].sort((a, b) => a.start - b.start).map(feature => {
    const { start, end } = feature;
    const wraps = start > end;
    const intervals = bounded ? [] : wraps
      ? [{ start, end: genomeLength }, { start: 0, end }]
      : [{ start, end }];
    let row = 0;
    while (row < rows.length) {
      const occupied = rows[row];
      // Sorted starts make lastEnd sufficient for the tail; a wrap also checks
      // firstStart for its head, preserving the unoccupied middle between them.
      const overlaps = bounded
        ? start < occupied.lastEnd + 10 || (wraps && occupied.firstStart < end + 10)
        : occupied.intervals.some(other => intervals.some(piece =>
          piece.start < other.end + 10 && other.start < piece.end + 10));
      if (!overlaps) break;
      row++;
    }
    if (row === rows.length) {
      rows.push({ firstStart: wraps ? 0 : start, lastEnd: wraps ? genomeLength : end, intervals: [] });
      laneHasBases.push(false);
    }
    const occupied = rows[row];
    occupied.firstStart = Math.min(occupied.firstStart, wraps ? 0 : start);
    occupied.lastEnd = Math.max(occupied.lastEnd, wraps ? genomeLength : end);
    if (!bounded) occupied.intervals.push(...intervals);
    if (showsAnnotationBases(feature)) laneHasBases[row] = true;
    return { feature, row };
  });
  const result = { placements, laneHasBases };
  annotationPackingCache.set(record, result);
  return result;
}

/**
 * Computes the vertical layout of every record for the virtualized viewer.
 *
 * Coordinate model: positions are 0-based half-open bp indices; a feature with
 * `start > end` is a circular wrap and is packed as `[start, len]` + `[0, end]`.
 * Features are packed into lanes with a 10-bp gap buffer; interval tracks are
 * packed into 16-px lanes. All heights are in pixels.
 *
 * Pure: no React, no DOM — unit-tested in node.
 */
export function computeRecordLayouts(records: SeqRecord[], opts: LayoutOptions): RecordLayout[] {
  const { showAnnotations, translationVisible, showTracks, basesVisible = false } = opts;
  return records.map(record => {
      const { placements, laneHasBases } = annotationPackingFor(record);
      const featRowsCount = showAnnotations ? laneHasBases.length : 0;
      // Lanes stay one thin bar tall; a lane grows only while its opted-in
      // annotation actually shows bases (legible zoom), so no gap opens elsewhere.
      const laneHeights = laneHasBases.map(b => ANNOT_BAR_HEIGHT + (b && basesVisible ? ANNOT_BASES_HEIGHT : 0));
      const laneTops: number[] = [];
      let laneCursor = 0;
      for (const h of laneHeights) {
        laneTops.push(laneCursor);
        laneCursor += h + ANNOT_LANE_GAP;
      }
      const annotHeight = featRowsCount > 0 ? laneCursor : 0;

      // 2. Track Packing & Height Calculation
      const tracks = record.tracks || [];
      const trackSpacing = 12;
      let totalQuantHeight = 0;

      const trackLayouts = tracks.map(track => {
        let height = 80; // Default height for line tracks
        let packedRows: TrackDatum[][] = [];

        if (track.kind === 'interval') {
          // Pack intervals to determine required height
          const sortedData = [...track.data].sort((a, b) => a.start - b.start);
          sortedData.forEach(interval => {
            let placed = false;
            for (let i = 0; i < packedRows.length; i++) {
              const lastInRow = packedRows[i][packedRows[i].length - 1];
              if (interval.start >= lastInRow.end + 1) {
                packedRows[i].push(interval);
                placed = true;
                break;
              }
            }
            if (!placed) {
              packedRows.push([interval]);
            }
          });

          // Calculate height based on rows (min 12px per row + padding)
          const rowHeight = 16;
          height = Math.max(80, packedRows.length * rowHeight + 10);
        }

        const top = totalQuantHeight;
        if (showTracks) {
          totalQuantHeight += height + trackSpacing;
        }

        return { ...track, height, top, packedRows };
      });

      const quantHeight = showTracks ? totalQuantHeight : 0;
      const topPadding = (featRowsCount > 0 || quantHeight > 0) ? 24 : 0;
      const effectiveTranslation = translationVisible && record.moleculeType !== 'protein';
      const translationLanes = translationLanesFor(record, effectiveTranslation);
      const forwardHeight = effectiveTranslation ? AA_ROW_HEIGHT * translationLanes.forward : 0;
      const reverseHeight = effectiveTranslation ? AA_ROW_HEIGHT * translationLanes.reverse : 0;
      const queryHeight = opts.searchResultsByRecord?.[record.id]?.length ? SEARCH_QUERY_LANE_HEIGHT : 0;
      const seqBaseY = annotHeight + quantHeight + topPadding + forwardHeight + queryHeight;
      const height = seqBaseY + reverseHeight + NT_ROW_HEIGHT + 20;

      return {
        id: record.id,
        record,
        placements,
        laneTops,
        laneHeights,
        annotHeight,
        quantHeight,
        topPadding,
        height,
        seqBaseY,
        translationVisible: effectiveTranslation,
        translationLanes,
        trackLayouts
      };
    });
}

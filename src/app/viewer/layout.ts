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
import { ANNOT_ROW_HEIGHT, AA_ROW_HEIGHT, NT_ROW_HEIGHT } from './constants';

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
  annotHeight: number;
  quantHeight: number;
  topPadding: number;
  height: number;
  seqBaseY: number;
  trackLayouts: TrackLayout[];
}

export interface LayoutOptions {
  showAnnotations: boolean;
  showTranslation: boolean;
  showTracks: boolean;
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
  const { showAnnotations, showTranslation, showTracks } = opts;
  return records.map(record => {
      // 1. Feature Packing (Annotations)
      const rows: { start: number, end: number }[][] = [];
      const sortedFeatures = [...record.features].sort((a, b) => a.start - b.start);

      const placements = sortedFeatures.map(feat => {
        const genomeLength = record.sequence.length;
        const featIntervals = feat.start > feat.end
          ? [{ start: feat.start, end: genomeLength }, { start: 0, end: feat.end }]
          : [{ start: feat.start, end: feat.end }];

        let rowIdx = 0;
        const buffer = 10;

        while (rowIdx < rows.length) {
          const row = rows[rowIdx];
          const hasOverlap = row.some(interval =>
            featIntervals.some(fi =>
              fi.start < interval.end + buffer && interval.start < fi.end + buffer
            )
          );
          if (!hasOverlap) break;
          rowIdx++;
        }

        if (rowIdx === rows.length) {
          rows.push([]);
        }

        rows[rowIdx].push(...featIntervals);
        return { feature: feat, row: rowIdx };
      });

      const featRowsCount = showAnnotations ? rows.length : 0;
      const annotHeight = featRowsCount * (ANNOT_ROW_HEIGHT + 6);

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
      const effectiveTranslation = showTranslation && record.moleculeType !== 'protein';
      const seqBaseY = annotHeight + quantHeight + topPadding + (effectiveTranslation ? AA_ROW_HEIGHT * 3 : 0);
      const height = seqBaseY + (effectiveTranslation ? AA_ROW_HEIGHT * 3 : 0) + NT_ROW_HEIGHT + 20;

      return {
        id: record.id,
        record,
        placements,
        annotHeight,
        quantHeight,
        topPadding,
        height,
        seqBaseY,
        trackLayouts
      };
    });
}

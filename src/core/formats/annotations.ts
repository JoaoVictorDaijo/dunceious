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

import type { QuantitativeTrack } from '@/src/domain/bio/types';
export { parseGFF3, exportToGff3 } from './gff3';

/** Annotation track as returned by BED/BedGraph/GFF3 parsers (extends QuantitativeTrack). */
export interface AnnotationTrack extends QuantitativeTrack {
  type: string;
}

/**
 * Parses BED into per-chromosome interval tracks.
 *
 * BED is 0-based half-open: col2 chromStart (inclusive) and col3 chromEnd
 * (exclusive) are used verbatim as `[start, end)` — no ±1 adjustment. Score is
 * read from column index 4 (the BED `score`/5th field) via `parseFloat`; a
 * missing/NaN score defaults to **0** (contrast bedGraph, which skips NaN). The
 * `name` column is ignored. Rows with < 3 columns or NaN coords are skipped, as
 * are `#`/`track`/`browser` header lines. One 'interval' track is reused per
 * (chrom, filename).
 */
export const parseBED = (content: string, filename: string): Record<string, AnnotationTrack[]> => {
  const lines = content.split('\n');
  const results: Record<string, AnnotationTrack[]> = {};

  lines.forEach(line => {
    if (!line.trim() || line.startsWith('#') || line.startsWith('track') || line.startsWith('browser')) return;

    const parts = line.trim().split(/\s+/);
    if (parts.length < 3) return;

    const chrom = parts[0];
    const start = parseInt(parts[1]);
    const end = parseInt(parts[2]);
    const scoreVal = parseFloat(parts[4]);

    if (isNaN(start) || isNaN(end)) return;

    if (!results[chrom]) results[chrom] = [];

    const finalScore = isNaN(scoreVal) ? 0 : scoreVal;

    let track = results[chrom].find(t => t.type === 'track' && t.name === filename);
    if (!track) {
      track = {
        type: 'track',
        kind: 'interval',
        id: `${filename}_${chrom}`,
        name: filename,
        data: []
      };
      results[chrom].push(track);
    }
    track.data.push({ start, end, value: finalScore });
  });

  return results;
};

/**
 * Parses bedGraph into per-chromosome 'line' tracks.
 *
 * Coordinates are 0-based half-open (col2 start inclusive, col3 end exclusive),
 * used verbatim. The value (column index 3, the 4th field) is `parseFloat`d;
 * unlike BED, a **NaN value skips the row** (no default-to-0). Rows with < 4
 * columns are skipped; `#`/`track`/`browser` header lines ignored.
 */
export const parseBedGraph = (content: string, filename: string): Record<string, AnnotationTrack[]> => {
  const lines = content.split('\n');
  const results: Record<string, AnnotationTrack[]> = {};

  lines.forEach(line => {
    if (!line.trim() || line.startsWith('#') || line.startsWith('track') || line.startsWith('browser')) return;

    const parts = line.trim().split(/\s+/);
    if (parts.length < 4) return;

    const chrom = parts[0];
    const start = parseInt(parts[1]);
    const end = parseInt(parts[2]);
    const value = parseFloat(parts[3]);

    if (isNaN(start) || isNaN(end) || isNaN(value)) return;

    if (!results[chrom]) results[chrom] = [];

    let track = results[chrom].find(t => t.type === 'track' && t.name === filename);
    if (!track) {
      track = {
        type: 'track',
        kind: 'line',
        id: `${filename}_${chrom}`,
        name: filename,
        data: []
      };
      results[chrom].push(track);
    }

    track.data.push({ start, end, value });
  });

  return results;
};


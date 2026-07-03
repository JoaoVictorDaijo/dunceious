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


/**
 * A contiguous sub-range in the app's canonical coordinate model:
 * 0-based, half-open `[start, end)` — `start` inclusive, `end` exclusive.
 */
export interface FeatureSegment {
  start: number; // 0-based, inclusive
  end: number;   // 0-based, exclusive (half-open)
}

/**
 * A sequence annotation. All coordinates are 0-based, half-open `[start, end)`.
 *
 * Circular wrap-around: when `start > end` the feature crosses the sequence
 * origin, spanning `[start, seqLen)` then `[0, end)`.
 */
export interface BioFeature {
  type: string;
  name: string;
  start: number;  // 0-based, inclusive
  end: number;    // 0-based, exclusive; end < start ⇒ circular wrap-around
  strand: 1 | -1; // 1 = forward/plus, -1 = reverse/minus
  color?: string;
  metadata?: Record<string, string>;
  translation?: string;
  /**
   * Sub-ranges for multi-part (spliced / GenBank join) features; each half-open
   * `[start, end)`. Authoritative pieces when present; `start`/`end` above is
   * the overall envelope.
   */
  segments?: FeatureSegment[];
  /** Original source location text (e.g. GenBank join/complement), preserved for round-trip export. */
  locationString?: string;
}

/** Quantitative track. `data` intervals are `[start, end)` 0-based half-open; `kind` = 'line' (bedGraph) or 'interval' (BED). */
export interface QuantitativeTrack {
  id: string;
  name: string;
  kind?: 'line' | 'interval';
  data: { start: number; end: number; value: number }[];
  color?: string;
}

export interface SeqRecord {
  id: string;
  name: string;
  definition?: string;
  accession?: string;
  /** Raw, ungapped residue string — the coordinate space for features when no alignment is loaded. */
  sequence: string;
  moleculeType?: 'dna' | 'rna' | 'protein'; // governs reverse-strand search & translation availability
  features: BioFeature[];
  tracks?: QuantitativeTrack[];
  /**
   * Gapped multiple-alignment overlay (contains '-'): the same residues in the
   * same order as `sequence` with alignment gaps inserted. When present, feature
   * coordinates are transposed into this space (see `processTransposition`), and
   * consumers read `alignedSequence || sequence`.
   */
  alignedSequence?: string;
  isCircular?: boolean; // sequence is circular; origin wrap-around allowed
  metadata?: Record<string, any>;
  visible?: boolean;
}

/** A search hit, in `alignedSequence || sequence` coordinate space. */
export interface SearchResult {
  start: number;  // 0-based, inclusive
  end: number;    // 0-based, exclusive
  sequence: string;
  recordId: string;
  strand: 1 | -1; // 1 = forward match, -1 = reverse-complement match
  score?: number; // present only for fuzzy (Smith-Waterman) hits
  segments?: FeatureSegment[]; // non-gap sub-ranges of the match
}

/** Minimal record projection sent to the search worker. */
export interface SearchableRecord {
  id: string;
  sequence: string;
  alignedSequence?: string;
}

/** A selected window `[start, end)` (0-based half-open) spanning the listed records. */
export interface SelectionArea {
  start: number;
  end: number;
  recordIds: string[];
}

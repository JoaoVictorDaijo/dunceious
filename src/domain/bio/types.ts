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


export interface FeatureSegment {
  start: number;
  end: number;
}

export interface BioFeature {
  type: string;
  name: string;
  start: number;
  end: number;
  strand: 1 | -1;
  color?: string;
  metadata?: Record<string, string>;
  translation?: string;
  segments?: FeatureSegment[];
  locationString?: string;
}

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
  sequence: string;
  moleculeType?: 'dna' | 'rna' | 'protein';
  features: BioFeature[];
  tracks?: QuantitativeTrack[];
  alignedSequence?: string;
  isCircular?: boolean;
  metadata?: Record<string, any>;
  visible?: boolean;
}

export interface SearchResult {
  start: number;
  end: number;
  sequence: string;
  recordId: string;
  strand: 1 | -1;
  score?: number;
  segments?: FeatureSegment[];
}

export interface SelectionArea {
  start: number;
  end: number;
  recordIds: string[];
}

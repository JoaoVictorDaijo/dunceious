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

import type { BioFeature, SearchHitProvenance } from './types';
import { cigarSpans } from './cigar';
import { getFeatureStrand } from './strand';

export const SEARCH_HIT_KEY = '_searchHit';
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const coordinate = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const strand = (v: unknown): boolean => v === 1 || v === -1;

export function readSearchHit(feature: BioFeature): SearchHitProvenance | null {
  try {
    const v: unknown = JSON.parse(feature.metadata?.[SEARCH_HIT_KEY] ?? 'null');
    if (!object(v) || v.v !== 1 || typeof v.query !== 'string' || typeof v.cigar !== 'string'
      || !['iupac', 'whole', 'local'].includes(String(v.mode)) || !['nucleotide', 'protein'].includes(String(v.alphabet))
      || !strand(v.strand) || !object(v.params) || !object(v.span) || !coordinate(v.span.start) || !coordinate(v.span.end)
      || !strand(v.span.strand) || typeof v.appVersion !== 'string' || typeof v.createdAt !== 'string'
      || typeof v.exportNote !== 'boolean' || (v.edits !== undefined && !coordinate(v.edits))) return null;
    if (v.params.minQueryIdentity !== undefined && (typeof v.params.minQueryIdentity !== 'number'
      || !Number.isFinite(v.params.minQueryIdentity) || v.params.minQueryIdentity < 0 || v.params.minQueryIdentity > 100)) return null;
    if (v.params.scoring !== undefined && typeof v.params.scoring !== 'string') return null;
    if (v.span.segments !== undefined && (!Array.isArray(v.span.segments) || !v.span.segments.every(s =>
      object(s) && coordinate(s.start) && coordinate(s.end) && (s.strand === undefined || strand(s.strand))))) return null;
    if (cigarSpans(v.cigar).query !== v.query.length) return null;
    return v as unknown as SearchHitProvenance;
  } catch { return null; }
}

export function withSearchHit(feature: BioFeature, hit: SearchHitProvenance): BioFeature {
  return { ...feature, metadata: { ...feature.metadata, [SEARCH_HIT_KEY]: JSON.stringify(hit) } };
}
export function withoutSearchHit(feature: BioFeature): BioFeature {
  const metadata = { ...feature.metadata };
  delete metadata[SEARCH_HIT_KEY];
  if (metadata._showBases === 'query') delete metadata._showBases;
  return { ...feature, metadata };
}
export function isSearchHitCurrent(feature: BioFeature): boolean {
  const hit = readSearchHit(feature);
  if (!hit) return false;
  const { span } = hit;
  if (feature.start !== span.start || feature.end !== span.end || getFeatureStrand(feature) !== span.strand) return false;
  const a = feature.segments ?? []; const b = span.segments ?? [];
  return a.length === b.length && a.every((s, i) => s.start === b[i].start && s.end === b[i].end && s.strand === b[i].strand);
}

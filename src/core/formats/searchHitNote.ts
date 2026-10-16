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

import type { BioFeature } from '@/src/domain/bio/types';
import { isSearchHitCurrent, readSearchHit } from '@/src/domain/bio/searchHit';

export function searchHitNote(feature: BioFeature): string | null {
  const hit = readSearchHit(feature);
  if (!hit?.exportNote || !isSearchHitCurrent(feature)) return null;
  const query = hit.query.length > 20 ? hit.query.slice(0, 5) + '…' + hit.query.slice(-5) : hit.query;
  const length = `${hit.query.length} ${hit.alphabet === 'protein' ? 'aa' : 'nt'}`;
  const method = hit.mode === 'whole' ? `fuzzy search (whole query, min query identity ${hit.params.minQueryIdentity ?? 80}%)`
    : hit.mode === 'iupac' ? 'IUPAC search' : `local search (${hit.params.scoring ?? ''})`;
  const metrics = hit.edits === undefined ? '' : `${Math.floor(100 * (hit.query.length - hit.edits) / hit.query.length)}% query identity, ${hit.edits} edit${hit.edits === 1 ? '' : 's'}, `;
  return `Found by Dunceious ${method}: query ${query} (${length}), ${metrics}CIGAR ${hit.cigar}`;
}

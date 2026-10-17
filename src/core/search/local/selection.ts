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

import type { SearchResult } from '@/src/domain/bio/types';
import type { LocalStreamOutcome } from './stream';

export interface LocalSearchCounts {
  cutoff: number | null; // EMBOSS units; null includes all scores.
  streams: number;
  noPositiveStreams: number;
  skippedRecords: Array<{ recordId: string; characters: string[] }>;
  hiddenByOverlap: number;
  hiddenByFilters: number;
  beyondLimit: number;
}

export function compareLocalHits(a: { hit: SearchResult; recordIndex: number },
  b: { hit: SearchResult; recordIndex: number }): number {
  return b.hit.local!.score - a.hit.local!.score || a.recordIndex - b.recordIndex
    || b.hit.strand - a.hit.strand || a.hit.start - b.hit.start || a.hit.end - b.hit.end
    || a.hit.local!.queryStart - b.hit.local!.queryStart;
}

/** Final-cutoff counts exclude lower-score work so worker timing cannot affect the totals. */
export function mergeLocalOutcomes(outcomes: LocalStreamOutcome[], limit: number,
  skipped: LocalSearchCounts['skippedRecords']): { results: SearchResult[]; counts: LocalSearchCounts } {
  const ranked = outcomes.flatMap(o => o.hits.map(hit => ({ hit, recordIndex: o.recordIndex })));
  ranked.sort(compareLocalHits);
  const cutoff = ranked.length >= limit ? ranked[limit - 1].hit.local!.score : null;
  const inScope = (score2: number) => cutoff === null || score2 >= cutoff * 2;
  return { results: ranked.slice(0, limit).map(r => r.hit), counts: {
    cutoff, streams: outcomes.length,
    noPositiveStreams: outcomes.filter(o => o.noPositive).length, skippedRecords: skipped,
    hiddenByOverlap: outcomes.reduce((n, o) => n + o.hiddenByOverlapScores.filter(inScope).length, 0),
    hiddenByFilters: outcomes.reduce((n, o) => n + o.hiddenByFilterScores.filter(inScope).length, 0),
    beyondLimit: Math.max(0, ranked.filter(entry => inScope(entry.hit.local!.score * 2)).length - limit),
  } };
}

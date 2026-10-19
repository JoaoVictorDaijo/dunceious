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

import type { SeqRecord } from '@/src/domain/bio/types';
import { readDetails } from '@/src/domain/bio/details';
import type { FeatureGroup } from './featureComparison';
import { matchesSequenceFilters, type HubFilters } from './hubModel';

export function withHiddenCells(groups: FeatureGroup[], records: SeqRecord[], hidden: Set<string>, filters: HubFilters): FeatureGroup[] {
  if (!hidden.size) return groups;
  const pools = new Map<string | null, string[]>();
  for (const record of records) {
    if (!hidden.has(record.id) || !matchesSequenceFilters(record, filters)) continue;
    const organism = readDetails(record).organism?.trim() || null;
    const pool = pools.get(organism) ?? []; pool.push(record.id); pools.set(organism, pool);
  }
  return groups.map(group => {
    const [organism] = JSON.parse(group.key) as [string | null, string];
    const ids = pools.get(organism) ?? [];
    return { ...group, hiddenCount: ids.length, cells: [...group.cells, ...ids.map(recordId => ({ recordId, state: 'hidden' as const }))].sort((a, b) => a.recordId.localeCompare(b.recordId)) };
  });
}

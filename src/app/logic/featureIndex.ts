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

import type { BioFeature, SeqRecord } from '@/src/domain/bio/types';

/**
 * Details can open from the hub (a copy carrying `index`) or from the viewer (the
 * aligned copy, in the same order as the record's own features), so a feature is
 * resolved to its position in the record rather than by identity alone. -1 when
 * the feature belongs to neither list.
 */
export function featureIndexOf(records: SeqRecord[], transposedRecords: SeqRecord[], recordId: string, feature: BioFeature): number {
  const hubIndex = (feature as BioFeature & { index?: number }).index;
  if (typeof hubIndex === 'number') return hubIndex;
  const own = records.find(record => record.id === recordId)?.features.indexOf(feature) ?? -1;
  return own >= 0 ? own : transposedRecords.find(record => record.id === recordId)?.features.indexOf(feature) ?? -1;
}

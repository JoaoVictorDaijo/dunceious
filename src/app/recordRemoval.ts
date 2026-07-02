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

import type { SearchResult, SelectionArea, SeqRecord } from '@/src/domain/bio/types';

export function removeRecordFromProject(records: SeqRecord[], recordId: string): SeqRecord[] {
  return records.filter(record => record.id !== recordId);
}

export function updateSelectionAfterRecordRemoval(
  activeSelection: SelectionArea | null,
  recordId: string,
): SelectionArea | null {
  if (!activeSelection) return null;

  const recordIds = activeSelection.recordIds.filter(id => id !== recordId);
  if (recordIds.length === 0) return null;
  if (recordIds.length === activeSelection.recordIds.length) return activeSelection;

  return { ...activeSelection, recordIds };
}

export function sanitizeSearchStateAfterRecordRemoval(
  filteredResults: SearchResult[],
  currentSearchIdx: number,
  selectedSearchIndices: Set<number>,
  recordId: string,
): { currentSearchIdx: number; selectedSearchIndices: Set<number> } {
  const nextSelectedSearchIndices = new Set(
    [...selectedSearchIndices].filter(idx => filteredResults[idx]?.recordId !== recordId),
  );

  const isCurrentIdxInvalid = currentSearchIdx < 0 || currentSearchIdx >= filteredResults.length;
  const isCurrentOnRemovedRecord = !isCurrentIdxInvalid && filteredResults[currentSearchIdx]?.recordId === recordId;

  return {
    currentSearchIdx: isCurrentOnRemovedRecord || isCurrentIdxInvalid ? -1 : currentSearchIdx,
    selectedSearchIndices: nextSelectedSearchIndices,
  };
}

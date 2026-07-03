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

/** Returns a new records array with `recordId` removed; the input is not mutated. */
export function removeRecordFromProject(records: SeqRecord[], recordId: string): SeqRecord[] {
  return records.filter(record => record.id !== recordId);
}

/**
 * Recomputes the active selection after a record is removed.
 *
 * Returns `null` when there is no active selection, or when dropping this record
 * empties the selection's `recordIds`. Returns the SAME selection reference
 * unchanged when the record was not part of it. Otherwise returns a new
 * selection with the record removed from `recordIds`.
 */
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

/**
 * Purges search state that referenced a removed record.
 *
 * Drops selected-search indices whose result belongs to `recordId`. Resets
 * `currentSearchIdx` to `-1` when it is out of range (`< 0` or `>=
 * filteredResults.length`) OR points at a result on the removed record;
 * otherwise it is kept. `filteredResults` must be the post-removal results the
 * indices refer to.
 */
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

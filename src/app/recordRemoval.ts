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

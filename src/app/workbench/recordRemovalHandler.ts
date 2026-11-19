/*
 * Dunceious
 * Copyright (C) 2026 João Victor Daijo and Murilo Cassiano
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

import type { Dispatch, SetStateAction } from 'react';
import type { SeqRecord } from '@/src/domain/bio/types';
import type { SearchResult } from '@/src/domain/bio/types';
import type { useHubState } from '@/src/app/hooks/useHubState';
import { removeRecordFromProject, sanitizeSearchStateAfterRecordRemoval, updateSelectionAfterRecordRemoval } from '@/src/app/recordRemoval';
import type { Navigation } from './useNavigation';
import type { RecordDetails } from './useRecordDetails';

type HubState = ReturnType<typeof useHubState>;

/** Search state that indexes into the current results. */
export interface RemovalSearchState {
  searchResults: SearchResult[];
  currentSearchIdx: number;
  selectedSearchIndices: Set<number>;
  setCurrentSearchIdx: Dispatch<SetStateAction<number>>;
  setSelectedSearchIndices: Dispatch<SetStateAction<Set<number>>>;
}

export interface RecordRemovalDeps {
  records: SeqRecord[];
  setRecords: Dispatch<SetStateAction<SeqRecord[]>>;
  isLocked: () => boolean;
  hubState: HubState;
  nav: Navigation;
  search: RemovalSearchState;
  details: RecordDetails;
  addLog: (message: string) => void;
}

/** Drops every Hub reference to the record: its rows (`keys`), edits, selection, filter and jump target. */
function forgetHubRecord(hubState: HubState, nav: Navigation, recordId: string, keys: Set<string>) {
  hubState.setCurrentRow(previous => previous && keys.has(previous) ? null : previous);
  hubState.setSearchKey(previous => previous && keys.has(previous) ? null : previous);
  hubState.setEditingDetails(previous => previous === recordId ? null : previous);
  hubState.setEditingName(previous => previous === recordId ? null : previous);
  hubState.setDraft(previous => previous?.id === recordId ? null : previous);
  hubState.setHubHidden(prev => new Set([...prev].filter(id => id !== recordId)));
  hubState.setSelectedRecords(prev => new Set([...prev].filter(id => id !== recordId)));
  hubState.setSelectedRows(prev => new Set([...prev].filter(key => !keys.has(key))));
  hubState.setFilters(prev => {
    if (!prev.onlyIds?.has(recordId)) return prev;
    const onlyIds = new Set([...prev.onlyIds].filter(id => id !== recordId));
    return { ...prev, onlyIds: onlyIds.size ? onlyIds : undefined };
  });
  if (nav.hubFocus && keys.has(nav.hubFocus.key)) { nav.setHubFocus(null); nav.setShowHubReturn(false); }
  if (hubState.jumpTarget && (hubState.jumpTarget.key === recordId || keys.has(hubState.jumpTarget.key))) hubState.setJumpTarget(null);
}

/** Removes one record from the workspace and from every view state that points at it. */
export function createRecordRemoval({ records, setRecords, isLocked, hubState, nav, search, details, addLog }: RecordRemovalDeps) {
  return (recordId: string) => {
    if (isLocked()) return;
    const record = records.find(r => r.id === recordId);
    if (!record) return;

    const keys = new Set(record.features.map((_, index) => `${recordId}:${index}`));
    record.tracks?.forEach(track => keys.add(`${recordId}:track:${track.id}`));
    forgetHubRecord(hubState, nav, recordId, keys);
    setRecords(prev => removeRecordFromProject(prev, recordId));
    nav.setActiveSelection(prev => updateSelectionAfterRecordRemoval(prev, recordId));

    const { searchResults, currentSearchIdx, selectedSearchIndices } = search;
    search.setCurrentSearchIdx(prev => sanitizeSearchStateAfterRecordRemoval(searchResults, prev, selectedSearchIndices, recordId).currentSearchIdx);
    search.setSelectedSearchIndices(prev => sanitizeSearchStateAfterRecordRemoval(searchResults, currentSearchIdx, prev, recordId).selectedSearchIndices);

    if (details.viewingRecordDetails?.id === recordId) details.closeDetails();
    addLog(`Sequence ${record.name || record.id} removed from project.`);
  };
}

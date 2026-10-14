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

import { useCallback, useReducer, useRef, useState, type SetStateAction } from 'react';
import { createTrackWindow } from '@/src/app/components/hub/trackWindow';
import type { SequenceDetails } from '@/src/domain/bio/types';
import type { GroupField, HubFilters, SortOrder, RowSort } from '@/src/app/logic/hubModel';

export type HubTab = 'sequences' | 'features';
export type HubMenu = 'more' | 'groupBy' | null;
type FilterState = { filters: HubFilters; searchFolds: Set<string> };
type FilterAction = { kind: 'filters'; value: SetStateAction<HubFilters> } | { kind: 'folds'; value: SetStateAction<Set<string>> };

function equalSets(a: Set<string> | undefined, b: Set<string> | undefined): boolean {
  return a === b || Boolean(a && b && a.size === b.size && [...a].every(value => b.has(value)));
}

function sameFilters(a: HubFilters, b: HubFilters): boolean {
  return a.query === b.query && a.strand === b.strand && a.sequenceQuery === b.sequenceQuery
    && a.needsAttention === b.needsAttention && equalSets(a.types, b.types) && equalSets(a.onlyIds, b.onlyIds);
}

function filterReducer(state: FilterState, action: FilterAction): FilterState {
  if (action.kind === 'folds') {
    return { ...state, searchFolds: typeof action.value === 'function' ? action.value(state.searchFolds) : action.value };
  }
  const filters = typeof action.value === 'function' ? action.value(state.filters) : action.value;
  return { filters, searchFolds: sameFilters(state.filters, filters) || state.searchFolds.size === 0 ? state.searchFolds : new Set() };
}

export function useHubState() {
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [trackWindow] = useState(createTrackWindow);
  const [detailsField, setDetailsFieldValue] = useState<keyof SequenceDetails>('organism');
  const [detailsFocusRequest, setDetailsFocusRequest] = useState(0);
  const setDetailsField = useCallback((field: keyof SequenceDetails) => { setDetailsFieldValue(field); setDetailsFocusRequest(value => value + 1); }, []);
  const [tab, setTab] = useState<HubTab>('sequences');
  const [grouped, setGrouped] = useState(false);
  const [groupField, setGroupField] = useState<GroupField>('organism');
  const [rowSort, setRowSort] = useState<Record<HubTab, RowSort>>({ sequences: null, features: null });
  const [sort, setSort] = useState<SortOrder>('load');
  const [{ filters, searchFolds }, dispatchFilters] = useReducer(filterReducer, undefined, (): FilterState => ({
    filters: { query: '', types: new Set<string>(), strand: 'all' as const, sequenceQuery: '', needsAttention: false },
    searchFolds: new Set<string>(),
  }));
  const setFilters = useCallback((value: SetStateAction<HubFilters>) => dispatchFilters({ kind: 'filters', value }), []);
  const setSearchFolds = useCallback((value: SetStateAction<Set<string>>) => dispatchFilters({ kind: 'folds', value }), []);
  const [density, setDensity] = useState<'compact' | 'comfortable'>('compact');
  const [collapsed, setCollapsed] = useState<Record<HubTab, Set<string>>>(() => ({ sequences: new Set(), features: new Set() }));
  const [hubHidden, setHubHidden] = useState<Set<string>>(() => new Set());
  const toggleHubHidden = useCallback((id: string) => setHubHidden(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; }), []);
  const showInHub = useCallback((id: string) => setHubHidden(previous => { if (!previous.has(id)) return previous; const next = new Set(previous); next.delete(id); return next; }), []);
  const [selectedRecords, setSelectedRecords] = useState<Set<string>>(() => new Set());
  const [selectedRows, setSelectedRows] = useState<Set<string>>(() => new Set());
  const [scrollOffset, setScrollOffset] = useState<Record<HubTab, number>>({ sequences: 0, features: 0 });
  const [menu, setMenu] = useState<HubMenu>(null);
  const [draft, setDraft] = useState<{ id: string; details?: SequenceDetails; label?: string } | null>(null);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editingDetails, setEditingDetails] = useState<string | null>(null);

  const [currentSectionKey, setCurrentSectionKey] = useState<string | null>(null);
  const [jumpTarget, setJumpTarget] = useState<{ key: string; serial: number } | null>(null);
  const [onlyProblems, setOnlyProblemsValue] = useState(false);
  const setOnlyProblems = useCallback((value: boolean) => {
    if (value === onlyProblems) return;
    setOnlyProblemsValue(value);
    setSearchFolds(new Set());
  }, [onlyProblems, setSearchFolds]);
  const [indexFolds, setIndexFolds] = useState<Set<string>>(() => new Set());

  const workspaceRevision = useRef(0);
  const resetWorkspace = useCallback(() => {
    workspaceRevision.current++;
    trackWindow.update(null);
    setShortcutsOpen(false);
    setHubHidden(new Set());
    setSelectedRecords(new Set());
    setSelectedRows(new Set());
    setFilters({ query: '', types: new Set(), strand: 'all', sequenceQuery: '', needsAttention: false });
    setCollapsed({ sequences: new Set(), features: new Set() });
    setSearchFolds(new Set());
    setIndexFolds(new Set());
    setScrollOffset({ sequences: 0, features: 0 });
    setJumpTarget(null);
    setCurrentSectionKey(null);
    setMenu(null);
    setEditingDetails(null);
    setEditingName(null);
    setDraft(null);
    setOnlyProblemsValue(false);
    setRowSort({ sequences: null, features: null });
    setTab('sequences');
  }, [setFilters, setSearchFolds, trackWindow]);

  return {
    hubHidden, setHubHidden, toggleHubHidden, showInHub, shortcutsOpen, setShortcutsOpen, trackWindow, detailsField, detailsFocusRequest, setDetailsField, workspaceRevision, resetWorkspace, indexFolds, setIndexFolds,
    currentSectionKey, setCurrentSectionKey, jumpTarget, setJumpTarget, onlyProblems, setOnlyProblems,
    rowSort, setRowSort, tab, setTab, grouped, setGrouped, groupField, setGroupField, sort, setSort,
    filters, setFilters, density, setDensity, collapsed, setCollapsed, searchFolds, setSearchFolds,
    selectedRecords, setSelectedRecords, selectedRows, setSelectedRows, scrollOffset, setScrollOffset,
    menu, setMenu, editingDetails, setEditingDetails, editingName, setEditingName, draft, setDraft,
  };
}

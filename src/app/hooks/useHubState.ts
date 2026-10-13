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

import { useCallback, useReducer, useState, type SetStateAction } from 'react';
import type { GroupField, HubFilters, SortOrder } from '@/src/app/logic/hubModel';

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
  return { filters, searchFolds: sameFilters(state.filters, filters) ? state.searchFolds : new Set() };
}

export function useHubState() {
  const [tab, setTab] = useState<HubTab>('sequences');
  const [grouped, setGrouped] = useState(false);
  const [groupField, setGroupField] = useState<GroupField>('organism');
  const [sort, setSort] = useState<SortOrder>('load');
  const [{ filters, searchFolds }, dispatchFilters] = useReducer(filterReducer, undefined, (): FilterState => ({
    filters: { query: '', types: new Set<string>(), strand: 'all' as const, sequenceQuery: '', needsAttention: false },
    searchFolds: new Set<string>(),
  }));
  const setFilters = useCallback((value: SetStateAction<HubFilters>) => dispatchFilters({ kind: 'filters', value }), []);
  const setSearchFolds = useCallback((value: SetStateAction<Set<string>>) => dispatchFilters({ kind: 'folds', value }), []);
  const [density, setDensity] = useState<'compact' | 'comfortable'>('compact');
  const [collapsed, setCollapsed] = useState<Record<HubTab, Set<string>>>(() => ({ sequences: new Set(), features: new Set() }));
  const [selectedRecords, setSelectedRecords] = useState<Set<string>>(() => new Set());
  const [selectedRows, setSelectedRows] = useState<Set<string>>(() => new Set());
  const [scrollOffset, setScrollOffset] = useState<Record<HubTab, number>>({ sequences: 0, features: 0 });
  const [menu, setMenu] = useState<HubMenu>(null);
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

  const resetWorkspace = useCallback(() => {
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
    setOnlyProblemsValue(false);
    setTab('sequences');
  }, [setFilters, setSearchFolds]);

  return {
    resetWorkspace, indexFolds, setIndexFolds,
    currentSectionKey, setCurrentSectionKey, jumpTarget, setJumpTarget, onlyProblems, setOnlyProblems,
    tab, setTab, grouped, setGrouped, groupField, setGroupField, sort, setSort,
    filters, setFilters, density, setDensity, collapsed, setCollapsed, searchFolds, setSearchFolds,
    selectedRecords, setSelectedRecords, selectedRows, setSelectedRows, scrollOffset, setScrollOffset,
    menu, setMenu, editingDetails, setEditingDetails,
  };
}

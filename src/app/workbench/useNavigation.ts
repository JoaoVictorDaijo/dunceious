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

import { useCallback, useRef, useState } from 'react';
import type { SelectionArea } from '@/src/domain/bio/types';
import type { FocusTarget } from '@/src/app/logic/focusTarget';
import type { HubFocusOrigin } from '@/src/app/components/AnnotationHubPanel';
import type { useHubState } from '@/src/app/hooks/useHubState';

export type WorkbenchTab = 'alignment' | 'features';

/**
 * Which workspace is shown, the selection, and Focus. `focusedRegion` names the selection while it
 * stands; `pendingFocus` asks the viewport to frame it once and is cleared when handled, so a remount
 * does not replay it. `hubFocus` is the Hub row a Focus jump left from: the viewport offers the way
 * back while `showHubReturn` holds, and the Hub keeps marking the row after returning.
 */
export function useNavigation() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<WorkbenchTab>('alignment');
  const [hubToolsSlot, setHubToolsSlot] = useState<HTMLDivElement | null>(null);
  const [hubFocus, setHubFocus] = useState<HubFocusOrigin | null>(null);
  const [showHubReturn, setShowHubReturn] = useState(false);
  const [activeSelection, setActiveSelection] = useState<SelectionArea | null>(null);
  const searchSelectionRef = useRef<SelectionArea | null>(null);
  const [focusedRegion, setFocusedRegion] = useState<FocusTarget | null>(null);
  const [pendingFocus, setPendingFocus] = useState<FocusTarget | null>(null);
  const changeTab = (tab: WorkbenchTab) => {
    if (tab === 'features') setShowHubReturn(false);
    setActiveTab(tab);
  };
  const selectSearchResult = (selection: SelectionArea) => {
    searchSelectionRef.current = selection;
    setActiveTab('alignment');
    setActiveSelection(selection);
  };
  const focusOn = useCallback((target: FocusTarget) => {
    setActiveTab('alignment');
    setActiveSelection({ start: target.start, end: target.end, recordIds: [target.recordId] });
    setFocusedRegion(target);
    setPendingFocus(target);
  }, []);
  const focusHubFeature = useCallback((target: FocusTarget, origin: HubFocusOrigin) => {
    setHubFocus(origin);
    setShowHubReturn(true);
    focusOn(target);
  }, [focusOn]);
  return {
    sidebarOpen, setSidebarOpen, activeTab, changeTab, hubToolsSlot, setHubToolsSlot, hubFocus, setHubFocus,
    showHubReturn, setShowHubReturn, activeSelection, setActiveSelection, searchSelectionRef, selectSearchResult,
    focusedRegion, setFocusedRegion, pendingFocus, setPendingFocus, focusOn, focusHubFeature,
  };
}

export type Navigation = ReturnType<typeof useNavigation>;
type HubState = ReturnType<typeof useHubState>;

/** Moves every Hub row key the workbench holds (Focus, current row, search, jump, selection) after rows renumber. */
export function useRemapHubRows(nav: Navigation, hubState: HubState) {
  const { setFocusedRegion, setPendingFocus, setHubFocus } = nav;
  return useCallback((remap: (key: string) => string | null) => {
    const remapFocus = (previous: FocusTarget | null) => {
      if (!previous || previous.featureIndex === undefined) return previous;
      const key = remap(`${previous.recordId}:${previous.featureIndex}`);
      return key ? { ...previous, featureIndex: Number(key.slice(key.lastIndexOf(':') + 1)) } : null;
    };
    const remapKeyed = <T extends { key: string }>(previous: T | null) => {
      if (!previous) return previous;
      const key = remap(previous.key);
      return key ? { ...previous, key } : null;
    };
    setFocusedRegion(remapFocus); setPendingFocus(remapFocus);
    setHubFocus(remapKeyed);
    hubState.setCurrentRow(previous => previous ? remap(previous) : null);
    hubState.setSearchKey(previous => previous ? remap(previous) : null);
    hubState.setJumpTarget(remapKeyed);
    hubState.setSelectedRows(previous => new Set([...previous].flatMap(key => { const next = remap(key); return next ? [next] : []; })));
  }, [setFocusedRegion, setPendingFocus, setHubFocus, hubState.setJumpTarget, hubState.setSelectedRows, hubState.setCurrentRow, hubState.setSearchKey]);
}

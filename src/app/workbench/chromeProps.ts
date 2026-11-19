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

import type { ComponentProps } from 'react';
import type TopNav from '@/src/app/components/TopNav';
import type Sidebar from '@/src/app/components/Sidebar';
import type { Workbench } from './useWorkbench';

export function topNavProps(w: Workbench): ComponentProps<typeof TopNav> {
  const { view, nav, derived } = w;
  return {
    toolsRef: nav.setHubToolsSlot,
    sidebarOpen: nav.sidebarOpen,
    onToggleSidebar: () => nav.setSidebarOpen(!nav.sidebarOpen),
    activeTab: nav.activeTab,
    onTabChange: nav.changeTab,
    featureColors: view.featureColors,
    onSetFeatureColors: view.setFeatureColors,
    showAlignmentControls: nav.activeTab === 'alignment' && w.bio.records.length > 0,
    dragMode: view.dragMode,
    onDragModeChange: view.setDragMode,
    showAnnotations: view.showAnnotations,
    onToggleAnnotations: () => view.setShowAnnotations(!view.showAnnotations),
    showTracks: view.showTracks,
    onToggleTracks: () => view.setShowTracks(!view.showTracks),
    showTranslation: view.showTranslation,
    onToggleTranslation: () => view.setShowTranslation(!view.showTranslation),
    showConservation: view.showConservation,
    onToggleConservation: () => view.setShowConservation(!view.showConservation),
    isAlignmentLoaded: w.bio.records.filter(record => record.visible !== false && record.alignedSequence !== undefined).length >= 2,
    sessionMoleculeType: derived.sessionMoleculeType,
    onSaveProject: w.files.exportProjectJson,
    onOpenProject: w.files.handleProjectUpload,
    onClearWorkspace: w.handleClearAll,
    sequenceCount: w.bio.records.length,
    workspaceLocked: w.remoteAlignment.isAlignmentLocked || w.busy,
  };
}

type SidebarProps = ComponentProps<typeof Sidebar>;

/** The sidebar's search panel props. */
function sidebarSearchProps(w: Workbench): Pick<SidebarProps,
  'searchQuery' | 'onSearchQueryChange' | 'searchMode' | 'onSearchModeChange' | 'searchOptions' | 'onSearchOptionsChange' | 'isSearching'
  | 'onSearch' | 'onClearSearch' | 'onSelectSearchResult' | 'completedSearch' | 'searchResults' | 'groupedSearchResults' | 'currentSearchIdx'
  | 'onSetCurrentIdx' | 'selectedSearchIndices' | 'onSetSelectedIndices' | 'onToggleRecordSelection' | 'onJoinAllInRecord' | 'onJoinSelectedMatches'
  | 'onAnnotateMatch' | 'getSequenceContext' | 'isProteinSession' | 'localSearch'> {
  const s = w.search;
  return {
    localSearch: { localReady: s.localReady, localError: s.localError, localJob: s.localJob, localCounts: s.localCounts, onCancelLocalSearch: s.cancelLocalSearch },
    searchQuery: s.searchQuery, onSearchQueryChange: s.setSearchQuery, searchMode: s.searchMode, onSearchModeChange: s.setSearchMode,
    searchOptions: s.searchOptions, onSearchOptionsChange: s.setSearchOptions, isSearching: s.isSearching, onSearch: s.handleSearch,
    onClearSearch: w.handleClearSearch, onSelectSearchResult: w.nav.selectSearchResult, completedSearch: s.completedSearch,
    searchResults: s.searchResults, groupedSearchResults: s.groupedSearchResults, currentSearchIdx: s.currentSearchIdx,
    onSetCurrentIdx: s.setCurrentSearchIdx, selectedSearchIndices: s.selectedSearchIndices, onSetSelectedIndices: s.setSelectedSearchIndices,
    onToggleRecordSelection: s.toggleRecordSelection, onJoinAllInRecord: s.joinAllInRecord, onJoinSelectedMatches: s.joinSelectedMatches,
    onAnnotateMatch: w.features.addAnnotationFromSearch, getSequenceContext: s.getSequenceContext, isProteinSession: s.isProteinSession,
  };
}

export function sidebarProps(w: Workbench): SidebarProps {
  const { nav, files, remoteAlignment: remote } = w;
  return {
    ...sidebarSearchProps(w),
    hubState: w.hubState,
    featureColors: w.view.featureColors,
    onToggleRecordVisibility: w.features.toggleRecordVisibility,
    open: nav.sidebarOpen,
    activeTab: nav.activeTab,
    records: w.bio.records,
    transposedRecords: w.bio.transposedRecords,
    activeSelection: nav.activeSelection,
    onSetActiveSelection: nav.setActiveSelection,
    alignmentLength: w.derived.alignmentLength,
    onSetJumpTo: w.view.setJumpTo,
    onFileUpload: files.handleFileUpload,
    onAlignmentUpload: files.handleAlignmentUpload,
    onAlignRemote: () => { if (!w.busy) remote.open(); },
    remoteAlignmentState: remote.state,
    isAlignmentLocked: remote.isAlignmentLocked || w.busy,
    onAnnotationUpload: files.handleAnnotationUpload,
    onProjectUpload: files.handleProjectUpload,
    onExportSelection: files.exportSelection,
    onExportSelectionJson: files.exportSelectionJson,
    onStartNewFeature: w.features.startNewFeature,
    logs: w.logs,
    onSetActiveTab: nav.changeTab,
    onRemoveRecord: w.handleRemoveRecord,
  };
}

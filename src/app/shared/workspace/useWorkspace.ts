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

import { useEffect, useMemo, useRef, useState } from 'react';
import type { SelectionArea } from '@/src/domain/bio/types';
import type { FocusTarget } from '@/src/app/shared/logic/focusTarget';
import { deriveAlignmentState } from '@/src/app/shared/logic/viewModel';
import { useRemoteAlignment } from '@/src/app/shared/hooks/useRemoteAlignment';
import {
  removeRecordFromProject,
  sanitizeSearchStateAfterRecordRemoval,
  updateSelectionAfterRecordRemoval,
} from '@/src/app/shared/recordRemoval';
import {
  useAppLogger,
  useBioWorker,
  useFeatureManager,
  useFileHandlers,
  useSearchWorker,
} from '@/src/app/shared/hooks';

/** Shell-owned reactions to shared workspace events. */
export interface WorkspaceOptions {
  /** Called where the workspace wants the base-level viewer in front (focus jumps, search hits). */
  onNavigateToViewer?: () => void;
  /** Called after a record was actually removed, so a shell can close views of it. */
  onRecordRemoved?: (recordId: string) => void;
}

/**
 * The workspace state and handlers every UI shares: records, selection, search,
 * features, file I/O and remote alignment. UI-only state stays in each shell.
 */
export function useWorkspace(options: WorkspaceOptions = {}) {
  // ── Logger ────────────────────────────────────────────────────────────────
  const { logs, addLog } = useAppLogger();

  // ── Viewport display toggles ─────────────────────────────────────────────
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [showTranslation, setShowTranslation] = useState(true);
  const [showTracks, setShowTracks] = useState(true);
  const [showConservation, setShowConservation] = useState(false);

  const [featureColors, setFeatureColors] = useState<Record<string, string>>({});
  const [activeSelection, setActiveSelection] = useState<SelectionArea | null>(null);
  const searchSelectionRef = useRef<SelectionArea | null>(null);
  const selectSearchResult = (selection: SelectionArea) => {
    searchSelectionRef.current = selection;
    options.onNavigateToViewer?.();
    setActiveSelection(selection);
  };
  // `focusedRegion` names the selection while it stands; `pendingFocus` asks the
  // viewport to frame it once and is cleared when handled, so a remount does not replay it.
  const [focusedRegion, setFocusedRegion] = useState<FocusTarget | null>(null);
  const [pendingFocus, setPendingFocus] = useState<FocusTarget | null>(null);
  const focusOn = (target: FocusTarget) => {
    options.onNavigateToViewer?.();
    setActiveSelection({ start: target.start, end: target.end, recordIds: [target.recordId] });
    setFocusedRegion(target);
    setPendingFocus(target);
  };

  // ── Domain hooks ──────────────────────────────────────────────────────────
  const {
    records,
    setRecords,
    transposedRecords,
    consensus,
    isProcessing,
    setIsProcessing,
    bioWorkerRef,
    applyAlignmentOverlay,
  } = useBioWorker(addLog);

  const remoteAlignment = useRemoteAlignment(records, applyAlignmentOverlay, addLog);

  const {
    editing,
    setEditing,
    featureSearch,
    setFeatureSearch,
    flattenedFeatures,
    allFeaturesCount,
    saveEditedFeature,
    startNewFeature,
    addAnnotationFromSearch,
    removeFeature,
    toggleRecordVisibility,
  } = useFeatureManager(records, setRecords, activeSelection, addLog);

  const {
    searchQuery,
    setSearchQuery,
    searchMode,
    setSearchMode,
    searchOptions,
    setSearchOptions,
    filteredResults,
    currentSearchIdx,
    setCurrentSearchIdx,
    selectedSearchIndices,
    setSelectedSearchIndices,
    maxScoreFound,
    isSearching,
    groupedSearchResults,
    handleSearch,
    clearSearch,
    toggleRecordSelection,
    joinAllInRecord,
    joinSelectedMatches,
    getSequenceContext,
    isProteinSession,
  } = useSearchWorker(records, addLog, addAnnotationFromSearch, selectSearchResult);

  const handleClearSearch = () => {
    clearSearch();
    const searchSelection = searchSelectionRef.current;
    setActiveSelection(current => current === searchSelection ? null : current);
    searchSelectionRef.current = null;
  };

  const {
    handleFileUpload,
    handleAlignmentUpload,
    handleAnnotationUpload,
    handleProjectUpload,
    handleExportRecord,
    exportSelection,
    exportSelectionJson,
    exportAllFasta,
    exportGenBankFile,
    exportGffFile,
    exportProjectJson,
    moleculeTypeMismatch,
    closeMismatchModal,
  } = useFileHandlers(
    bioWorkerRef,
    records,
    activeSelection,
    featureColors,
    { showAnnotations, showTranslation, showConservation },
    {
      setRecords,
      setFeatureColors,
      setActiveSelection,
      setShowAnnotations,
      setShowTranslation,
      setShowConservation,
      setIsProcessing,
    },
    addLog,
    remoteAlignment.isLocked,
  );

  const removeRecord = (recordId: string) => {
    if (remoteAlignment.isLocked()) return;
    const record = records.find(r => r.id === recordId);
    if (!record) return;

    setRecords(prev => removeRecordFromProject(prev, recordId));
    setActiveSelection(prev => updateSelectionAfterRecordRemoval(prev, recordId));

    const nextSearchState = sanitizeSearchStateAfterRecordRemoval(
      filteredResults,
      currentSearchIdx,
      selectedSearchIndices,
      recordId,
    );
    setCurrentSearchIdx(nextSearchState.currentSearchIdx);
    setSelectedSearchIndices(nextSearchState.selectedSearchIndices);

    addLog(`Sequence ${record.name || record.id} removed from project.`);
    options.onRecordRemoved?.(recordId);
  };

  // ── Derived state ─────────────────────────────────────────────────────────
  const { isAlignmentLoaded, alignmentLength, sessionMoleculeType } = useMemo(
    () => deriveAlignmentState(records, isProteinSession),
    [records, isProteinSession],
  );

  useEffect(() => {
    if (records.length === 0) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [records.length]);

  return {
    logs,
    addLog,
    showAnnotations,
    setShowAnnotations,
    showTranslation,
    setShowTranslation,
    showTracks,
    setShowTracks,
    showConservation,
    setShowConservation,
    featureColors,
    setFeatureColors,
    activeSelection,
    setActiveSelection,
    selectSearchResult,
    focusedRegion,
    setFocusedRegion,
    pendingFocus,
    setPendingFocus,
    focusOn,
    records,
    setRecords,
    transposedRecords,
    consensus,
    isProcessing,
    setIsProcessing,
    bioWorkerRef,
    applyAlignmentOverlay,
    editing,
    setEditing,
    featureSearch,
    setFeatureSearch,
    flattenedFeatures,
    allFeaturesCount,
    saveEditedFeature,
    startNewFeature,
    addAnnotationFromSearch,
    removeFeature,
    toggleRecordVisibility,
    searchQuery,
    setSearchQuery,
    searchMode,
    setSearchMode,
    searchOptions,
    setSearchOptions,
    filteredResults,
    currentSearchIdx,
    setCurrentSearchIdx,
    selectedSearchIndices,
    setSelectedSearchIndices,
    maxScoreFound,
    isSearching,
    groupedSearchResults,
    handleSearch,
    clearSearch,
    toggleRecordSelection,
    joinAllInRecord,
    joinSelectedMatches,
    getSequenceContext,
    isProteinSession,
    handleFileUpload,
    handleAlignmentUpload,
    handleAnnotationUpload,
    handleProjectUpload,
    handleExportRecord,
    exportSelection,
    exportSelectionJson,
    exportAllFasta,
    exportGenBankFile,
    exportGffFile,
    exportProjectJson,
    moleculeTypeMismatch,
    closeMismatchModal,
    remoteAlignment,
    handleClearSearch,
    removeRecord,
    isAlignmentLoaded,
    alignmentLength,
    sessionMoleculeType,
  };
}

export type Workspace = ReturnType<typeof useWorkspace>;

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

import { useCallback, useEffect } from 'react';
import type { BioFeature } from '@/src/domain/bio/types';
import type { SeqRecord } from '@/src/domain/bio/types';
import { loadLocalEngineBytes } from '@/src/app/lib/localEngineModule';
import { envAccentVars, resolveEnvAccent } from '@/src/app/logic/environment';
import { useAppLogger, useBioWorker, useFeatureManager, useFileHandlers, useSearchWorker } from '@/src/app/hooks';
import { useRemoteAlignment } from '@/src/app/hooks/useRemoteAlignment';
import { useHubState } from '@/src/app/hooks/useHubState';
import { useViewSettings, type ViewSettings } from './useViewSettings';
import { useNavigation, useRemapHubRows, type Navigation } from './useNavigation';
import { useRecordDetails } from './useRecordDetails';
import { useComparisonView } from './useComparisonView';
import { createRecordRemoval } from './recordRemovalHandler';

type Bio = ReturnType<typeof useBioWorker>;
type HubState = ReturnType<typeof useHubState>;

/** Asks the browser to confirm leaving the page while the workspace holds records. */
function useUnsavedWorkPrompt(recordCount: number) {
  useEffect(() => {
    if (recordCount === 0) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [recordCount]);
}

/** Clearing a search drops the selection it made, unless the user has moved it since. */
function searchClearer(clearSearch: () => void, nav: Navigation) {
  return () => {
    clearSearch();
    const searchSelection = nav.searchSelectionRef.current;
    nav.setActiveSelection(current => current === searchSelection ? null : current);
    nav.searchSelectionRef.current = null;
  };
}

interface FilesDeps { bio: Bio; view: ViewSettings; nav: Navigation; hubState: HubState; addLog: (m: string) => void; isLocked: () => boolean; onWorkspaceReplaced: () => void }

function useWorkbenchFiles({ bio, view, nav, hubState, addLog, isLocked, onWorkspaceReplaced }: FilesDeps) {
  return useFileHandlers(
    bio.bioWorkerRef, bio.records, nav.activeSelection, view.featureColors,
    { showAnnotations: view.showAnnotations, showTranslation: view.showTranslation, showConservation: view.showConservation, alignmentComparison: view.alignmentComparison },
    {
      onWorkspaceReplaced, setRecords: bio.setRecords, setFeatureColors: view.setFeatureColors, setActiveSelection: nav.setActiveSelection,
      setShowAnnotations: view.setShowAnnotations, setShowTranslation: view.setShowTranslation, setShowConservation: view.setShowConservation,
      setAlignmentComparison: view.setAlignmentComparison, setIsProcessing: bio.setIsProcessing,
    },
    addLog, isLocked,
    { requestBio: bio.requestBio, getRecords: bio.getRecords, getWorkspaceRevision: () => hubState.workspaceRevision.current },
  );
}

/** Clearing asks every time: it is irreversible, so there is no opt-out. */
function workspaceClearer(records: SeqRecord[], isLocked: () => boolean, reset: () => void, bio: Bio, addLog: (m: string) => void) {
  return () => {
    if (isLocked() || records.length === 0) return;
    const choice = window.prompt('Type CLEAR to remove every record and annotation.', '');
    if (choice?.trim().toUpperCase() !== 'CLEAR') return;
    reset();
    bio.setRecords([]);
    addLog('Workspace cleared.');
  };
}

/** Wires the workbench's hooks together; `App` only renders what this returns. */
export function useWorkbench() {
  useEffect(() => { void loadLocalEngineBytes().catch(() => {}); }, []);
  const { logs, addLog } = useAppLogger();
  const view = useViewSettings();
  const nav = useNavigation();
  // Session state belongs above the keyed workspace content so tab switches preserve it.
  const hubState = useHubState();
  const bio = useBioWorker(addLog, {
    getWorkspaceRevision: () => hubState.workspaceRevision.current,
    isAlignmentLocked: (): boolean => remoteAlignment.isLocked(),
    onMismatch: error => files.showMismatchModal(error),
  });
  const busy = bio.isProcessing || bio.pendingConfirmations.length > 0;
  const { records, setRecords } = bio;
  const remoteAlignment = useRemoteAlignment(records, bio.applyAlignmentOverlay, addLog);
  const remapHubRows = useRemapHubRows(nav, hubState);
  const features = useFeatureManager(records, setRecords, nav.activeSelection, addLog, { isLocked: remoteAlignment.isLocked, onRemapRows: remapHubRows });
  const search = useSearchWorker(records, addLog, features.addAnnotationFromSearch, nav.selectSearchResult);
  const handleClearSearch = searchClearer(search.clearSearch, nav);
  const resetHubWorkspace = () => {
    handleClearSearch();
    bio.invalidateImports('the workspace was replaced');
    hubState.resetWorkspace();
    features.dismissUndo();
    nav.setHubFocus(null);
    nav.setShowHubReturn(false);
  };
  const isWorkspaceLocked = () => remoteAlignment.isLocked() || busy;
  const files = useWorkbenchFiles({ bio, view, nav, hubState, addLog, isLocked: isWorkspaceLocked, onWorkspaceReplaced: resetHubWorkspace });
  const details = useRecordDetails(records, bio.transposedRecords, setRecords);
  // HubList is memoized on prop identity, so its callbacks keep a stable identity.
  const { setEditing } = features;
  const editHubFeature = useCallback((recordId: string, featureIndex: number, feature: BioFeature) => setEditing({ recordId, featureIndex, feature }), [setEditing]);
  const handleRemoveRecord = createRecordRemoval({ records, setRecords, isLocked: isWorkspaceLocked, hubState, nav, search, details, addLog });
  const derived = useComparisonView(records, view, search.isProteinSession);
  const envAccent = resolveEnvAccent(nav.activeTab, derived.sessionMoleculeType);
  useUnsavedWorkPrompt(records.length);
  return {
    logs, addLog, view, nav, hubState, bio, remoteAlignment, features, search, files, details, derived,
    busy, isWorkspaceLocked, envAccent, themeStyle: envAccentVars(envAccent) as React.CSSProperties,
    handleClearSearch, handleRemoveRecord, editHubFeature,
    handleClearAll: workspaceClearer(records, isWorkspaceLocked, resetHubWorkspace, bio, addLog),
  };
}

export type Workbench = ReturnType<typeof useWorkbench>;

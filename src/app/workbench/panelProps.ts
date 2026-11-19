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
import type GenomeViewer from '@/src/app/viewer/GenomeViewer';
import type AnnotationHubPanel from '@/src/app/components/AnnotationHubPanel';
import { writeDetails } from '@/src/domain/bio/details';
import type { Workbench } from './useWorkbench';

export function viewerProps(w: Workbench): ComponentProps<typeof GenomeViewer> {
  const { view, nav, search, files, derived } = w;
  return {
    records: w.bio.transposedRecords,
    consensus: w.bio.consensus,
    showAnnotations: view.showAnnotations,
    showTracks: view.showTracks,
    showTranslation: view.showTranslation,
    showConservation: view.showConservation,
    dragMode: view.dragMode,
    activeSelection: nav.activeSelection,
    onSelectionChange: nav.setActiveSelection,
    onExportFasta: files.exportSelection,
    onAddAnnotation: w.features.addAnnotationFromSearch,
    completedSearch: search.completedSearch,
    searchResults: search.searchResults,
    currentSearchIdx: search.currentSearchIdx,
    selectedSearchIndices: search.selectedSearchIndices,
    customColors: view.featureColors,
    jumpTo: view.jumpTo,
    focusRequest: nav.pendingFocus,
    onFocusComplete: () => nav.setPendingFocus(null),
    focusedRegion: nav.focusedRegion,
    onJumpComplete: () => view.setJumpTo(null),
    onExportRecord: files.handleExportRecord,
    onViewDetails: w.details.handleViewDetails,
    isAlignmentLocked: w.remoteAlignment.isAlignmentLocked,
    onRemoveRecord: w.handleRemoveRecord,
    onClearSelection: () => nav.setActiveSelection(null),
    comparisonMenu: derived.comparable ? { settings: view.alignmentComparison, onChange: view.setAlignmentComparison, reference: derived.comparisonReference, candidates: derived.candidates } : null,
    comparison: derived.comparison,
    onSetComparisonReference: derived.comparable ? derived.setComparisonReference : undefined,
  };
}

export function hubPanelProps(w: Workbench): ComponentProps<typeof AnnotationHubPanel> {
  const { files, features, remoteAlignment: remote } = w;
  return {
    toolsSlot: w.nav.hubToolsSlot,
    records: w.bio.records,
    state: w.hubState,
    onDroppedFiles: files.handleDroppedFiles,
    onFileUpload: files.handleFileUpload,
    onAlignmentUpload: files.handleAlignmentUpload,
    onAnnotationUpload: files.handleAnnotationUpload,
    onProjectUpload: files.handleProjectUpload,
    onExportRecords: files.exportRecords,
    onDeleteRows: features.removeFeatures,
    undoAvailable: features.undoAvailable,
    undoVersion: features.undoVersion,
    onUndoPause: features.setUndoPaused,
    onUndoDelete: features.undoDelete,
    onSetRecordDetails: features.setRecordDetails,
    onSetRecordLabel: features.setRecordLabel,
    onSetDetail: (ids, key, value) => { if (remote.isLocked()) return; w.bio.setRecords(prev => prev.map(record => ids.has(record.id) ? writeDetails(record, { [key]: value }) : record)); },
    featureColors: w.view.featureColors,
    onStartNewFeature: features.startNewFeature,
    isAlignmentLocked: remote.isAlignmentLocked,
    onRemoveRecord: w.handleRemoveRecord,
    onViewFeatureDetails: w.details.handleViewDetails,
    onEditFeature: w.editHubFeature,
    onRemoveFeature: features.removeFeature,
    onFocusItem: w.nav.focusHubFeature,
    lastFocusedKey: w.nav.hubFocus?.key ?? null,
    onExportProjectJson: files.exportProjectJson,
    onClearAll: w.handleClearAll,
    addLog: w.addLog,
  };
}

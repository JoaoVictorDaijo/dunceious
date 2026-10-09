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


import GenomeViewer from '@/src/app/viewer/GenomeViewer';
import { BioFeature, SelectionArea, SeqRecord } from '@/src/domain/bio/types';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import AnnotationHubPanel, { type HubFocusOrigin } from './components/AnnotationHubPanel';
import HubReturnPill from './components/HubReturnPill';
import FeatureEditorModal from './components/FeatureEditorModal';
import MoleculeTypeMismatchModal from './components/MoleculeTypeMismatchModal';
import ProcessingOverlay from './components/ProcessingOverlay';
import AlignRemoteModal from './components/AlignRemoteModal';
import AlignmentJobPill from './components/AlignmentJobPill';
import { useRemoteAlignment } from './hooks/useRemoteAlignment';
import RecordDetailsModal from './components/RecordDetailsModal';
import type { FocusTarget } from '@/src/app/logic/focusTarget';
import { deriveAlignmentState } from '@/src/app/logic/viewModel';
import { resolveEnvAccent } from './logic/environment';
import { getTheme, readThemePref, writeThemePref, resolveThemeVars, type ThemeKey } from './logic/theme';
import {
  removeRecordFromProject,
  sanitizeSearchStateAfterRecordRemoval,
  updateSelectionAfterRecordRemoval,
} from './recordRemoval';
import Sidebar from './components/Sidebar';
import StatusBar from './components/StatusBar';
import TooltipLayer from './components/TooltipLayer';
import { withAnnotationBases } from '@/src/app/viewer/annotationPresentation';
import TopNav from './components/TopNav';
import {
    useAppLogger,
    useBioWorker,
    useFeatureManager,
    useFileHandlers,
    useSearchWorker,
} from './hooks';

// ---------------------------------------------------------------------------
// App — composition root
// State and orchestration are delegated to purpose-built custom hooks.
// This component is responsible only for wiring hooks together and rendering
// the top-level layout.
// ---------------------------------------------------------------------------

const App: React.FC = () => {
  // ── Logger ────────────────────────────────────────────────────────────────
  const { logs, addLog } = useAppLogger();

  // ── Viewport display toggles ─────────────────────────────────────────────
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [showTranslation, setShowTranslation] = useState(true);
  const [showTracks, setShowTracks] = useState(true);
  const [showConservation, setShowConservation] = useState(false);
  const [dragMode, setDragMode] = useState<'pan' | 'select'>('select');

  // ── Layout ────────────────────────────────────────────────────────────────
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'alignment' | 'features'>('alignment');
  // The hub row a Focus jump left from: the viewport offers the way back while
  // `showHubReturn` holds, and the hub keeps marking the row after returning.
  const [hubFocus, setHubFocus] = useState<HubFocusOrigin | null>(null);
  const [showHubReturn, setShowHubReturn] = useState(false);
  const changeTab = (tab: 'alignment' | 'features') => {
    if (tab === 'features') setShowHubReturn(false);
    setActiveTab(tab);
  };

  // ── Modals ────────────────────────────────────────────────────────────────
  const [viewingRecordDetails, setViewingRecordDetails] = useState<SeqRecord | null>(null);
  const [viewingFeatureDetails, setViewingFeatureDetails] = useState<BioFeature | null>(null);

  // ── Misc UI ───────────────────────────────────────────────────────────────
  const [featureColors, setFeatureColors] = useState<Record<string, string>>({});
  const [jumpTo, setJumpTo] = useState<number | null>(null);
  const [activeSelection, setActiveSelection] = useState<SelectionArea | null>(null);
  const searchSelectionRef = useRef<SelectionArea | null>(null);
  const selectSearchResult = (selection: SelectionArea) => {
    searchSelectionRef.current = selection;
    setActiveTab('alignment');
    setActiveSelection(selection);
  };
  // `focusedRegion` names the selection while it stands; `pendingFocus` asks the
  // viewport to frame it once and is cleared when handled, so a remount does not replay it.
  const [focusedRegion, setFocusedRegion] = useState<FocusTarget | null>(null);
  const [pendingFocus, setPendingFocus] = useState<FocusTarget | null>(null);
  const focusOn = (target: FocusTarget) => {
    setActiveTab('alignment');
    setActiveSelection({ start: target.start, end: target.end, recordIds: [target.recordId] });
    setFocusedRegion(target);
    setPendingFocus(target);
  };
  const [themeKey, setThemeKey] = useState<ThemeKey>(readThemePref);

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

  // ── Helpers ───────────────────────────────────────────────────────────────
  // Details can open from the hub (a copy carrying `index`) or the viewer (the
  // aligned copy, same order as the record's features), so resolve by position.
  const [viewingFeatureIndex, setViewingFeatureIndex] = useState(-1);
  const featureIndexOf = (recordId: string, feature: BioFeature): number => {
    const hubIndex = (feature as BioFeature & { index?: number }).index;
    if (typeof hubIndex === 'number') return hubIndex;
    const own = records.find(r => r.id === recordId)?.features.indexOf(feature) ?? -1;
    return own >= 0 ? own : transposedRecords.find(r => r.id === recordId)?.features.indexOf(feature) ?? -1;
  };

  const handleViewDetails = (recordId: string, feature?: BioFeature) => {
    const record = records.find(r => r.id === recordId);
    if (!record) return;
    const index = feature ? featureIndexOf(recordId, feature) : -1;
    setViewingRecordDetails(record);
    setViewingFeatureDetails(record.features[index] ?? null);
    setViewingFeatureIndex(index);
  };

  const handleSetShowBases = (show: boolean) => {
    const recordId = viewingRecordDetails?.id;
    const index = viewingFeatureIndex;
    if (!recordId || index < 0) return;
    setRecords(prev => prev.map(r => r.id !== recordId ? r : {
      ...r,
      features: r.features.map((f, i) => (i === index ? withAnnotationBases(f, show) : f)),
    }));
    setViewingFeatureDetails(current => (current ? withAnnotationBases(current, show) : current));
  };

  const handleRemoveRecord = (recordId: string) => {
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

    if (viewingRecordDetails?.id === recordId) {
      setViewingRecordDetails(null);
      setViewingFeatureDetails(null);
    }

    addLog(`Sequence ${record.name || record.id} removed from project.`);
  };

  // ── Derived state ─────────────────────────────────────────────────────────
  const { isAlignmentLoaded, alignmentLength, sessionMoleculeType } = useMemo(
    () => deriveAlignmentState(records, isProteinSession),
    [records, isProteinSession],
  );

  const envAccent = resolveEnvAccent(activeTab, sessionMoleculeType);
  const themeStyle = resolveThemeVars(getTheme(themeKey), envAccent) as React.CSSProperties;

  useEffect(() => {
    if (records.length === 0) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [records.length]);

  const handleSetThemeKey = (key: ThemeKey) => {
    writeThemePref(key);
    setThemeKey(key);
  };

  const handleClearAll = () => {
    if (remoteAlignment.isLocked()) return;
    if (records.length === 0) return;
    // Clearing is irreversible, so it always asks; there is deliberately no opt-out.
    const choice = window.prompt('Type CLEAR to remove every record and annotation.', '');
    if (choice?.trim().toUpperCase() !== 'CLEAR') return;
    setRecords([]);
    addLog('Workspace cleared.');
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="app-root flex flex-col h-screen bg-slate-900 text-slate-200 overflow-hidden font-sans select-none"
      data-env={envAccent}
      style={themeStyle}
    >
      <ProcessingOverlay isProcessing={isProcessing && !remoteAlignment.isAlignmentLocked} />

      {viewingRecordDetails && (
        <RecordDetailsModal
          record={viewingRecordDetails}
          feature={viewingFeatureDetails}
          onClose={() => { setViewingRecordDetails(null); setViewingFeatureDetails(null); }}
          onFocusFeature={focusOn}
          onExportRecord={handleExportRecord}
          onCopyLog={addLog}
          onSetShowBases={viewingFeatureDetails && viewingFeatureIndex >= 0 ? handleSetShowBases : undefined}
        />
      )}

      {editing && (
        <FeatureEditorModal
          key={editing.featureIndex === -1 ? 'new' : `${editing.recordId}:${editing.featureIndex}`}
          editing={editing}
          records={records}
          featureColors={featureColors}
          onChange={setEditing}
          onSave={saveEditedFeature}
          onDiscard={() => setEditing(null)}
        />
      )}

      {moleculeTypeMismatch && (
        <MoleculeTypeMismatchModal
          incoming={moleculeTypeMismatch.incoming}
          loaded={moleculeTypeMismatch.loaded}
          fileName={moleculeTypeMismatch.fileName}
          onClose={closeMismatchModal}
        />
      )}

      {remoteAlignment.presentation === 'dialog' && (
        <AlignRemoteModal
          state={remoteAlignment.state}
          count={records.length}
          bytes={remoteAlignment.bytes}
          moleculeKind={remoteAlignment.moleculeKind}
          hasAlignment={records.some(record => !!record.alignedSequence)}
          engineId={remoteAlignment.engineId}
          email={remoteAlignment.email}
          verifiedEmail={remoteAlignment.verifiedEmail}
          verdicts={remoteAlignment.verdicts}
          onMinimize={remoteAlignment.minimize}
          onEngineChange={remoteAlignment.setEngineId}
          onEmailChange={remoteAlignment.setEmail}
          onSubmit={() => { void remoteAlignment.submit(); }}
          onCancel={remoteAlignment.cancel}
          onRetry={remoteAlignment.retry}
        />
      )}

      {remoteAlignment.presentation === 'pill' && <AlignmentJobPill state={remoteAlignment.state} onOpen={remoteAlignment.open} />}

      <TopNav
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        activeTab={activeTab}
        onTabChange={changeTab}
        featureColors={featureColors}
        onSetFeatureColors={setFeatureColors}
        themeKey={themeKey}
        onSetThemeKey={handleSetThemeKey}
        showAlignmentControls={activeTab === 'alignment' && records.length > 0}
        dragMode={dragMode}
        onDragModeChange={setDragMode}
        activeSelection={activeSelection}
        onClearSelection={() => setActiveSelection(null)}
        showAnnotations={showAnnotations}
        onToggleAnnotations={() => setShowAnnotations(!showAnnotations)}
        showTracks={showTracks}
        onToggleTracks={() => setShowTracks(!showTracks)}
        showTranslation={showTranslation}
        onToggleTranslation={() => setShowTranslation(!showTranslation)}
        showConservation={showConservation}
        onToggleConservation={() => setShowConservation(!showConservation)}
        isAlignmentLoaded={isAlignmentLoaded}
        sessionMoleculeType={sessionMoleculeType}
      />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          open={sidebarOpen}
          activeTab={activeTab}
          records={records}
          transposedRecords={transposedRecords}
          activeSelection={activeSelection}
          onSetActiveSelection={setActiveSelection}
          alignmentLength={alignmentLength}
          onSetJumpTo={setJumpTo}
          onFileUpload={handleFileUpload}
          onAlignmentUpload={handleAlignmentUpload}
          onAlignRemote={remoteAlignment.open} remoteAlignmentState={remoteAlignment.state}
          isAlignmentLocked={remoteAlignment.isAlignmentLocked}
          onAnnotationUpload={handleAnnotationUpload}
          onProjectUpload={handleProjectUpload}
          onExportSelection={exportSelection}
          onExportSelectionJson={exportSelectionJson}
          onStartNewFeature={startNewFeature}
          logs={logs}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          searchMode={searchMode}
          onSearchModeChange={setSearchMode}
          searchOptions={searchOptions}
          onSearchOptionsChange={setSearchOptions}
          isSearching={isSearching}
          onSearch={handleSearch}
          onClearSearch={handleClearSearch}
          onSelectSearchResult={selectSearchResult}
          filteredResults={filteredResults}
          groupedSearchResults={groupedSearchResults}
          currentSearchIdx={currentSearchIdx}
          onSetCurrentIdx={setCurrentSearchIdx}
          selectedSearchIndices={selectedSearchIndices}
          onSetSelectedIndices={setSelectedSearchIndices}
          maxScoreFound={maxScoreFound}
          onSetActiveTab={changeTab}
          onRemoveRecord={handleRemoveRecord}
          onToggleRecordSelection={toggleRecordSelection}
          onJoinAllInRecord={joinAllInRecord}
          onJoinSelectedMatches={joinSelectedMatches}
          onAnnotateMatch={addAnnotationFromSearch}
          getSequenceContext={getSequenceContext}
          isProteinSession={isProteinSession}
        />

        <main className="flex-1 bg-slate-900 relative flex flex-col min-h-0 min-w-0 p-1.5">
          {records.length === 0 ? (
            <div className="relative z-10 flex-1 flex flex-col items-center justify-center text-slate-800 animate-in fade-in duration-700">
              <i className="fas fa-dna text-9xl opacity-10 animate-pulse mb-10"></i>
              <p className="text-[12px] font-bold uppercase tracking-[0.8em] text-slate-700">Workspace Empty</p>
              <p className="text-[10px] font-bold text-slate-500 mt-4 italic">"Spend money on Coffee and Personal, not with expensive genial software."</p>
            </div>
          ) : (
            <div className="relative z-10 flex-1 flex flex-col min-h-0 min-w-0 bg-white rounded-xl shadow-2xl overflow-hidden border border-slate-800/50">
              {activeTab === 'alignment' && showHubReturn && hubFocus && (
                <HubReturnPill
                  label={hubFocus.label}
                  onReturn={() => changeTab('features')}
                  onDismiss={() => setShowHubReturn(false)}
                />
              )}
              {/* Keyed by mode so each switch replays a short fade instead of a hard cut. */}
              <div key={activeTab} className="flex-1 flex flex-col min-h-0 min-w-0 animate-in fade-in duration-300 motion-reduce:animate-none">
                {activeTab === 'alignment' ? (
                  <GenomeViewer
                    records={transposedRecords}
                    consensus={consensus}
                    showAnnotations={showAnnotations}
                    showTracks={showTracks}
                    showTranslation={showTranslation}
                    showConservation={showConservation}
                    dragMode={dragMode}
                    activeSelection={activeSelection}
                    onSelectionChange={setActiveSelection}
                    onExportFasta={exportSelection}
                    onAddAnnotation={addAnnotationFromSearch}
                    searchResults={filteredResults}
                    currentSearchIdx={currentSearchIdx}
                    selectedSearchIndices={selectedSearchIndices}
                    customColors={featureColors}
                    jumpTo={jumpTo}
                    focusRequest={pendingFocus}
                    onFocusComplete={() => setPendingFocus(null)}
                    focusedRegion={focusedRegion}
                    onJumpComplete={() => setJumpTo(null)}
                    onExportRecord={handleExportRecord}
                    onViewDetails={handleViewDetails}
                    isAlignmentLocked={remoteAlignment.isAlignmentLocked}
                    onRemoveRecord={handleRemoveRecord}
                  />
                ) : (
                  <AnnotationHubPanel
                    records={records}
                    flattenedFeatures={flattenedFeatures}
                    allFeaturesCount={allFeaturesCount}
                    featureSearch={featureSearch}
                    onFeatureSearchChange={setFeatureSearch}
                    featureColors={featureColors}
                    activeSelection={activeSelection}
                    onStartNewFeature={startNewFeature}
                    onToggleRecordVisibility={toggleRecordVisibility}
                    isAlignmentLocked={remoteAlignment.isAlignmentLocked}
                    onRemoveRecord={handleRemoveRecord}
                    onViewFeatureDetails={handleViewDetails}
                    onEditFeature={(recordId, featureIndex, feature) => setEditing({ recordId, featureIndex, feature })}
                    onRemoveFeature={removeFeature}
                    onFocusItem={(target, origin) => {
                      setHubFocus(origin);
                      setShowHubReturn(true);
                      focusOn(target);
                    }}
                    lastFocusedKey={hubFocus?.key ?? null}
                    onExportAllFasta={exportAllFasta}
                    onExportGenBank={exportGenBankFile}
                    onExportGff={exportGffFile}
                    onExportProjectJson={exportProjectJson}
                    onClearAll={handleClearAll}
                    addLog={addLog}
                  />
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      <StatusBar sessionMoleculeType={sessionMoleculeType} themeKey={themeKey} />

      <TooltipLayer />

    </div>
  );
};

export default App;

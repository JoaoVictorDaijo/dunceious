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


import GenomeViewer from '@/components/GenomeViewer';
import { BioFeature, SelectionArea, SeqRecord } from '@/src/domain/bio/types';
import React, { useEffect, useMemo, useState } from 'react';
import DatabaseHubPanel from './components/DatabaseHubPanel';
import FeatureEditorModal from './components/FeatureEditorModal';
import MoleculeTypeMismatchModal from './components/MoleculeTypeMismatchModal';
import ProcessingOverlay from './components/ProcessingOverlay';
import RecordDetailsModal from './components/RecordDetailsModal';
import { deriveAlignmentState } from '@/src/app/logic/viewModel';
import {
  removeRecordFromProject,
  sanitizeSearchStateAfterRecordRemoval,
  updateSelectionAfterRecordRemoval,
} from './recordRemoval';
import Sidebar from './components/Sidebar';
import StatusBar from './components/StatusBar';
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
  const CLEAR_CONFIRM_PREF_KEY = 'dunceious.skipClearAllConfirmation';
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

  // ── Modals ────────────────────────────────────────────────────────────────
  const [viewingRecordDetails, setViewingRecordDetails] = useState<SeqRecord | null>(null);
  const [viewingFeatureDetails, setViewingFeatureDetails] = useState<BioFeature | null>(null);

  // ── Misc UI ───────────────────────────────────────────────────────────────
  const [featureColors, setFeatureColors] = useState<Record<string, string>>({});
  const [jumpTo, setJumpTo] = useState<number | null>(null);
  const [activeSelection, setActiveSelection] = useState<SelectionArea | null>(null);
  const [skipClearAllConfirmation, setSkipClearAllConfirmation] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(CLEAR_CONFIRM_PREF_KEY) === '1';
  });

  // ── Domain hooks ──────────────────────────────────────────────────────────
  const {
    records,
    setRecords,
    transposedRecords,
    consensus,
    isProcessing,
    setIsProcessing,
    bioWorkerRef,
  } = useBioWorker(addLog);

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
    toggleRecordSelection,
    joinAllInRecord,
    joinSelectedMatches,
    getSequenceContext,
    isProteinSession,
  } = useSearchWorker(records, addLog, addAnnotationFromSearch, selection => {
    setActiveTab('alignment');
    setActiveSelection(selection);
  });

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
  );

  // ── Helpers ───────────────────────────────────────────────────────────────
  const handleViewDetails = (recordId: string, feature?: BioFeature) => {
    const record = records.find(r => r.id === recordId);
    if (record) { setViewingRecordDetails(record); setViewingFeatureDetails(feature || null); }
  };

  const handleRemoveRecord = (recordId: string) => {
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

  useEffect(() => {
    if (records.length === 0) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [records.length]);

  const handleClearAll = () => {
    if (records.length === 0) return;
    if (!skipClearAllConfirmation) {
      const choice = window.prompt(
        'Type CLEAR to confirm. Type CLEAR ALWAYS to confirm and stop asking in this browser.',
        'CLEAR',
      );
      if (!choice) return;
      const normalized = choice.trim().toUpperCase();
      if (normalized !== 'CLEAR' && normalized !== 'CLEAR ALWAYS') return;
      if (normalized === 'CLEAR ALWAYS') {
        window.localStorage.setItem(CLEAR_CONFIRM_PREF_KEY, '1');
        setSkipClearAllConfirmation(true);
      }
    }
    setRecords([]);
    addLog('Workspace cleared.');
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen bg-[#0f172a] text-slate-200 overflow-hidden font-sans select-none">
      <ProcessingOverlay isProcessing={isProcessing} />

      {viewingRecordDetails && (
        <RecordDetailsModal
          record={viewingRecordDetails}
          feature={viewingFeatureDetails}
          onClose={() => { setViewingRecordDetails(null); setViewingFeatureDetails(null); }}
          onFocusFeature={(recordId, start, end) => {
            setActiveTab('alignment');
            setActiveSelection({ start, end, recordIds: [recordId] });
          }}
          onExportRecord={handleExportRecord}
          onCopyLog={addLog}
        />
      )}

      {editing && (
        <FeatureEditorModal
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

      <TopNav
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        activeTab={activeTab}
        onTabChange={setActiveTab}
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
          featureColors={featureColors}
          onSetFeatureColors={setFeatureColors}
          onFileUpload={handleFileUpload}
          onAlignmentUpload={handleAlignmentUpload}
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
          filteredResults={filteredResults}
          groupedSearchResults={groupedSearchResults}
          currentSearchIdx={currentSearchIdx}
          onSetCurrentIdx={setCurrentSearchIdx}
          selectedSearchIndices={selectedSearchIndices}
          onSetSelectedIndices={setSelectedSearchIndices}
          maxScoreFound={maxScoreFound}
          onSetActiveTab={setActiveTab}
          onRemoveRecord={handleRemoveRecord}
          onToggleRecordSelection={toggleRecordSelection}
          onJoinAllInRecord={joinAllInRecord}
          onJoinSelectedMatches={joinSelectedMatches}
          onAnnotateMatch={addAnnotationFromSearch}
          getSequenceContext={getSequenceContext}
          isProteinSession={isProteinSession}
        />

        <main className="flex-1 bg-[#0f172a] relative flex flex-col min-h-0 min-w-0 p-1.5">
          {/* Ambient session-type corner gradients — atmospheric lighting cue */}
          <div
            className={`absolute inset-0 pointer-events-none transition-opacity duration-700 ${
              sessionMoleculeType === 'nucleotide' ? 'opacity-100' : 'opacity-0'
            }`}
            style={{
              background:
                'radial-gradient(ellipse 60% 45% at 100% 0%, rgba(56, 189, 248, 0.18), transparent 65%), radial-gradient(ellipse 50% 40% at 0% 100%, rgba(14, 165, 233, 0.10), transparent 65%)',
            }}
          />
          <div
            className={`absolute inset-0 pointer-events-none transition-opacity duration-700 ${
              sessionMoleculeType === 'protein' ? 'opacity-100' : 'opacity-0'
            }`}
            style={{
              background:
                'radial-gradient(ellipse 60% 45% at 100% 0%, rgba(139, 92, 246, 0.18), transparent 65%), radial-gradient(ellipse 50% 40% at 0% 100%, rgba(99, 102, 241, 0.10), transparent 65%)',
            }}
          />
          {records.length === 0 ? (
            <div className="relative z-10 flex-1 flex flex-col items-center justify-center text-slate-800">
              <i className="fas fa-dna text-9xl opacity-10 animate-pulse mb-10"></i>
              <p className="text-[12px] font-black uppercase tracking-[0.8em] text-slate-700">Workspace Empty</p>
              <p className="text-[10px] font-bold text-slate-500 mt-4 italic">"Spend money on Coffee and Personal, not with expensive genial software."</p>
            </div>
          ) : (
            <div className="relative z-10 flex-1 flex flex-col min-h-0 min-w-0 bg-white rounded-xl shadow-2xl overflow-hidden border border-slate-800/50">
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
                  onJumpComplete={() => setJumpTo(null)}
                  onExportRecord={handleExportRecord}
                  onViewDetails={handleViewDetails}
                  onRemoveRecord={handleRemoveRecord}
                />
              ) : (
                <DatabaseHubPanel
                  records={records}
                  flattenedFeatures={flattenedFeatures}
                  allFeaturesCount={allFeaturesCount}
                  featureSearch={featureSearch}
                  onFeatureSearchChange={setFeatureSearch}
                  featureColors={featureColors}
                  activeSelection={activeSelection}
                  onStartNewFeature={startNewFeature}
                  onToggleRecordVisibility={toggleRecordVisibility}
                  onRemoveRecord={handleRemoveRecord}
                  onViewFeatureDetails={handleViewDetails}
                  onEditFeature={(recordId, featureIndex, feature) => setEditing({ recordId, featureIndex, feature })}
                  onRemoveFeature={removeFeature}
                  onFocusItem={(recordId, start, end) => {
                    setActiveTab('alignment');
                    setActiveSelection({ start, end, recordIds: [recordId] });
                  }}
                  onExportAllFasta={exportAllFasta}
                  onExportGenBank={exportGenBankFile}
                  onExportGff={exportGffFile}
                  onExportProjectJson={exportProjectJson}
                  onClearAll={handleClearAll}
                  addLog={addLog}
                />
              )}
            </div>
          )}
        </main>
      </div>

      <div className="relative shrink-0 h-3 pointer-events-none overflow-hidden">
        <div className={`absolute inset-0 transition-opacity duration-700 bg-gradient-to-t from-sky-500/40 via-sky-500/10 to-transparent ${
          sessionMoleculeType === 'nucleotide' ? 'opacity-100' : 'opacity-0'
        }`} />
        <div className={`absolute inset-0 transition-opacity duration-700 bg-gradient-to-t from-violet-500/40 via-violet-500/10 to-transparent ${
          sessionMoleculeType === 'protein' ? 'opacity-100' : 'opacity-0'
        }`} />
      </div>

      <StatusBar sessionMoleculeType={sessionMoleculeType} />

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes spin-slow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .animate-spin-slow { animation: spin-slow 12s linear infinite; }
        .tracking-tightest { tracking-letter: -0.05em; }
        .seq-scroll { scrollbar-width: thin; scrollbar-color: rgba(148,163,184,0.25) transparent; }
        .seq-scroll::-webkit-scrollbar { height: 3px; }
        .seq-scroll::-webkit-scrollbar-track { background: transparent; }
        .seq-scroll::-webkit-scrollbar-thumb { background: rgba(148,163,184,0.25); border-radius: 9999px; }
        .seq-scroll::-webkit-scrollbar-thumb:hover { background: rgba(148,163,184,0.5); }
      `}} />
    </div>
  );
};

export default App;

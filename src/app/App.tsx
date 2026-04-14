import React, { useState, useMemo, useRef, useEffect } from 'react';
import { SeqRecord, SelectionArea, BioFeature } from '@/src/domain/bio/types';
import GenomeViewer from '@/components/GenomeViewer';
import ProcessingOverlay from './components/ProcessingOverlay';
import StatusBar from './components/StatusBar';
import TopNav from './components/TopNav';
import Sidebar from './components/Sidebar';
import RecordDetailsModal from './components/RecordDetailsModal';
import FeatureEditorModal from './components/FeatureEditorModal';
import DatabaseHubPanel from './components/DatabaseHubPanel';
import {
  useAppLogger,
  useBioWorker,
  useSearchWorker,
  useFeatureManager,
  useFileHandlers,
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

  // ── Modals ────────────────────────────────────────────────────────────────
  const [viewingRecordDetails, setViewingRecordDetails] = useState<SeqRecord | null>(null);
  const [viewingFeatureDetails, setViewingFeatureDetails] = useState<BioFeature | null>(null);

  // ── Misc UI ───────────────────────────────────────────────────────────────
  const [featureColors, setFeatureColors] = useState<Record<string, string>>({});
  const [jumpTo, setJumpTo] = useState<number | null>(null);
  const [listHeight, setListHeight] = useState(600);
  const [activeSelection, setActiveSelection] = useState<SelectionArea | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // ── Container resize observer ─────────────────────────────────────────────
  useEffect(() => {
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        if (entry.target === containerRef.current) {
          setListHeight(entry.contentRect.height - 250);
        }
      }
    });
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

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

  // ── Derived state ─────────────────────────────────────────────────────────
  const isAlignmentLoaded = useMemo(() => {
    if (records.length < 2) return false;
    return new Set(records.map(r => (r.alignedSequence || r.sequence).length)).size === 1;
  }, [records]);

  const alignmentLength = useMemo(() => {
    if (records.length === 0) return 0;
    return Math.max(...records.map(r => (r.alignedSequence || r.sequence).length));
  }, [records]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen bg-[#0f172a] text-slate-200 overflow-hidden font-sans select-none" ref={containerRef}>
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
          onToggleRecordSelection={toggleRecordSelection}
          onJoinAllInRecord={joinAllInRecord}
          onJoinSelectedMatches={joinSelectedMatches}
          onAnnotateMatch={addAnnotationFromSearch}
          getSequenceContext={getSequenceContext}
        />

        <main className="flex-1 bg-[#0f172a] relative flex flex-col min-h-0 min-w-0 p-1.5">
          {records.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-800">
              <i className="fas fa-dna text-9xl opacity-10 animate-pulse mb-10"></i>
              <p className="text-[12px] font-black uppercase tracking-[0.8em] text-slate-700">Workspace Empty</p>
              <p className="text-[10px] font-bold text-slate-500 mt-4 italic">"Spend money on Coffee and Personal, not with expensive genial software."</p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-white rounded-xl shadow-2xl overflow-hidden border border-slate-800/50">
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
                />
              ) : (
                <DatabaseHubPanel
                  records={records}
                  flattenedFeatures={flattenedFeatures}
                  allFeaturesCount={allFeaturesCount}
                  featureSearch={featureSearch}
                  onFeatureSearchChange={setFeatureSearch}
                  featureColors={featureColors}
                  listHeight={listHeight}
                  activeSelection={activeSelection}
                  onStartNewFeature={startNewFeature}
                  onToggleRecordVisibility={toggleRecordVisibility}
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
                  onClearAll={() => setRecords([])}
                  addLog={addLog}
                />
              )}
            </div>
          )}
        </main>
      </div>

      <StatusBar />

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes spin-slow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .animate-spin-slow { animation: spin-slow 12s linear infinite; }
        .tracking-tightest { tracking-letter: -0.05em; }
      `}} />
    </div>
  );
};

export default App;

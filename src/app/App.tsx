import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { SeqRecord, SelectionArea, BioFeature, SearchResult, QuantitativeTrack } from '@/src/domain/bio/types';
import { exportToFasta, downloadBlob, exportToGff, exportToGenBank, getOriginalPos, sliceRecordsBySelection } from '@/services/bioUtils';
import type {
  BioWorkerRequest,
  BioWorkerResponse,
  SearchWorkerRequest,
  SearchWorkerResponse,
} from '@/src/workers/protocol';
import GenomeViewer from '@/components/GenomeViewer';
import ProcessingOverlay from './components/ProcessingOverlay';
import StatusBar from './components/StatusBar';
import TopNav from './components/TopNav';
import Sidebar from './components/Sidebar';
import RecordDetailsModal from './components/RecordDetailsModal';
import FeatureEditorModal, { EditingFeatureState } from './components/FeatureEditorModal';
import DatabaseHubPanel, { FlatItem } from './components/DatabaseHubPanel';
import type { GroupedSearchResults } from './components/SearchPanel';

// ---------------------------------------------------------------------------
// App — composition root
// All state and orchestration lives here; extracted components receive props.
// State will be migrated to feature hooks in Phase 3.
// ---------------------------------------------------------------------------

const App: React.FC = () => {
  // ── Records & alignment ──────────────────────────────────────────────────
  const [records, setRecords] = useState<SeqRecord[]>([]);
  const [transposedRecords, setTransposedRecords] = useState<SeqRecord[]>([]);
  const [consensus, setConsensus] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);

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
  const [editing, setEditing] = useState<EditingFeatureState | null>(null);

  // ── Misc UI ───────────────────────────────────────────────────────────────
  const [featureColors, setFeatureColors] = useState<Record<string, string>>({});
  const [jumpTo, setJumpTo] = useState<number | null>(null);
  const [listHeight, setListHeight] = useState(600);
  const [logs, setLogs] = useState<string[]>(['Dunceious Pro v3.3 [Unified Workspace] initialized. Ready for research.']);
  const [activeSelection, setActiveSelection] = useState<SelectionArea | null>(null);
  const [featureSearch, setFeatureSearch] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);

  const addLog = (msg: string) => setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 49)]);

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

  // ── Bio worker ────────────────────────────────────────────────────────────
  const bioWorkerRef = useRef<Worker | null>(null);

  useEffect(() => {
    bioWorkerRef.current = new Worker(new URL('@/src/workers/bioWorker.ts', import.meta.url), { type: 'module' });
    bioWorkerRef.current.onmessage = (e: MessageEvent<BioWorkerResponse>) => {
      const msg = e.data;
      if (msg.type === 'SUCCESS') {
        setTransposedRecords(msg.records);
        setConsensus(msg.consensus);
        setIsProcessing(false);
        addLog(`Genomic processing complete. ${msg.records.length} records ready.`);
      } else if (msg.type === 'PARSE_SUCCESS') {
        const newRecords = msg.records.map(r => ({ ...r, visible: true }));
        setRecords(prev => [...prev, ...newRecords]);
        setIsProcessing(false);
        addLog(`Batch ingestion complete: ${newRecords.length} records added.`);
      } else if (msg.type === 'ANNOTATIONS_SUCCESS') {
        const annotations = msg.annotations;
        setRecords(prev => {
          let totalAdded = 0;
          const matchedIds = new Set<string>();
          /** Look up annotation items by record id, name, or accession. */
          const lookupItems = (r: SeqRecord) =>
            annotations[r.id] ?? annotations[r.name] ?? (r.accession ? annotations[r.accession] : undefined) ?? [];
          const next = prev.map(r => {
            const items = lookupItems(r);
            if (items.length > 0) {
              // Discriminant: only QuantitativeTrack carries a `data` array field
              const newFeats = items.filter((i): i is BioFeature => !('data' in i));
              const newTracks = items.filter((i): i is QuantitativeTrack => 'data' in i);
              totalAdded += items.length;
              matchedIds.add(r.id);
              return {
                ...r,
                features: [...r.features, ...newFeats],
                tracks: [...(r.tracks ?? []), ...newTracks]
              };
            }
            return r;
          });
          const fileIds = Object.keys(annotations);
          const unmatched = fileIds.filter(id => !prev.some(r => r.id === id || r.name === id || r.accession === id));
          if (unmatched.length > 0) {
            addLog(`WARNING: Some IDs in file did not match active records: [${unmatched.slice(0, 5).join(', ')}${unmatched.length > 5 ? '...' : ''}]`);
          }
          addLog(`Annotation import complete: ${totalAdded} features added across records.`);
          return next;
        });
        setIsProcessing(false);
      } else if (msg.type === 'FASTA_SUCCESS') {
        const alignedData = msg.alignedData;
        setRecords(prev => {
          const currentIds = new Set(prev.map(r => r.id));
          const uploadedIds = new Set(alignedData.map(d => d.id));
          const missingInUpload = prev.filter(r => !uploadedIds.has(r.id)).map(r => r.id);
          const extraInUpload = alignedData.filter(d => !currentIds.has(d.id)).map(d => d.id);
          if (missingInUpload.length > 0 || extraInUpload.length > 0) {
            addLog(`ERROR: Sequence mismatch. Missing: [${missingInUpload.join(', ')}], Extra: [${extraInUpload.join(', ')}]`);
            return prev;
          }
          const lengths = new Set(alignedData.map(d => d.sequence.length));
          if (lengths.size > 1) {
            addLog(`ERROR: Aligned sequences must have identical lengths. Found: ${Array.from(lengths).join(', ')}`);
            return prev;
          }
          addLog(`External alignment applied successfully (${alignedData[0]?.sequence.length ?? 0} bp).`);
          return prev.map(r => {
            const match = alignedData.find(d => d.id === r.id);
            return { ...r, alignedSequence: match?.sequence };
          });
        });
        setIsProcessing(false);
      } else if (msg.type === 'ERROR') {
        setIsProcessing(false);
        addLog(`Processing Error: ${msg.error}`);
      }
    };
    return () => { bioWorkerRef.current?.terminate(); };
  }, []);

  useEffect(() => {
    const visibleRecords = records.filter(r => r.visible !== false);
    if (visibleRecords.length > 0) {
      setIsProcessing(true);
      const request: BioWorkerRequest = { type: 'PROCESS_RECORDS', records: visibleRecords };
      bioWorkerRef.current?.postMessage(request);
    } else {
      setTransposedRecords([]);
      setConsensus('');
    }
  }, [records]);

  // ── Search worker ─────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMode, setSearchMode] = useState<'exact' | 'fuzzy'>('exact');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [currentSearchIdx, setCurrentSearchIdx] = useState(-1);
  const [selectedSearchIndices, setSelectedSearchIndices] = useState<Set<number>>(new Set());
  const [isSearching, setIsSearching] = useState(false);
  const [searchOptions, setSearchOptions] = useState({
    minScore: 20,
    strand: 'both' as 'fwd' | 'rev' | 'both',
    maxResults: 100
  });
  const [maxScoreFound, setMaxScoreFound] = useState(0);

  const searchWorkerRef = useRef<Worker | null>(null);

  const filteredResults = useMemo(() => {
    if (searchMode !== 'fuzzy' || maxScoreFound === 0) return searchResults;
    return searchResults.filter(r => ((r.score ?? 0) / maxScoreFound) * 100 >= searchOptions.minScore);
  }, [searchResults, searchMode, maxScoreFound, searchOptions.minScore]);

  useEffect(() => {
    searchWorkerRef.current = new Worker(new URL('@/src/workers/searchWorker.ts', import.meta.url), { type: 'module' });
    searchWorkerRef.current.onmessage = (e: MessageEvent<SearchWorkerResponse>) => {
      const msg = e.data;
      setIsSearching(false);
      if ('error' in msg) { addLog(`Search Error: ${msg.error}`); return; }
      const { results } = msg;
      const max = results.length > 0 ? Math.max(...results.map(r => r.score ?? 0)) : 0;
      setMaxScoreFound(max);
      setSearchResults(results);
      if (results.length > 0) {
        setCurrentSearchIdx(0);
        const first = results[0];
        setTimeout(() => {
          setActiveTab('alignment');
          setActiveSelection({ start: first.start, end: first.end, recordIds: [first.recordId] });
        }, 0);
        addLog(`Search complete: ${results.length} matches found.`);
      } else {
        setCurrentSearchIdx(-1);
        addLog(`No matches found for '${searchQuery}'.`);
      }
    };
    return () => { searchWorkerRef.current?.terminate(); };
  }, [searchQuery]);

  const handleSearch = useCallback(() => {
    if (!searchQuery || searchQuery.length < 2) {
      setSearchResults([]);
      setCurrentSearchIdx(-1);
      setSelectedSearchIndices(new Set());
      return;
    }
    setIsSearching(true);
    setSelectedSearchIndices(new Set());
    addLog(`Initiating ${searchMode} search for '${searchQuery}'...`);
    const workerMinScore = searchMode === 'fuzzy' ? 5 : 0;
    const request: SearchWorkerRequest = {
      searchQuery,
      records,
      mode: searchMode,
      options: { ...searchOptions, minScore: workerMinScore }
    };
    searchWorkerRef.current?.postMessage(request);
  }, [searchQuery, records, searchMode, searchOptions]);

  const groupedSearchResults = useMemo<GroupedSearchResults>(() => {
    const groups: GroupedSearchResults = {};
    filteredResults.forEach((r, idx) => {
      if (!groups[r.recordId]) groups[r.recordId] = { results: [], indices: [] };
      groups[r.recordId].results.push(r);
      groups[r.recordId].indices.push(idx);
    });
    return groups;
  }, [filteredResults]);

  const toggleRecordSelection = (recordId: string, select: boolean) => {
    const group = groupedSearchResults[recordId];
    if (!group) return;
    const next = new Set(selectedSearchIndices);
    group.indices.forEach(idx => { if (select) next.add(idx); else next.delete(idx); });
    setSelectedSearchIndices(next);
  };

  const joinAllInRecord = (recordId: string) => {
    const group = groupedSearchResults[recordId];
    if (!group || group.results.length < 2) return;
    const strand = group.results[0].strand;
    if (group.results.some(r => r.strand !== strand)) {
      alert('All matches in the record must have the same strand to be joined automatically.');
      return;
    }
    const segments = group.results.map(r => ({ start: r.start, end: r.end })).sort((a, b) => a.start - b.start);
    addAnnotationFromSearch(recordId, segments[0].start, segments[segments.length - 1].end, `Joined Record Search: ${searchQuery}`, segments);
  };

  const getSequenceContext = (recordId: string, start: number, end: number, contextLen = 8) => {
    const record = records.find(r => r.id === recordId);
    if (!record) return { pre: '', match: '', post: '' };
    const seq = record.alignedSequence || record.sequence;
    return {
      pre: seq.substring(Math.max(0, start - contextLen), start),
      match: seq.substring(start, end),
      post: seq.substring(end, Math.min(seq.length, end + contextLen)),
    };
  };

  // ── Feature management ────────────────────────────────────────────────────
  const groupedFeatures = useMemo(() => {
    const groups: Record<string, (BioFeature & { index: number })[]> = {};
    const search = featureSearch.toLowerCase();
    records.forEach(r => {
      groups[r.id] = r.features
        .map((f, idx) => ({ ...f, index: idx }))
        .filter(f => {
          const inName = f.name.toLowerCase().includes(search);
          const inType = f.type.toLowerCase().includes(search);
          const inDef = r.definition?.toLowerCase().includes(search);
          const inMeta = f.metadata ? Object.values(f.metadata).some(v => v.toLowerCase().includes(search)) : false;
          return inName || inType || inDef || inMeta;
        });
    });
    return groups;
  }, [records, featureSearch]);

  const allFeaturesCount = useMemo(() => records.reduce((acc, r) => acc + r.features.length, 0), [records]);

  const flattenedFeatures = useMemo<FlatItem[]>(() => {
    const items: FlatItem[] = [];
    Object.entries(groupedFeatures).forEach(([recordId, features]) => {
      const record = records.find(r => r.id === recordId);
      const tracks = record?.tracks || [];
      if (features.length === 0 && tracks.length === 0 && featureSearch) return;
      items.push({ type: 'header', recordId, count: features.length + tracks.length });
      tracks.forEach(t => items.push({ type: 'track', recordId, track: t }));
      features.forEach(f => items.push({ type: 'feature', recordId, feature: f }));
    });
    return items;
  }, [groupedFeatures, records, featureSearch]);

  const toggleRecordVisibility = (recordId: string) => {
    setRecords(prev => prev.map(r => r.id === recordId ? { ...r, visible: !r.visible } : r));
  };

  const removeFeature = useCallback((recordId: string, featureIndex: number) => {
    setRecords(prev => prev.map(r => {
      if (r.id !== recordId) return r;
      const newFeatures = [...r.features];
      const removed = newFeatures.splice(featureIndex, 1);
      addLog(`Removed feature: ${removed[0].name}`);
      return { ...r, features: newFeatures };
    }));
  }, []);

  const saveEditedFeature = () => {
    if (!editing) return;
    const { recordId, featureIndex, feature } = editing;
    setRecords(prev => prev.map(r => {
      if (r.id !== recordId) return r;
      const newFeatures = [...r.features];
      if (featureIndex === -1) newFeatures.push(feature);
      else newFeatures[featureIndex] = feature;
      return { ...r, features: newFeatures };
    }));
    addLog(featureIndex === -1 ? `New feature '${feature.name}' created.` : 'Feature metadata updated.');
    setEditing(null);
  };

  const startNewFeature = () => {
    if (records.length === 0) return;
    let start = 0, end = 100;
    let targetRecordId = records[0].id;
    if (activeSelection) {
      targetRecordId = activeSelection.recordIds[0] || records[0].id;
      const targetRecord = records.find(r => r.id === targetRecordId);
      if (targetRecord) {
        start = getOriginalPos(targetRecord.alignedSequence || targetRecord.sequence, Math.min(activeSelection.start, activeSelection.end));
        end = getOriginalPos(targetRecord.alignedSequence || targetRecord.sequence, Math.max(activeSelection.start, activeSelection.end));
      }
    }
    setEditing({ recordId: targetRecordId, featureIndex: -1, feature: { name: 'New Feature', type: 'misc_feature', start, end, strand: 1 } });
  };

  const addAnnotationFromSearch = (recordId: string, start: number, end: number, name: string, segments?: { start: number; end: number }[]) => {
    const targetRecord = records.find(r => r.id === recordId);
    let finalStart = start, finalEnd = end, finalSegments = segments;
    if (targetRecord) {
      const seq = targetRecord.alignedSequence || targetRecord.sequence;
      finalStart = getOriginalPos(seq, start);
      finalEnd = getOriginalPos(seq, end);
      if (segments) {
        finalSegments = segments.map(seg => ({ start: getOriginalPos(seq, seg.start), end: getOriginalPos(seq, seg.end) })).sort((a, b) => a.start - b.start);
      }
    }
    setEditing({ recordId, featureIndex: -1, feature: { name, type: 'misc_feature', start: finalStart, end: finalEnd, strand: 1, segments: finalSegments } });
    addLog(`Preparing annotation for match${segments ? ' (multi-segment)' : ''} at ${finalStart} bp.`);
  };

  const joinSelectedMatches = () => {
    if (selectedSearchIndices.size < 2) return;
    const indices = Array.from(selectedSearchIndices).sort((a, b) => a - b);
    const matches = indices.map(i => filteredResults[i]);
    const recordId = matches[0].recordId;
    const strand = matches[0].strand;
    if (matches.some(m => m.recordId !== recordId || m.strand !== strand)) {
      alert('All selected matches must be on the same sequence and strand to be joined.');
      return;
    }
    const segments = matches.map(m => ({ start: m.start, end: m.end }));
    addAnnotationFromSearch(recordId, Math.min(...segments.map(s => s.start)), Math.max(...segments.map(s => s.end)), `Joined Search: ${searchQuery}`, segments);
  };

  // ── Export helpers ────────────────────────────────────────────────────────
  const exportSelection = () => {
    const start = activeSelection ? Math.min(activeSelection.start, activeSelection.end) : undefined;
    const end = activeSelection ? Math.max(activeSelection.start, activeSelection.end) : undefined;
    downloadBlob(exportToFasta(records, start, end), activeSelection ? 'selection_export.fasta' : 'msa_export.fasta', 'text/plain');
    addLog(`${activeSelection ? 'Selection' : 'Full'} FASTA exported.`);
  };

  const exportSelectionJson = () => {
    if (!activeSelection) { addLog('No selection active for JSON export.'); return; }
    const start = Math.min(activeSelection.start, activeSelection.end);
    const end = Math.max(activeSelection.start, activeSelection.end);
    const project: any = { records: sliceRecordsBySelection(records, start, end), featureColors, selectionRange: { start, end }, version: '3.4', exportedAt: new Date().toISOString() };
    downloadBlob(JSON.stringify(project, null, 2), `selection_${start}_${end}.json`, 'application/json');
    addLog(`Selection JSON exported (${start}-${end}).`);
  };

  const exportAllFasta = () => {
    downloadBlob(exportToFasta(records), 'all_sequences.fasta', 'text/plain');
    addLog('Full FASTA (all records) exported.');
  };

  const handleExportRecord = (recordId: string) => {
    const record = records.find(r => r.id === recordId);
    if (!record) return;
    downloadBlob(exportToFasta([record]), `${record.id.replace(/[^a-z0-9]/gi, '_')}.fasta`, 'text/plain');
    addLog(`Exported record ${record.id} to FASTA.`);
  };

  const exportGenBankFile = () => {
    downloadBlob(exportToGenBank(records), 'sequences_with_features.gb', 'text/plain');
    addLog('GenBank file exported (includes new features).');
  };

  const exportGffFile = () => {
    downloadBlob(exportToGff(records), 'annotations.gff', 'text/plain');
    addLog('GFF3 exported.');
  };

  const exportProjectJson = () => {
    const project: any = { records, featureColors, activeSelection, showAnnotations, showTranslation, showConservation, version: '3.4' };
    downloadBlob(JSON.stringify(project, null, 2), 'dunceious_project.json', 'application/json');
    addLog('Project JSON exported.');
  };

  // ── File upload handlers ──────────────────────────────────────────────────
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    setIsProcessing(true);
    addLog(`Ingesting batch: ${files.length} GenBank files.`);
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => {
        const request: BioWorkerRequest = { type: 'PARSE_GENBANK', content: ev.target?.result as string };
        bioWorkerRef.current?.postMessage(request);
      };
      reader.readAsText(file);
    });
  };

  const handleAlignmentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || records.length === 0) return;
    setIsProcessing(true);
    addLog(`Importing external alignment: ${file.name}`);
    const reader = new FileReader();
    reader.onload = ev => {
      const request: BioWorkerRequest = { type: 'PARSE_FASTA', content: ev.target?.result as string };
      bioWorkerRef.current?.postMessage(request);
    };
    reader.readAsText(file);
  };

  const handleAnnotationUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || records.length === 0) return;
    setIsProcessing(true);
    addLog(`Importing annotations from ${files.length} files...`);
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => {
        const request: BioWorkerRequest = { type: 'PARSE_ANNOTATIONS', filename: file.name, content: ev.target?.result as string };
        bioWorkerRef.current?.postMessage(request);
      };
      reader.readAsText(file);
    });
  };

  const handleProjectUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessing(true);
    addLog(`Loading project: ${file.name}`);
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const project = JSON.parse(ev.target?.result as string);
        if (project.records) setRecords(project.records.map((r: any) => ({ ...r, visible: r.visible !== undefined ? r.visible : true })));
        if (project.featureColors) setFeatureColors(project.featureColors);
        if (project.activeSelection) setActiveSelection(project.activeSelection);
        if (project.showAnnotations !== undefined) setShowAnnotations(project.showAnnotations);
        if (project.showTranslation !== undefined) setShowTranslation(project.showTranslation);
        if (project.showConservation !== undefined) setShowConservation(project.showConservation);
        addLog('Project loaded successfully.');
      } catch (err) {
        addLog(`Error loading project: ${err}`);
      }
      setIsProcessing(false);
    };
    reader.readAsText(file);
  };

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
          filteredResults={filteredResults as SearchResult[]}
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
                  searchResults={searchResults}
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

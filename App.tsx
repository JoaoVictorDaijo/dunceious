
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { VariableSizeList } from 'react-window';
import { SeqRecord, WorkflowStep, AlignmentParams, DEFAULT_PARAMS, AlignmentMode, SelectionArea, BioFeature, SearchResult } from './types';
import { parseGenBank } from './services/genbankParser';
import { mockAlign, processTransposition } from './services/alignmentLogic';
import GenomeViewer from './components/GenomeViewer';
import { exportToFasta, downloadBlob, getFeatureColor, exportToGff, parseFasta, exportToGenBank, getOriginalPos } from './services/bioUtils';

interface EditingFeatureState {
  recordId: string;
  featureIndex: number; // -1 for new features
  feature: BioFeature;
}

const App: React.FC = () => {
  const [records, setRecords] = useState<SeqRecord[]>([]);
  const [transposedRecords, setTransposedRecords] = useState<SeqRecord[]>([]);
  const [consensus, setConsensus] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [showTranslation, setShowTranslation] = useState(true);
  const [showTracks, setShowTracks] = useState(true);
  const [showConservation, setShowConservation] = useState(false);
  const [dragMode, setDragMode] = useState<'pan' | 'select'>('select');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<'alignment' | 'features'>('alignment');
  const [viewingRecordDetails, setViewingRecordDetails] = useState<SeqRecord | null>(null);
  const [viewingFeatureDetails, setViewingFeatureDetails] = useState<BioFeature | null>(null);
  const [featureColors, setFeatureColors] = useState<Record<string, string>>({});
  const [jumpTo, setJumpTo] = useState<number | null>(null);
  const [listHeight, setListHeight] = useState(600);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new ResizeObserver(entries => {
      for (let entry of entries) {
        if (entry.target === containerRef.current) {
          setListHeight(entry.contentRect.height - 250);
        }
      }
    });
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);
  const [logs, setLogs] = useState<string[]>(['Dunceious Pro v3.3 [Unified Workspace] initialized. Ready for research.']);
  const [activeSelection, setActiveSelection] = useState<SelectionArea | null>(null);
  const [featureSearch, setFeatureSearch] = useState('');
  const [editing, setEditing] = useState<EditingFeatureState | null>(null);

  const bioWorkerRef = useRef<Worker | null>(null);

  useEffect(() => {
    bioWorkerRef.current = new Worker(new URL('./src/workers/bioWorker.ts', import.meta.url), { type: 'module' });
    bioWorkerRef.current.onmessage = (e) => {
      const { type, records: transposed, consensus: newConsensus, error } = e.data;
      if (type === 'SUCCESS') {
        setTransposedRecords(transposed);
        setConsensus(newConsensus);
        setIsProcessing(false);
        addLog(`Genomic processing complete. ${transposed.length} records ready.`);
      } else if (type === 'PARSE_SUCCESS') {
        const newRecords = e.data.records.map((r: any) => ({ ...r, visible: true }));
        setRecords(prev => [...prev, ...newRecords]);
        setIsProcessing(false);
        addLog(`Batch ingestion complete: ${newRecords.length} records added.`);
      } else if (type === 'ANNOTATIONS_SUCCESS') {
        const annotations = e.data.annotations;
        setRecords(prev => {
          let totalAdded = 0;
          const matchedIds = new Set<string>();
          const next = prev.map(r => {
            // Try matching by ID, Name, or Accession
            const items = annotations[r.id] || annotations[r.name] || (r.accession ? annotations[r.accession] : []) || [];
            if (items.length > 0) {
              const newFeats = items.filter((i: any) => i.type !== 'track');
              const newTracks = items.filter((i: any) => i.type === 'track');
              totalAdded += items.length;
              matchedIds.add(r.id);
              return { 
                ...r, 
                features: [...r.features, ...newFeats],
                tracks: [...(r.tracks || []), ...newTracks]
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
      } else if (type === 'FASTA_SUCCESS') {
        const alignedData = e.data.alignedData;
        setRecords(prev => {
          const currentIds = new Set(prev.map(r => r.id));
          const uploadedIds = new Set(alignedData.map((d: any) => d.id));
          
          const missingInUpload = prev.filter(r => !uploadedIds.has(r.id)).map(r => r.id);
          const extraInUpload = alignedData.filter((d: any) => !currentIds.has(d.id)).map((d: any) => d.id);

          if (missingInUpload.length > 0 || extraInUpload.length > 0) {
            addLog(`ERROR: Sequence mismatch. Missing: [${missingInUpload.join(', ')}], Extra: [${extraInUpload.join(', ')}]`);
            return prev;
          }

          const lengths = new Set(alignedData.map((d: any) => d.sequence.length));
          if (lengths.size > 1) {
            addLog(`ERROR: Aligned sequences must have identical lengths. Found: ${Array.from(lengths).join(', ')}`);
            return prev;
          }

          addLog(`External alignment applied successfully (${alignedData[0].sequence.length} bp).`);
          return prev.map(r => {
            const match = alignedData.find((d: any) => d.id === r.id);
            return { ...r, alignedSequence: match?.sequence };
          });
        });
        setIsProcessing(false);
      } else if (type === 'ERROR') {
        setIsProcessing(false);
        addLog(`Processing Error: ${error}`);
      }
    };

    return () => {
      bioWorkerRef.current?.terminate();
    };
  }, []);

  useEffect(() => {
    const visibleRecords = records.filter(r => r.visible !== false);
    if (visibleRecords.length > 0) {
      setIsProcessing(true);
      bioWorkerRef.current?.postMessage({ type: 'PROCESS_RECORDS', records: visibleRecords });
    } else {
      setTransposedRecords([]);
      setConsensus('');
    }
  }, [records]);

  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMode, setSearchMode] = useState<'exact' | 'fuzzy'>('exact');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [currentSearchIdx, setCurrentSearchIdx] = useState(-1);
  const [selectedSearchIndices, setSelectedSearchIndices] = useState<Set<number>>(new Set());
  const [isSearching, setIsSearching] = useState(false);
  const [searchOptions, setSearchOptions] = useState({
    minScore: 20, // This will now be a percentage (0-100)
    strand: 'both' as 'fwd' | 'rev' | 'both',
    maxResults: 100
  });
  const [maxScoreFound, setMaxScoreFound] = useState(0);

  const searchWorkerRef = useRef<Worker | null>(null);

  const filteredResults = useMemo(() => {
    if (searchMode !== 'fuzzy' || maxScoreFound === 0) return searchResults;
    return searchResults.filter(r => (r.score / maxScoreFound) * 100 >= searchOptions.minScore);
  }, [searchResults, searchMode, maxScoreFound, searchOptions.minScore]);

  useEffect(() => {
    searchWorkerRef.current = new Worker(new URL('./src/workers/searchWorker.ts', import.meta.url), { type: 'module' });
    searchWorkerRef.current.onmessage = (e) => {
      const { results, error } = e.data;
      setIsSearching(false);
      if (error) {
        addLog(`Search Error: ${error}`);
        return;
      }
      
      // Calculate max score for relative percentage
      const max = results.length > 0 ? Math.max(...results.map((r: any) => r.score || 0)) : 0;
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

    return () => {
      searchWorkerRef.current?.terminate();
    };
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
    
    // Pass a low base threshold to worker, we'll filter/display relatively in UI
    const workerMinScore = searchMode === 'fuzzy' ? 5 : 0;

    searchWorkerRef.current?.postMessage({ 
      searchQuery, 
      records, 
      mode: searchMode,
      options: { ...searchOptions, minScore: workerMinScore }
    });
  }, [searchQuery, records, searchMode, searchOptions]);

  const groupedSearchResults = useMemo(() => {
    const groups: Record<string, { results: SearchResult[], indices: number[] }> = {};
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
    group.indices.forEach(idx => {
      if (select) next.add(idx);
      else next.delete(idx);
    });
    setSelectedSearchIndices(next);
  };

  const joinAllInRecord = (recordId: string) => {
    const group = groupedSearchResults[recordId];
    if (!group || group.results.length < 2) return;
    
    // Check strand consistency
    const strand = group.results[0].strand;
    if (group.results.some(r => r.strand !== strand)) {
      alert("All matches in the record must have the same strand to be joined automatically.");
      return;
    }

    const segments = group.results.map(r => ({ start: r.start, end: r.end })).sort((a, b) => a.start - b.start);
    const minStart = segments[0].start;
    const maxEnd = segments[segments.length - 1].end;

    addAnnotationFromSearch(recordId, minStart, maxEnd, `Joined Record Search: ${searchQuery}`, segments);
  };

  const getSequenceContext = (recordId: string, start: number, end: number, contextLen = 8) => {
    const record = records.find(r => r.id === recordId);
    if (!record) return { pre: '', match: '', post: '' };
    const seq = record.alignedSequence || record.sequence;
    const pre = seq.substring(Math.max(0, start - contextLen), start);
    const match = seq.substring(start, end);
    const post = seq.substring(end, Math.min(seq.length, end + contextLen));
    return { pre, match, post };
  };

  const nextMatch = () => {
    if (filteredResults.length === 0) return;
    const nextIdx = (currentSearchIdx + 1) % filteredResults.length;
    setCurrentSearchIdx(nextIdx);
    const match = filteredResults[nextIdx];
    setActiveTab('alignment');
    setActiveSelection({ start: match.start, end: match.end, recordIds: [match.recordId] });
  };

  const prevMatch = () => {
    if (filteredResults.length === 0) return;
    const prevIdx = (currentSearchIdx - 1 + filteredResults.length) % filteredResults.length;
    setCurrentSearchIdx(prevIdx);
    const match = filteredResults[prevIdx];
    setActiveTab('alignment');
    setActiveSelection({ start: match.start, end: match.end, recordIds: [match.recordId] });
  };

  const addLog = (msg: string) => setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 49)]);

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

  const isFeatureInSelection = useCallback((f: BioFeature) => {
    if (!activeSelection) return false;
    return f.start === activeSelection.start && f.end === activeSelection.end;
  }, [activeSelection]);

  const removeFeature = useCallback((recordId: string, featureIndex: number) => {
    setRecords(prev => prev.map(r => {
      if (r.id !== recordId) return r;
      const newFeatures = [...r.features];
      const removed = newFeatures.splice(featureIndex, 1);
      addLog(`Removed feature: ${removed[0].name}`);
      return { ...r, features: newFeatures };
    }));
  }, [addLog]);

  const allFeaturesCount = useMemo(() => records.reduce((acc, r) => acc + r.features.length, 0), [records]);

  const flattenedFeatures = useMemo(() => {
    const items: any[] = [];
    Object.entries(groupedFeatures).forEach(([recordId, features]) => {
      const record = records.find(r => r.id === recordId);
      const tracks = record?.tracks || [];
      
      if (features.length === 0 && tracks.length === 0 && featureSearch) return;
      
      items.push({ type: 'header', recordId, count: features.length + tracks.length });
      
      tracks.forEach(t => {
        items.push({ type: 'track', recordId, track: t });
      });
      
      features.forEach(f => {
        items.push({ type: 'feature', recordId, feature: f });
      });
    });
    return items;
  }, [groupedFeatures, records, featureSearch]);

  const hubListRef = useRef<VariableSizeList>(null);

  const toggleRecordVisibility = (recordId: string) => {
    setRecords(prev => prev.map(r => r.id === recordId ? { ...r, visible: !r.visible } : r));
  };

  const HubRow = useCallback(({ index, style }: { index: number, style: React.CSSProperties }) => {
    const item = flattenedFeatures[index];
    if (!item) return null;

    if (item.type === 'header') {
      const record = records.find(r => r.id === item.recordId);
      const isVisible = record?.visible !== false;
      return (
        <div style={style} className="bg-slate-100/50 border-b border-slate-200 px-8 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-4">
            <input 
              type="checkbox" 
              checked={isVisible} 
              onChange={() => toggleRecordVisibility(item.recordId)}
              className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
            />
            <div className="flex flex-col">
              <span className="text-[10px] font-black uppercase tracking-widest text-sky-600">
                {record?.name || item.recordId}
                {record?.isCircular && (
                  <span className="ml-2 px-2 py-0.5 rounded bg-amber-100 text-amber-700 text-[8px] font-black border border-amber-200">CIRCULAR</span>
                )}
              </span>
              {record?.definition && (
                <span className="text-[9px] font-bold text-slate-500 italic mt-0.5 line-clamp-1">{record.definition}</span>
              )}
            </div>
          </div>
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">({item.count} annotations)</span>
        </div>
      );
    }

    if (item.type === 'track') {
      const { recordId, track: t } = item;
      const start = Math.min(...t.data.map((d: any) => d.start));
      const end = Math.max(...t.data.map((d: any) => d.end));
      
      return (
        <div style={style} className="border-b border-slate-100 hover:bg-indigo-50/30 transition-all group flex items-center px-8">
          <div className="w-[15%] shrink-0">
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 rounded-md text-[9px] font-black uppercase tracking-tighter bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">track</span>
              <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-slate-100 text-[10px] font-black text-slate-400">
                ~
              </span>
            </div>
          </div>
          <div className="w-[35%] shrink-0 px-4">
            <div className="flex flex-col gap-0.5">
              <span className="font-black text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-1">{t.name}</span>
              <span className="text-[10px] font-bold text-slate-500 line-clamp-1">{t.data.length} data points</span>
            </div>
          </div>
          <div className="w-[20%] shrink-0 px-4">
            <div className="flex flex-col">
              <span className="text-[11px] font-mono text-slate-600 font-bold">
                {(start + 1).toLocaleString()}..{end.toLocaleString()}
              </span>
            </div>
          </div>
          <div className="w-[10%] shrink-0 px-4 text-right font-mono text-slate-500 font-bold">
            {(end - start).toLocaleString()}
          </div>
          <div className="w-[20%] shrink-0 text-right pl-4">
            <div className="flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
              <button 
                onClick={() => {
                  // Maybe show track summary?
                  addLog(`Track: ${t.name} selected.`);
                }}
                className="text-slate-400 hover:text-indigo-600 p-2.5 rounded-xl hover:bg-indigo-50 transition-all" 
                title="View Track Info"
              >
                <i className="fas fa-info-circle"></i>
              </button>
              <button onClick={() => {
                setActiveTab('alignment');
                setActiveSelection({ start, end, recordIds: [recordId] });
              }} className="text-[10px] font-black uppercase bg-white px-5 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-indigo-600 hover:text-white hover:border-indigo-500 transition-all tracking-widest shadow-sm">Focus</button>
            </div>
          </div>
        </div>
      );
    }

    const { recordId, feature: f } = item;
    const isSelected = isFeatureInSelection(f);
    
    return (
      <div style={style} className={`border-b border-slate-100 hover:bg-slate-50 transition-all group flex items-center px-8 ${isSelected ? 'bg-sky-50' : ''}`}>
        <div className="w-[15%] shrink-0">
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 rounded-md text-[9px] font-black uppercase tracking-tighter" style={{ backgroundColor: `${f.color || getFeatureColor(f.type, featureColors)}15`, color: f.color || getFeatureColor(f.type, featureColors), border: `1px solid ${f.color || getFeatureColor(f.type, featureColors)}25` }}>{f.type}</span>
            <span className={`inline-flex items-center justify-center w-6 h-6 rounded bg-slate-100 text-[10px] font-black ${f.strand === 1 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {f.strand === 1 ? '+' : '-'}
            </span>
          </div>
        </div>
        <div className="w-[35%] shrink-0 px-4">
          <div className="flex flex-col gap-0.5">
            <span className="font-black text-slate-900 group-hover:text-sky-600 transition-colors line-clamp-1">{f.name}</span>
            {f.metadata?.product && <span className="text-[10px] font-bold text-slate-500 line-clamp-1">{f.metadata.product}</span>}
          </div>
        </div>
        <div className="w-[20%] shrink-0 px-4">
          <div className="flex flex-col">
            <span className="text-[11px] font-mono text-slate-600 font-bold">
              {f.locationString ? (
                f.locationString.length > 30 ? f.locationString.substring(0, 27) + '...' : f.locationString
              ) : (
                `${(f.start + 1).toLocaleString()}..${f.end.toLocaleString()}`
              )}
            </span>
          </div>
        </div>
        <div className="w-[10%] shrink-0 px-4 text-right font-mono text-slate-500 font-bold">
          {(() => {
            if (f.segments && f.segments.length > 0) {
              return f.segments.reduce((acc: number, seg: any) => acc + Math.abs(seg.end - seg.start), 0).toLocaleString();
            }
            if (f.start > f.end) {
              const record = records.find(r => r.id === recordId);
              const len = record ? (record.sequence.length - f.start) + f.end : Math.abs(f.end - f.start);
              return len.toLocaleString();
            }
            return Math.abs(f.end - f.start).toLocaleString();
          })()}
        </div>
        <div className="w-[20%] shrink-0 text-right pl-4">
          <div className="flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
            <button 
              onClick={() => {
                handleViewDetails(recordId, f);
              }}
              className="text-slate-400 hover:text-sky-600 p-2.5 rounded-xl hover:bg-sky-50 transition-all" 
              title="View Details"
            >
              <i className="fas fa-eye"></i>
            </button>
            <button onClick={() => setEditing({ recordId, featureIndex: f.index, feature: f })} className="text-slate-400 hover:text-amber-600 p-2.5 rounded-xl hover:bg-amber-50 transition-all" title="Edit Metadata"><i className="fas fa-edit"></i></button>
            <button onClick={() => removeFeature(recordId, f.index)} className="text-slate-400 hover:text-rose-600 p-2.5 rounded-xl hover:bg-rose-50 transition-all" title="Delete Feature"><i className="fas fa-trash-alt"></i></button>
            <button onClick={() => { 
              setActiveTab('alignment'); 
              const focusStart = f.segments && f.segments.length > 0 ? f.segments[0].start : f.start;
              const focusEnd = f.segments && f.segments.length > 0 ? f.segments[0].end : f.end;
              setActiveSelection({ start: focusStart, end: focusEnd, recordIds: [recordId] }); 
              addLog(`Jump to ${f.name}`); 
            }} className="text-[10px] font-black uppercase bg-white px-5 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-sky-600 hover:text-white hover:border-sky-500 transition-all tracking-widest shadow-sm">Focus</button>
          </div>
        </div>
      </div>
    );
  }, [flattenedFeatures, records, isFeatureInSelection, removeFeature, addLog]);

  const getHubRowHeight = useCallback((index: number) => {
    const item = flattenedFeatures[index];
    if (!item) return 0;
    return item.type === 'header' ? 60 : 70;
  }, [flattenedFeatures]);

  useEffect(() => {
    if (hubListRef.current) hubListRef.current.resetAfterIndex(0);
  }, [flattenedFeatures]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    setIsProcessing(true);
    addLog(`Ingesting batch: ${files.length} GenBank files.`);

    const promises = Array.from(files).map((file: File) => {
      return new Promise<void>((resolve) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const content = ev.target?.result as string;
          bioWorkerRef.current?.postMessage({ type: 'PARSE_GENBANK', content });
          resolve();
        };
        reader.readAsText(file);
      });
    });

    Promise.all(promises).then(() => {
      // The worker will send PARSE_SUCCESS for each file
    });
  };

  const handleAlignmentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || records.length === 0) return;
    
    setIsProcessing(true);
    addLog(`Importing external alignment: ${file.name}`);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      bioWorkerRef.current?.postMessage({ type: 'PARSE_FASTA', content });
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
      reader.onload = (ev) => {
        const content = ev.target?.result as string;
        bioWorkerRef.current?.postMessage({ type: 'PARSE_ANNOTATIONS', filename: file.name, content });
      };
      reader.readAsText(file);
    });
  };

  const saveEditedFeature = () => {
    if (!editing) return;
    const { recordId, featureIndex, feature } = editing;
    
    setRecords(prev => prev.map(r => {
      if (r.id !== recordId) return r;
      const newFeatures = [...r.features];
      if (featureIndex === -1) {
        newFeatures.push(feature);
      } else {
        newFeatures[featureIndex] = feature;
      }
      return { ...r, features: newFeatures };
    }));
    
    addLog(featureIndex === -1 ? `New feature '${feature.name}' created.` : `Feature metadata updated.`);
    setEditing(null);
  };


  const startNewFeature = () => {
    if (records.length === 0) return;
    
    let start = 0;
    let end = 100;
    let targetRecordId = records[0].id;

    if (activeSelection) {
      targetRecordId = activeSelection.recordIds[0] || records[0].id;
      const targetRecord = records.find(r => r.id === targetRecordId);
      if (targetRecord) {
        start = getOriginalPos(targetRecord.alignedSequence || targetRecord.sequence, Math.min(activeSelection.start, activeSelection.end));
        end = getOriginalPos(targetRecord.alignedSequence || targetRecord.sequence, Math.max(activeSelection.start, activeSelection.end));
      }
    }

    setEditing({
      recordId: targetRecordId,
      featureIndex: -1,
      feature: {
        name: 'New Feature',
        type: 'misc_feature',
        start,
        end,
        strand: 1
      }
    });
  };

  const addAnnotationFromSearch = (recordId: string, start: number, end: number, name: string, segments?: {start: number, end: number}[]) => {
    const targetRecord = records.find(r => r.id === recordId);
    let finalStart = start;
    let finalEnd = end;
    let finalSegments = segments;

    if (targetRecord) {
      const seq = targetRecord.alignedSequence || targetRecord.sequence;
      finalStart = getOriginalPos(seq, start);
      finalEnd = getOriginalPos(seq, end);
      
      if (segments) {
        finalSegments = segments.map(seg => ({
          start: getOriginalPos(seq, seg.start),
          end: getOriginalPos(seq, seg.end)
        })).sort((a, b) => a.start - b.start);
      }
    }

    setEditing({
      recordId,
      featureIndex: -1,
      feature: {
        name,
        type: 'misc_feature',
        start: finalStart,
        end: finalEnd,
        strand: 1,
        segments: finalSegments
      }
    });
    addLog(`Preparing annotation for match${segments ? ' (multi-segment)' : ''} at ${finalStart} bp.`);
  };

  const joinSelectedMatches = () => {
    if (selectedSearchIndices.size < 2) return;
    const indices = Array.from(selectedSearchIndices).sort((a, b) => a - b);
    const matches = indices.map(i => filteredResults[i]);
    
    // Check if all matches are on the same record and strand
    const recordId = matches[0].recordId;
    const strand = matches[0].strand;
    if (matches.some(m => m.recordId !== recordId || m.strand !== strand)) {
      alert("All selected matches must be on the same sequence and strand to be joined.");
      return;
    }

    const segments = matches.map(m => ({ start: m.start, end: m.end }));
    const minStart = Math.min(...segments.map(s => s.start));
    const maxEnd = Math.max(...segments.map(s => s.end));

    addAnnotationFromSearch(recordId, minStart, maxEnd, `Joined Search: ${searchQuery}`, segments);
  };

  const exportSelection = () => {
    const start = activeSelection ? Math.min(activeSelection.start, activeSelection.end) : undefined;
    const end = activeSelection ? Math.max(activeSelection.start, activeSelection.end) : undefined;
    const content = exportToFasta(records, start, end);
    downloadBlob(content, activeSelection ? 'selection_export.fasta' : 'msa_export.fasta', 'text/plain');
    addLog(`${activeSelection ? 'Selection' : 'Full'} FASTA exported.`);
  };

  const exportSelectionJson = () => {
    if (!activeSelection) {
      addLog('No selection active for JSON export.');
      return;
    }

    const start = Math.min(activeSelection.start, activeSelection.end);
    const end = Math.max(activeSelection.start, activeSelection.end);
    const length = end - start;

    const slicedRecords = records.map(record => {
      const seq = record.alignedSequence || record.sequence;
      const slicedSeq = seq.substring(Math.max(0, start), Math.min(seq.length, end));
      
      const slicedFeatures = record.features
        .filter(f => f.start < end && f.end > start)
        .map(f => ({
          ...f,
          start: Math.max(0, f.start - start),
          end: Math.min(length, f.end - start)
        }));

      const slicedTracks = record.tracks?.map(track => ({
        ...track,
        data: track.data
          .filter(d => d.start < end && d.end > start)
          .map(d => ({
            ...d,
            start: Math.max(0, d.start - start),
            end: Math.min(length, d.end - start)
          }))
      }));

      return {
        ...record,
        sequence: slicedSeq,
        alignedSequence: undefined, // It's a slice, so it's the new "base" sequence
        features: slicedFeatures,
        tracks: slicedTracks
      };
    });

    const project: any = {
      records: slicedRecords,
      featureColors,
      selectionRange: { start, end },
      version: '3.4',
      exportedAt: new Date().toISOString()
    };

    downloadBlob(JSON.stringify(project, null, 2), `selection_${start}_${end}.json`, 'application/json');
    addLog(`Selection JSON exported (${start}-${end}).`);
  };

  const exportAllFasta = () => {
    const content = exportToFasta(records);
    downloadBlob(content, 'all_sequences.fasta', 'text/plain');
    addLog(`Full FASTA (all records) exported.`);
  };

  const handleExportRecord = (recordId: string) => {
    const record = records.find(r => r.id === recordId);
    if (!record) return;
    const content = exportToFasta([record]);
    downloadBlob(content, `${record.id.replace(/[^a-z0-9]/gi, '_')}.fasta`, 'text/plain');
    addLog(`Exported record ${record.id} to FASTA.`);
  };

  const handleViewDetails = (recordId: string, feature?: BioFeature) => {
    const record = records.find(r => r.id === recordId);
    if (record) {
      setViewingRecordDetails(record);
      setViewingFeatureDetails(feature || null);
    }
  };

  const exportGenBankFile = () => {
    const content = exportToGenBank(records);
    downloadBlob(content, 'sequences_with_features.gb', 'text/plain');
    addLog(`GenBank file exported (includes new features).`);
  };

  const exportGffFile = () => {
    const content = exportToGff(records);
    downloadBlob(content, 'annotations.gff', 'text/plain');
    addLog(`GFF3 exported.`);
  };

  const exportProjectJson = () => {
    const project: any = {
      records,
      featureColors,
      activeSelection,
      showAnnotations,
      showTranslation,
      showConservation,
      version: '3.4'
    };
    downloadBlob(JSON.stringify(project, null, 2), 'dunceious_project.json', 'application/json');
    addLog(`Project JSON exported.`);
  };

  const handleProjectUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsProcessing(true);
    addLog(`Loading project: ${file.name}`);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const project = JSON.parse(ev.target?.result as string);
        if (project.records) {
          const recordsWithVisibility = project.records.map((r: any) => ({
            ...r,
            visible: r.visible !== undefined ? r.visible : true
          }));
          setRecords(recordsWithVisibility);
        }
        if (project.featureColors) setFeatureColors(project.featureColors);
        if (project.activeSelection) setActiveSelection(project.activeSelection);
        if (project.showAnnotations !== undefined) setShowAnnotations(project.showAnnotations);
        if (project.showTranslation !== undefined) setShowTranslation(project.showTranslation);
        if (project.showConservation !== undefined) setShowConservation(project.showConservation);
        addLog(`Project loaded successfully.`);
      } catch (err) {
        addLog(`Error loading project: ${err}`);
      }
      setIsProcessing(false);
    };
    reader.readAsText(file);
  };

  const isAlignmentLoaded = useMemo(() => {
    if (records.length < 2) return false;
    const lengths = records.map(r => (r.alignedSequence || r.sequence).length);
    return new Set(lengths).size === 1;
  }, [records]);


  const alignmentLength = useMemo(() => {
    if (records.length === 0) return 0;
    return Math.max(...records.map(r => (r.alignedSequence || r.sequence).length));
  }, [records]);

  return (
    <div className="flex flex-col h-screen bg-[#0f172a] text-slate-200 overflow-hidden font-sans select-none" ref={containerRef}>
      {isProcessing && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[200] flex flex-col items-center justify-center animate-in fade-in duration-300">
          <div className="relative">
            <div className="w-24 h-24 border-4 border-sky-500/20 border-t-sky-500 rounded-full animate-spin"></div>
            <i className="fas fa-helix absolute inset-0 flex items-center justify-center text-sky-500 text-2xl animate-pulse"></i>
          </div>
          <p className="mt-6 text-sm font-black uppercase tracking-[0.3em] text-sky-400 animate-pulse">Processing Genomic Data...</p>
          <p className="mt-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Dunceious is thinking hard</p>
        </div>
      )}

      {/* Record Details Modal */}
      {viewingRecordDetails && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200">
            <div className="bg-slate-50 px-8 py-6 border-b border-slate-200 flex justify-between items-center">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-sky-100 flex items-center justify-center text-sky-600 shadow-inner">
                  <i className={`fas ${viewingFeatureDetails ? 'fa-tag' : 'fa-dna'} text-xl`}></i>
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase">
                    {viewingFeatureDetails ? 'Annotation Details' : 'Record Details'}
                  </h2>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    {viewingFeatureDetails ? `${viewingFeatureDetails.name} [${viewingFeatureDetails.type}]` : viewingRecordDetails.id}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => {
                  setViewingRecordDetails(null);
                  setViewingFeatureDetails(null);
                }}
                className="w-10 h-10 rounded-full hover:bg-slate-200 flex items-center justify-center text-slate-400 transition-colors"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            
            <div className="p-8 max-h-[70vh] overflow-y-auto custom-scrollbar-pro space-y-6">
              {viewingFeatureDetails ? (
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Type</label>
                    <p className="text-sm font-bold text-slate-700">{viewingFeatureDetails.type}</p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Locus</label>
                    <p className="text-sm font-mono font-bold text-slate-700">{viewingFeatureDetails.locationString || `${viewingFeatureDetails.start + 1}..${viewingFeatureDetails.end}`}</p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Strand</label>
                    <p className="text-sm font-bold text-slate-700">{viewingFeatureDetails.strand === 1 ? 'Forward (+)' : 'Reverse (-)'}</p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Length</label>
                    <p className="text-sm font-mono font-bold text-slate-700">{(viewingFeatureDetails.end - viewingFeatureDetails.start).toLocaleString()} bp</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Definition</label>
                    <p className="text-sm font-bold text-slate-700">{viewingRecordDetails.definition || 'N/A'}</p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Accession</label>
                    <p className="text-sm font-mono font-bold text-slate-700">{viewingRecordDetails.accession || 'N/A'}</p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Length</label>
                    <p className="text-sm font-mono font-bold text-slate-700">{(viewingRecordDetails.alignedSequence || viewingRecordDetails.sequence).length.toLocaleString()} bp</p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Features</label>
                    <p className="text-sm font-bold text-slate-700">{viewingRecordDetails.features.length} annotations</p>
                  </div>
                </div>
              )}

              {/* Sequence Viewer & Copy */}
              {(() => {
                let displaySeq = viewingRecordDetails.sequence;
                let label = "Record Sequence (Raw)";
                let logLabel = viewingRecordDetails.id;

                if (viewingFeatureDetails) {
                  const { start, end, strand } = viewingFeatureDetails;
                  // Handle wrap around if necessary, but for now simple slice
                  if (start <= end) {
                    displaySeq = viewingRecordDetails.sequence.substring(start, end);
                  } else {
                    displaySeq = viewingRecordDetails.sequence.substring(start) + viewingRecordDetails.sequence.substring(0, end);
                  }
                  label = "Annotation Sequence";
                  logLabel = `${viewingFeatureDetails.name} in ${viewingRecordDetails.id}`;
                }

                return (
                  <div className="space-y-3 pt-4 border-t border-slate-100">
                    <div className="flex justify-between items-center">
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{label}</label>
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(displaySeq);
                          addLog(`Sequence for ${logLabel} copied to clipboard.`);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-sky-50 text-sky-600 text-[9px] font-black uppercase hover:bg-sky-100 transition-colors"
                      >
                        <i className="fas fa-copy"></i> Copy Sequence
                      </button>
                    </div>
                    <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 shadow-inner group relative">
                      <div className="max-h-[200px] overflow-y-auto custom-scrollbar-pro pr-2">
                        <p className="text-[11px] font-mono text-slate-400 break-all leading-relaxed selection:bg-sky-500/30 selection:text-sky-200">
                          {displaySeq}
                        </p>
                      </div>
                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest bg-slate-900/80 px-2 py-1 rounded border border-slate-800">
                          {displaySeq.length} bp
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {viewingFeatureDetails?.translation && (
                <div className="space-y-3 pt-4 border-t border-slate-100">
                  <div className="flex justify-between items-center">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Protein Translation</label>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(viewingFeatureDetails.translation!);
                        addLog(`Translation for ${viewingFeatureDetails.name} copied.`);
                      }}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-50 text-emerald-600 text-[9px] font-black uppercase hover:bg-emerald-100 transition-colors"
                    >
                      <i className="fas fa-copy"></i> Copy AA
                    </button>
                  </div>
                  <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-inner">
                    <p className="text-[11px] font-mono text-emerald-400 break-all leading-relaxed">
                      {viewingFeatureDetails.translation}
                    </p>
                  </div>
                </div>
              )}

              {((viewingFeatureDetails?.metadata) || (viewingRecordDetails.metadata && !viewingFeatureDetails)) && (
                <div className="space-y-3 pt-4 border-t border-slate-100">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Additional Metadata</label>
                  <div className="grid grid-cols-1 gap-2">
                    {Object.entries(viewingFeatureDetails?.metadata || viewingRecordDetails.metadata || {}).map(([key, value]) => (
                      <div key={key} className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <span className="text-[10px] font-black text-slate-500 uppercase">{key}</span>
                        <span className="text-[11px] font-bold text-slate-700 max-w-[300px] truncate" title={String(value)}>{String(value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            <div className="bg-slate-50 px-8 py-6 border-t border-slate-200 flex justify-end gap-3">
              <button 
                onClick={() => {
                  let displaySeq = viewingRecordDetails.sequence;
                  let logLabel = viewingRecordDetails.id;
                  if (viewingFeatureDetails) {
                    const { start, end } = viewingFeatureDetails;
                    if (start <= end) displaySeq = viewingRecordDetails.sequence.substring(start, end);
                    else displaySeq = viewingRecordDetails.sequence.substring(start) + viewingRecordDetails.sequence.substring(0, end);
                    logLabel = `${viewingFeatureDetails.name} in ${viewingRecordDetails.id}`;
                  }
                  navigator.clipboard.writeText(displaySeq);
                  addLog(`Sequence for ${logLabel} copied to clipboard.`);
                }}
                className="px-6 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 text-[10px] font-black uppercase hover:bg-slate-50 transition-all flex items-center gap-2"
              >
                <i className="fas fa-copy"></i> Copy
              </button>
              {viewingFeatureDetails && (
                <button 
                  onClick={() => {
                    setActiveTab('alignment'); 
                    const focusStart = viewingFeatureDetails.segments && viewingFeatureDetails.segments.length > 0 ? viewingFeatureDetails.segments[0].start : viewingFeatureDetails.start;
                    const focusEnd = viewingFeatureDetails.segments && viewingFeatureDetails.segments.length > 0 ? viewingFeatureDetails.segments[0].end : viewingFeatureDetails.end;
                    setActiveSelection({ start: focusStart, end: focusEnd, recordIds: [viewingRecordDetails.id] }); 
                    setViewingRecordDetails(null);
                    setViewingFeatureDetails(null);
                    addLog(`Focusing on ${viewingFeatureDetails.name}`); 
                  }}
                  className="px-6 py-2.5 rounded-xl bg-sky-600 text-white text-[10px] font-black uppercase hover:bg-sky-500 transition-all flex items-center gap-2 shadow-lg shadow-sky-900/20"
                >
                  <i className="fas fa-search-location"></i> Focus
                </button>
              )}
              {!viewingFeatureDetails && (
                <button 
                  onClick={() => {
                    handleExportRecord(viewingRecordDetails.id);
                    setViewingRecordDetails(null);
                  }}
                  className="px-6 py-2.5 rounded-xl bg-emerald-600 text-white text-[10px] font-black uppercase hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-900/20 flex items-center gap-2"
                >
                  <i className="fas fa-download"></i> Export FASTA
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {editing && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-[100] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-3xl shadow-2xl p-8 animate-in zoom-in duration-200 my-auto">
            <h3 className="text-xl font-black uppercase tracking-tighter mb-8 flex items-center gap-4 text-white">
              <i className="fas fa-microchip text-amber-500"></i> {editing.featureIndex === -1 ? 'Create Feature' : 'Metadata Inspector'}
            </h3>
            <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar-pro">
              {editing.featureIndex === -1 && (
                 <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase block mb-2">Target Sequence</label>
                    <select value={editing.recordId} onChange={e => setEditing({...editing, recordId: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-5 py-3 text-sm outline-none focus:border-sky-500 text-slate-200">
                        {records.map(r => <option key={r.id} value={r.id}>{r.id}</option>)}
                    </select>
                 </div>
              )}
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase block mb-2">Display Name</label>
                <input type="text" value={editing.feature.name} onChange={e => setEditing({...editing, feature: {...editing.feature, name: e.target.value}})} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-5 py-3 text-sm outline-none focus:border-sky-500 transition-all text-slate-200" />
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase block mb-2">Feature Key</label>
                  <select value={editing.feature.type} onChange={e => setEditing({...editing, feature: {...editing.feature, type: e.target.value}})} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-5 py-3 text-sm outline-none focus:border-sky-500 text-slate-200">
                    {['gene', 'CDS', 'mRNA', 'tRNA', 'rRNA', 'exon', 'promoter', 'regulatory', 'misc_feature', 'intron'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase block mb-2">Strand</label>
                  <select value={editing.feature.strand} onChange={e => setEditing({...editing, feature: {...editing.feature, strand: parseInt(e.target.value) as any}})} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-5 py-3 text-sm outline-none focus:border-sky-500 text-slate-200">
                    <option value={1}>Forward (+)</option>
                    <option value={-1}>Reverse (-)</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase block mb-2">Feature Color (Case by Case)</label>
                <div className="flex items-center gap-4 bg-slate-950 border border-slate-800 rounded-xl px-5 py-3">
                  <input 
                    type="color" 
                    value={editing.feature.color || getFeatureColor(editing.feature.type, featureColors)} 
                    onChange={e => setEditing({...editing, feature: {...editing.feature, color: e.target.value}})} 
                    className="w-10 h-10 rounded-lg border-none bg-transparent cursor-pointer" 
                  />
                  <span className="text-xs font-mono text-slate-400 uppercase">{editing.feature.color || 'Default (' + getFeatureColor(editing.feature.type, featureColors) + ')'}</span>
                  <button 
                    onClick={() => setEditing({...editing, feature: {...editing.feature, color: undefined}})}
                    className="ml-auto text-[8px] font-black text-slate-500 uppercase hover:text-rose-500 transition-colors"
                  >Reset to Default</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase block mb-2">
                    {editing.feature.segments && editing.feature.segments.length > 1 ? 'Envelope Start (bp)' : 'Start (bp)'}
                  </label>
                  <input 
                    type="number" 
                    value={editing.feature.start} 
                    onChange={e => {
                      const val = parseInt(e.target.value);
                      const newFeat = { ...editing.feature, start: val };
                      // If it's a simple feature, sync segments
                      if (!newFeat.segments || newFeat.segments.length <= 1) {
                        newFeat.segments = [{ start: val, end: newFeat.end }];
                      }
                      setEditing({ ...editing, feature: newFeat });
                    }} 
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-5 py-3 text-sm outline-none text-slate-200" 
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase block mb-2">
                    {editing.feature.segments && editing.feature.segments.length > 1 ? 'Envelope End (bp)' : 'End (bp)'}
                  </label>
                  <input 
                    type="number" 
                    value={editing.feature.end} 
                    onChange={e => {
                      const val = parseInt(e.target.value);
                      const newFeat = { ...editing.feature, end: val };
                      // If it's a simple feature, sync segments
                      if (!newFeat.segments || newFeat.segments.length <= 1) {
                        newFeat.segments = [{ start: newFeat.start, end: val }];
                      }
                      setEditing({ ...editing, feature: newFeat });
                    }} 
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-5 py-3 text-sm outline-none text-slate-200" 
                  />
                </div>
              </div>
              {editing.feature.segments && editing.feature.segments.length > 1 && (
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase">Segments ({editing.feature.segments.length})</label>
                    <button 
                      onClick={() => {
                        const newSegs = [...editing.feature.segments!, { start: editing.feature.end, end: editing.feature.end + 100 }];
                        setEditing({...editing, feature: {...editing.feature, segments: newSegs}});
                      }}
                      className="text-[8px] font-black text-sky-500 uppercase hover:text-sky-400"
                    >
                      <i className="fas fa-plus mr-1"></i> Add Segment
                    </button>
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-2 pr-2 custom-scrollbar-pro bg-black/20 p-3 rounded-xl border border-slate-800/50">
                    {editing.feature.segments.map((seg, idx) => (
                      <div key={idx} className="flex items-center gap-3 bg-slate-900/80 p-2 rounded-lg border border-slate-800/50 group">
                        <span className="text-[8px] font-black text-slate-600 uppercase w-4">#{idx + 1}</span>
                        <input 
                          type="number" 
                          value={seg.start} 
                          onChange={e => {
                            const newSegs = [...editing.feature.segments!];
                            newSegs[idx] = {...newSegs[idx], start: parseInt(e.target.value)};
                            setEditing({...editing, feature: {...editing.feature, segments: newSegs}});
                          }}
                          className="flex-1 bg-transparent border-b border-slate-800 text-[10px] font-mono text-slate-300 outline-none focus:border-sky-500"
                        />
                        <span className="text-slate-700">..</span>
                        <input 
                          type="number" 
                          value={seg.end} 
                          onChange={e => {
                            const newSegs = [...editing.feature.segments!];
                            newSegs[idx] = {...newSegs[idx], end: parseInt(e.target.value)};
                            setEditing({...editing, feature: {...editing.feature, segments: newSegs}});
                          }}
                          className="flex-1 bg-transparent border-b border-slate-800 text-[10px] font-mono text-slate-300 outline-none focus:border-sky-500"
                        />
                        <button 
                          onClick={() => {
                            const newSegs = editing.feature.segments!.filter((_, i) => i !== idx);
                            setEditing({...editing, feature: {...editing.feature, segments: newSegs}});
                          }}
                          className="text-slate-600 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <i className="fas fa-times text-[10px]"></i>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {editing.feature.locationString && (
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase block mb-2">GenBank Location (Read-only)</label>
                  <div className="w-full bg-slate-950 border border-slate-800 rounded-xl px-5 py-3 text-[10px] font-mono text-amber-500 break-all">
                    {editing.feature.locationString}
                  </div>
                </div>
              )}
              {editing.feature.metadata && Object.keys(editing.feature.metadata).length > 0 && (
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase block mb-2">Qualifiers</label>
                  <div className="max-h-32 overflow-y-auto space-y-2 pr-2 custom-scrollbar-pro">
                    {Object.entries(editing.feature.metadata).map(([k, v]) => (
                      <div key={k} className="flex flex-col bg-slate-950/50 p-2 rounded-lg border border-slate-800/50">
                        <span className="text-[8px] font-black text-slate-600 uppercase">/{k}</span>
                        <span className="text-[10px] text-slate-400 break-words">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-4 mt-12">
              <button onClick={() => setEditing(null)} className="flex-1 py-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-xs font-black uppercase transition-all tracking-widest">Discard</button>
              <button onClick={saveEditedFeature} className="flex-1 py-4 rounded-2xl bg-sky-600 hover:bg-sky-500 text-xs font-black uppercase transition-all shadow-xl shadow-sky-900/40 tracking-widest">
                {editing.featureIndex === -1 ? 'Create' : 'Apply'}
              </button>
            </div>
          </div>
        </div>
      )}

      <nav className="h-16 border-b border-slate-800/80 bg-slate-900/95 backdrop-blur-md flex items-center justify-between px-6 shrink-0 z-50">
        <div className="flex items-center gap-6">
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-800/50 hover:bg-slate-700 text-slate-400 transition-all border border-slate-700/30">
            <i className={`fas ${sidebarOpen ? 'fa-arrow-left-long' : 'fa-bars-staggered'}`}></i>
          </button>
          <div className="flex flex-col">
            <div className="flex items-center gap-3">
              <i className="fas fa-helix text-sky-500 text-xl animate-spin-slow"></i>
              <span className="text-xl font-black tracking-tightest uppercase italic text-white">Dunceious</span>
            </div>
            <span className="text-[8px] font-black uppercase tracking-[0.4em] text-slate-500 italic leading-none mt-1">Because intelligence is overpriced.</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* TAB TOGGLE */}
          <div className="flex bg-slate-950 p-1 rounded-2xl border border-slate-800 shadow-xl mr-4">
            <button onClick={() => setActiveTab('alignment')} className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${activeTab === 'alignment' ? 'bg-sky-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>Visual Viewport</button>
            <button onClick={() => setActiveTab('features')} className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${activeTab === 'features' ? 'bg-sky-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>Database Hub</button>
          </div>

          {/* VIEWPORT SPECIFIC CONTROLS (CONDITIONAL) */}
          {activeTab === 'alignment' && records.length > 0 && (
            <div className="flex items-center gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
                <button onClick={() => setDragMode('pan')} className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${dragMode === 'pan' ? 'bg-white text-sky-600 shadow-lg' : 'text-slate-500 hover:text-slate-300'}`} title="Pan Mode"><i className="fas fa-hand-paper"></i></button>
                <button onClick={() => setDragMode('select')} className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${dragMode === 'select' ? 'bg-white text-sky-600 shadow-lg' : 'text-slate-500 hover:text-slate-300'}`} title="Select Mode"><i className="fas fa-vector-square"></i></button>
              </div>
              <div className="h-8 w-px bg-slate-800 mx-2"></div>
              <div className="flex gap-2">
                {activeSelection && (
                  <button onClick={() => setActiveSelection(null)} className="px-4 py-2.5 rounded-xl text-[9px] font-black uppercase border border-rose-500/50 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-all" title="Clear Current Selection">Clear</button>
                )}
                <button onClick={() => setShowAnnotations(!showAnnotations)} className={`px-4 py-2.5 rounded-xl text-[9px] font-black uppercase border transition-all ${showAnnotations ? 'bg-sky-500/10 border-sky-500/50 text-sky-400' : 'bg-slate-800 border-slate-700 text-slate-500'}`} title="Toggle Annotations">Annotations</button>
                <button onClick={() => setShowTracks(!showTracks)} className={`px-4 py-2.5 rounded-xl text-[9px] font-black uppercase border transition-all ${showTracks ? 'bg-indigo-500/10 border-indigo-500/50 text-indigo-400' : 'bg-slate-800 border-slate-700 text-slate-500'}`} title="Toggle Tracks">Tracks</button>
                <button onClick={() => setShowTranslation(!showTranslation)} className={`px-4 py-2.5 rounded-xl text-[9px] font-black uppercase border transition-all ${showTranslation ? 'bg-emerald-500/10 border-emerald-500/50 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-500'}`} title="Toggle Translation">Translation</button>
                <button 
                  disabled={!isAlignmentLoaded}
                  onClick={() => setShowConservation(!showConservation)} 
                  className={`px-4 py-2.5 rounded-xl text-[9px] font-black uppercase border transition-all ${!isAlignmentLoaded ? 'opacity-30 cursor-not-allowed grayscale' : ''} ${showConservation ? 'bg-amber-500/10 border-amber-500/50 text-amber-400' : 'bg-slate-800 border-slate-700 text-slate-500'}`} 
                  title="Toggle Conservation Heatmap (Requires Alignment)"
                >Conservation</button>
              </div>
            </div>
          )}
        </div>
      </nav>

      <div className="flex-1 flex overflow-hidden">
        <aside className={`border-r border-slate-800/50 bg-[#020617] transition-all duration-300 flex flex-col shadow-inner ${sidebarOpen ? 'w-72 p-5' : 'w-0 p-0 opacity-0 pointer-events-none'}`}>
          <div className="flex-1 overflow-y-auto custom-scrollbar-pro space-y-8 pr-1">
            {activeSelection && (
              <section className="animate-in slide-in-from-left-2 duration-300">
                <h3 className="text-[10px] font-black uppercase text-sky-500 tracking-widest mb-4 flex items-center justify-between">Selection Inspector <i className="fas fa-vector-square text-sky-600"></i></h3>
                <div className="bg-sky-500/5 border border-sky-500/20 rounded-2xl p-4 space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] font-black text-slate-500 uppercase">Range</span>
                    <span className="text-[10px] font-mono text-sky-400">{activeSelection.start.toLocaleString()} - {activeSelection.end.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] font-black text-slate-500 uppercase">Length</span>
                    <span className="text-[10px] font-mono text-sky-400">{Math.abs(activeSelection.end - activeSelection.start).toLocaleString()} bp</span>
                  </div>

                  <div className="pt-3 border-t border-sky-500/10 space-y-3">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[8px] font-black text-slate-500 uppercase">Manual Selection</span>
                      <button onClick={() => setActiveSelection(null)} className="text-[7px] font-black text-rose-500 uppercase hover:text-rose-400">Clear</button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[7px] font-black text-slate-600 uppercase">Start</label>
                        <input 
                          type="number" 
                          value={activeSelection.start}
                          onChange={e => setActiveSelection({...activeSelection, start: parseInt(e.target.value) || 0})}
                          className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[10px] font-mono text-sky-400 outline-none focus:border-sky-500"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[7px] font-black text-slate-600 uppercase">End</label>
                        <input 
                          type="number" 
                          value={activeSelection.end}
                          onChange={e => setActiveSelection({...activeSelection, end: parseInt(e.target.value) || 0})}
                          className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[10px] font-mono text-sky-400 outline-none focus:border-sky-500"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-sky-500/10 space-y-2">
                    <span className="text-[8px] font-black text-slate-500 uppercase block mb-1">Original Coordinates</span>
                    <div className="max-h-32 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar-pro">
                      {transposedRecords.map(r => {
                        const s = getOriginalPos(r.alignedSequence || r.sequence, Math.min(activeSelection.start, activeSelection.end));
                        const e = getOriginalPos(r.alignedSequence || r.sequence, Math.max(activeSelection.start, activeSelection.end));
                        return (
                          <div key={r.id} className="flex justify-between items-center bg-black/20 px-2 py-1 rounded">
                            <span className="text-[8px] font-black text-slate-400 truncate max-w-[80px]">{r.id}</span>
                            <span className="text-[9px] font-mono text-slate-300">{s.toLocaleString()} - {e.toLocaleString()}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-2">
                    <button onClick={exportSelection} className="py-2 rounded-lg bg-emerald-600/20 text-emerald-500 text-[8px] font-black uppercase hover:bg-emerald-600/30 transition-all" title="Export Selection as FASTA">
                      <i className="fas fa-file-code mr-1"></i> FASTA
                    </button>
                    <button onClick={exportSelectionJson} className="py-2 rounded-lg bg-indigo-600/20 text-indigo-500 text-[8px] font-black uppercase hover:bg-indigo-600/30 transition-all" title="Export Selection as JSON (Full Data)">
                      <i className="fas fa-file-json mr-1"></i> JSON
                    </button>
                    <button onClick={startNewFeature} className="py-2 rounded-lg bg-sky-600/20 text-sky-500 text-[8px] font-black uppercase hover:bg-sky-600/30 transition-all" title="Create Annotation from Selection">
                      <i className="fas fa-plus mr-1"></i> Annot
                    </button>
                  </div>
                </div>
              </section>
            )}

            {activeTab === 'alignment' && records.length > 0 && (
              <section className="animate-in slide-in-from-left-2 duration-300">
                <h3 className="text-[10px] font-black uppercase text-sky-500 tracking-widest mb-4 flex items-center justify-between">Record Navigator <i className="fas fa-list-ul text-[10px]"></i></h3>
                <div className="bg-sky-500/5 border border-sky-500/20 rounded-2xl p-4 space-y-2 max-h-48 overflow-y-auto custom-scrollbar-pro">
                  {records.map(r => (
                    <button 
                      key={r.id}
                      onClick={() => {
                        setActiveSelection({ start: 0, end: 0, recordIds: [r.id] });
                        // The GenomeViewer will handle the scroll via useEffect on activeSelection
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl bg-black/20 hover:bg-sky-500/20 border border-slate-800/50 hover:border-sky-500/50 transition-all group"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-slate-400 group-hover:text-sky-400 truncate max-w-[150px]">{r.id}</span>
                        <i className="fas fa-chevron-right text-[8px] text-slate-600 group-hover:text-sky-500"></i>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {activeTab === 'alignment' && records.length > 0 && (
              <section className="animate-in slide-in-from-left-2 duration-300">
                <h3 className="text-[10px] font-black uppercase text-emerald-500 tracking-widest mb-4 flex items-center justify-between">Navigation <i className="fas fa-compass text-[10px]"></i></h3>
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-4 space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    <button 
                      onClick={() => setJumpTo(0)}
                      className="py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-[8px] font-black uppercase text-slate-400 transition-all flex items-center justify-center gap-2"
                    >
                      <i className="fas fa-step-backward"></i> Start
                    </button>
                    <button 
                      onClick={() => setJumpTo(alignmentLength)}
                      className="py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-[8px] font-black uppercase text-slate-400 transition-all flex items-center justify-center gap-2"
                    >
                      End <i className="fas fa-step-forward"></i>
                    </button>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[8px] font-black text-slate-500 uppercase">Go to Position (bp)</label>
                    <div className="relative">
                      <input 
                        type="number" 
                        placeholder="e.g. 5000"
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-[11px] font-mono text-emerald-400 outline-none focus:border-emerald-500"
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            const val = parseInt((e.target as HTMLInputElement).value);
                            if (!isNaN(val)) setJumpTo(val);
                            (e.target as HTMLInputElement).value = '';
                          }
                        }}
                      />
                    </div>
                  </div>
                  <div className="pt-2 border-t border-emerald-500/10">
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <button 
                        onClick={() => setJumpTo(0)}
                        className="py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-[8px] font-black uppercase text-slate-400 transition-all flex items-center justify-center gap-2"
                      >
                        <i className="fas fa-step-backward"></i> Start
                      </button>
                      <button 
                        onClick={() => setJumpTo(alignmentLength)}
                        className="py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-[8px] font-black uppercase text-slate-400 transition-all flex items-center justify-center gap-2"
                      >
                        End <i className="fas fa-step-forward"></i>
                      </button>
                    </div>
                    <span className="text-[7px] font-black text-slate-600 uppercase block mb-2">Shortcuts</span>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[8px] font-bold text-slate-500 uppercase">
                      <div className="flex justify-between"><span>Zoom</span> <span className="text-emerald-500">+ / -</span></div>
                      <div className="flex justify-between"><span>Pan</span> <span className="text-emerald-500">Arrows</span></div>
                      <div className="flex justify-between"><span>Fit</span> <span className="text-emerald-500">F</span></div>
                      <div className="flex justify-between"><span>Center</span> <span className="text-emerald-500">C</span></div>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {activeTab === 'features' && (
              <section className="animate-in slide-in-from-left-2 duration-300">
                <h3 className="text-[10px] font-black uppercase text-amber-500 tracking-widest mb-4 flex items-center justify-between">Feature Colors <i className="fas fa-palette text-[10px]"></i></h3>
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4 space-y-3">
                  <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto pr-2 custom-scrollbar-pro">
                    {['gene', 'CDS', 'mRNA', 'tRNA', 'rRNA', 'exon', 'intron', 'promoter', 'regulatory', 'misc_feature', 'primer', 'origin'].map(type => (
                      <div key={type} className="flex items-center justify-between bg-black/20 p-2 rounded-lg border border-slate-800/50 group">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">{type}</span>
                        <input 
                          type="color" 
                          value={featureColors[type] || getFeatureColor(type)} 
                          onChange={e => setFeatureColors(prev => ({ ...prev, [type]: e.target.value }))}
                          className="w-6 h-6 rounded border-none bg-transparent cursor-pointer"
                        />
                      </div>
                    ))}
                  </div>
                  <button 
                    onClick={() => setFeatureColors({})}
                    className="w-full py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-[8px] font-black uppercase text-slate-400 transition-all mt-2"
                  >Reset to Defaults</button>
                </div>
              </section>
            )}

            <section>
              <h3 className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-4 flex items-center justify-between">Ingestion <i className="fas fa-plus-circle text-sky-600"></i></h3>
              <div className="bg-slate-900/40 rounded-3xl p-8 border-2 border-slate-800 border-dashed hover:border-sky-500/50 transition-all relative cursor-pointer text-center group mb-4">
                <input type="file" multiple accept=".gb,.genbank" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleFileUpload} />
                <i className="fas fa-folder-tree text-slate-700 group-hover:text-sky-500 mb-4 block text-4xl transition-colors"></i>
                <p className="text-[10px] font-black text-slate-500 uppercase group-hover:text-slate-300 tracking-tight">Drop GenBank Batch</p>
              </div>

              <div className={`bg-slate-900/40 rounded-3xl p-6 border-2 border-slate-800 border-dashed hover:border-emerald-500/50 transition-all relative cursor-pointer text-center group ${records.length === 0 ? 'opacity-30 pointer-events-none' : ''}`}>
                <input type="file" accept=".fasta,.fa" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleAlignmentUpload} />
                <i className="fas fa-file-import text-slate-700 group-hover:text-emerald-500 mb-3 block text-3xl transition-colors"></i>
                <p className="text-[9px] font-black text-slate-500 uppercase group-hover:text-slate-300 tracking-tight">Upload Pre-aligned FASTA</p>
                <p className="text-[7px] font-bold text-slate-600 uppercase mt-1">IDs must match active records</p>
              </div>

              <div className={`bg-slate-900/40 rounded-3xl p-6 border-2 border-slate-800 border-dashed hover:border-sky-500/50 transition-all relative cursor-pointer text-center group mt-4 ${records.length === 0 ? 'opacity-30 pointer-events-none' : ''}`}>
                <input type="file" multiple accept=".bed,.gff,.gff3,.bedgraph" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleAnnotationUpload} />
                <i className="fas fa-tags text-slate-700 group-hover:text-sky-500 mb-3 block text-3xl transition-colors"></i>
                <p className="text-[9px] font-black text-slate-500 uppercase group-hover:text-slate-300 tracking-tight">Import Annotations</p>
                <p className="text-[7px] font-bold text-slate-600 uppercase mt-1">BED, GFF3, or BedGraph</p>
              </div>

              <div className="bg-slate-900/40 rounded-3xl p-6 border-2 border-slate-800 border-dashed hover:border-amber-500/50 transition-all relative cursor-pointer text-center group mt-4">
                <input type="file" accept=".json" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleProjectUpload} />
                <i className="fas fa-project-diagram text-slate-700 group-hover:text-amber-500 mb-3 block text-3xl transition-colors"></i>
                <p className="text-[9px] font-black text-slate-500 uppercase group-hover:text-slate-300 tracking-tight">Load Project JSON</p>
                <p className="text-[7px] font-bold text-slate-600 uppercase mt-1">Restore entire workspace</p>
              </div>
            </section>

            <section className="flex flex-col min-h-0 pt-4">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-[11px] font-black uppercase text-slate-400 tracking-[0.2em] flex items-center gap-3">
                  <div className="w-6 h-6 rounded-lg bg-sky-500/10 flex items-center justify-center text-sky-500 shadow-inner">
                    <i className="fas fa-search text-[10px]"></i>
                  </div>
                  Sequence Search
                </h3>
                <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 shadow-inner">
                  <button 
                    onClick={() => setSearchMode('exact')} 
                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${searchMode === 'exact' ? 'bg-sky-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                  >IUPAC</button>
                  <button 
                    onClick={() => setSearchMode('fuzzy')} 
                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all ${searchMode === 'fuzzy' ? 'bg-amber-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                  >Fuzzy</button>
                </div>
              </div>

              <div className="space-y-6 bg-slate-900/40 p-6 rounded-[2.5rem] border border-slate-800/50 shadow-2xl flex flex-col min-h-0">
                <div className="space-y-3">
                  <div className="relative group">
                    <input 
                      type="text" 
                      placeholder={searchMode === 'exact' ? "Enter IUPAC sequence..." : "Enter query sequence..."}
                      className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-5 py-4 text-[12px] font-black text-slate-200 outline-none focus:border-sky-500 transition-all pr-20 shadow-inner group-hover:border-slate-700"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-3">
                      {searchQuery && (
                        <button 
                          onClick={() => {
                            setSearchQuery('');
                            setSearchResults([]);
                            setCurrentSearchIdx(-1);
                            setSelectedSearchIndices(new Set());
                          }}
                          className="text-slate-600 hover:text-rose-500 transition-colors"
                          title="Clear Search"
                        >
                          <i className="fas fa-times-circle text-sm"></i>
                        </button>
                      )}
                      {isSearching ? (
                        <i className="fas fa-circle-notch fa-spin text-sky-500 text-sm"></i>
                      ) : (
                        <button onClick={handleSearch} className="w-8 h-8 rounded-xl bg-sky-500/10 flex items-center justify-center text-sky-500 hover:bg-sky-500 hover:text-white transition-all shadow-inner">
                          <i className="fas fa-arrow-right text-[10px]"></i>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {searchMode === 'fuzzy' && (
                  <div className="space-y-4 pt-2 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="flex justify-between items-center px-1">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Min Match Confidence</label>
                      <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-500 text-[10px] font-black">{searchOptions.minScore}%</span>
                    </div>
                    <input 
                      type="range" min="0" max="100" step="5"
                      value={searchOptions.minScore}
                      onChange={e => setSearchOptions({...searchOptions, minScore: parseInt(e.target.value)})}
                      className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest px-1">Strand</label>
                    <div className="relative">
                      <select 
                        value={searchOptions.strand}
                        onChange={e => setSearchOptions({...searchOptions, strand: e.target.value as any})}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-[10px] font-black text-slate-400 outline-none focus:border-sky-500 appearance-none cursor-pointer"
                      >
                        <option value="both">Both Strands</option>
                        <option value="fwd">Forward Only</option>
                        <option value="rev">Reverse Only</option>
                      </select>
                      <i className="fas fa-chevron-down absolute right-4 top-1/2 -translate-y-1/2 text-[8px] text-slate-600 pointer-events-none"></i>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest px-1">Result Limit</label>
                    <input 
                      type="number"
                      value={searchOptions.maxResults}
                      onChange={e => setSearchOptions({...searchOptions, maxResults: parseInt(e.target.value)})}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-[10px] font-black text-slate-400 outline-none focus:border-sky-500"
                    />
                  </div>
                </div>

                {filteredResults.length > 0 && (
                  <div className="pt-6 border-t border-slate-800/50 flex flex-col min-h-0">
                    <div className="flex items-center justify-between mb-6 px-1">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-black text-slate-200 uppercase tracking-widest">{filteredResults.length} Matches</span>
                          <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter ${searchMode === 'exact' ? 'bg-sky-500/10 text-sky-500' : 'bg-amber-500/10 text-amber-500'}`}>
                            {searchMode}
                          </span>
                        </div>
                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tight">Across {Object.keys(groupedSearchResults).length} Records</span>
                      </div>
                      <div className="flex gap-2">
                        {selectedSearchIndices.size > 0 && (
                          <button 
                            onClick={() => setSelectedSearchIndices(new Set())}
                            className="text-[9px] font-black uppercase text-rose-500 hover:text-rose-400 transition-colors"
                          >Clear</button>
                        )}
                        {selectedSearchIndices.size > 1 && (
                          <button 
                            onClick={joinSelectedMatches}
                            className="px-4 py-2 rounded-xl bg-sky-600 text-white text-[9px] font-black uppercase hover:bg-sky-500 transition-all shadow-xl shadow-sky-900/40"
                          >Join Selected</button>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto custom-scrollbar-pro space-y-8 pr-2 max-h-[500px]">
                      {Object.entries(groupedSearchResults).map(([recordId, group]) => (
                        <div key={recordId} className="space-y-4">
                          <div className="flex items-center justify-between sticky top-0 bg-[#020617] z-10 py-2 border-b border-slate-800/50">
                            <div className="flex items-center gap-2">
                              <div className="w-1.5 h-1.5 rounded-full bg-sky-500 shadow-[0_0_8px_rgba(14,165,233,0.5)]"></div>
                              <span className="text-[10px] font-black text-slate-300 uppercase truncate max-w-[140px] tracking-tight">{recordId}</span>
                            </div>
                            <div className="flex gap-3">
                              <button 
                                onClick={() => toggleRecordSelection(recordId, true)}
                                className="text-[8px] font-black text-slate-500 uppercase hover:text-sky-400 transition-colors"
                              >Select All</button>
                              <button 
                                onClick={() => joinAllInRecord(recordId)}
                                className="text-[8px] font-black text-slate-500 uppercase hover:text-emerald-400 transition-colors"
                                title="Join all matches in this record"
                              >Join All</button>
                            </div>
                          </div>
                          
                          <div className="space-y-3 pl-1">
                            {group.results.map((match, localIdx) => {
                              const globalIdx = group.indices[localIdx];
                              const context = getSequenceContext(match.recordId, match.start, match.end);
                              const isActive = currentSearchIdx === globalIdx;
                              return (
                                <div 
                                  key={globalIdx}
                                  onClick={() => {
                                    setCurrentSearchIdx(globalIdx);
                                    setActiveTab('alignment');
                                    setActiveSelection({ start: match.start, end: match.end, recordIds: [match.recordId] });
                                  }}
                                  className={`group relative bg-slate-950/60 rounded-2xl p-4 border transition-all cursor-pointer ${isActive ? 'border-sky-500 ring-2 ring-sky-500/20 bg-sky-500/5' : 'border-slate-800/50 hover:border-slate-700 hover:bg-slate-900/40'}`}
                                >
                                  <div className="flex justify-between items-start mb-3">
                                    <div className="flex items-center gap-3">
                                      <div className="relative flex items-center justify-center">
                                        <input 
                                          type="checkbox" 
                                          checked={selectedSearchIndices.has(globalIdx)}
                                          onChange={(e) => {
                                            e.stopPropagation();
                                            const next = new Set(selectedSearchIndices);
                                            if (e.target.checked) next.add(globalIdx);
                                            else next.delete(globalIdx);
                                            setSelectedSearchIndices(next);
                                          }}
                                          className="w-4 h-4 rounded-lg border-slate-700 bg-slate-900 text-sky-600 focus:ring-sky-500 cursor-pointer"
                                        />
                                      </div>
                                      <div className="flex flex-col">
                                        <span className="text-[11px] font-black text-slate-200 tracking-tight">{match.start.toLocaleString()} <span className="text-slate-600 font-normal">→</span> {match.end.toLocaleString()}</span>
                                        <span className="text-[8px] font-black text-slate-600 uppercase tracking-widest">Position</span>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {match.score && (
                                        <div className="flex flex-col items-end">
                                          <span className="text-[10px] font-black text-amber-500">
                                            {maxScoreFound > 0 ? Math.round((match.score / maxScoreFound) * 100) : 0}%
                                          </span>
                                          <span className="text-[7px] font-black text-slate-600 uppercase tracking-tighter">Match</span>
                                        </div>
                                      )}
                                      <div className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-tight ${match.strand === 1 ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'}`}>
                                        {match.strand === 1 ? 'Forward' : 'Reverse'}
                                      </div>
                                    </div>
                                  </div>
                                  
                                  <div className="text-[11px] font-mono bg-black/60 p-3 rounded-xl border border-slate-800/50 overflow-hidden whitespace-nowrap text-ellipsis shadow-inner">
                                    <span className="text-slate-600">{context.pre}</span>
                                    <span className="text-sky-400 font-black bg-sky-400/20 px-1 rounded-sm shadow-[0_0_10px_rgba(56,189,248,0.2)]">{context.match}</span>
                                    <span className="text-slate-600">{context.post}</span>
                                  </div>
                                  
                                  <div className="mt-3 flex justify-between items-center">
                                    <div className="flex gap-2">
                                      {isActive && (
                                        <span className="text-[8px] font-black text-sky-500 uppercase flex items-center gap-1 animate-pulse">
                                          <i className="fas fa-eye"></i> Active
                                        </span>
                                      )}
                                    </div>
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        addAnnotationFromSearch(match.recordId, match.start, match.end, `Match: ${match.sequence}`);
                                      }}
                                      className="opacity-0 group-hover:opacity-100 transition-all text-[9px] font-black uppercase text-sky-500 hover:text-sky-400 flex items-center gap-2 bg-sky-500/10 px-3 py-1.5 rounded-lg border border-sky-500/20"
                                    >
                                      <i className="fas fa-plus text-[8px]"></i> Annotate
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section className="flex-1 flex flex-col min-h-[140px]">
              <h3 className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-3 flex items-center justify-between">Log Terminal <i className="fas fa-terminal text-[8px]"></i></h3>
              <div className="flex-1 bg-black/60 rounded-2xl p-5 font-mono text-[9px] text-slate-500 overflow-y-auto border border-slate-800 shadow-inner">
                {logs.map((log, i) => <div key={i} className="mb-2 pb-2 border-b border-slate-900/50 flex gap-3"><span className="text-emerald-500 font-black">#</span> <span className="flex-1">{log}</span></div>)}
              </div>
            </section>
          </div>
        </aside>

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
                <div className="flex-1 p-6 flex flex-col min-h-0 bg-slate-50/30 overflow-hidden">
                  <div className="flex justify-between items-end mb-6">
                    <div>
                      <h2 className="text-2xl font-black uppercase tracking-tighter text-slate-900">Database Hub</h2>
                      <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mt-1">
                        {records.length} Sequences • {allFeaturesCount} Annotations
                      </p>
                    </div>
                    <div className="flex gap-3">
                      <div className="relative">
                        <i className="fas fa-search absolute left-4 top-3 text-slate-400 text-sm"></i>
                        <input type="text" placeholder="Global search..." className="bg-white border border-slate-200 rounded-xl pl-11 pr-4 py-2.5 text-xs w-[280px] outline-none focus:border-sky-500 shadow-sm transition-all font-bold text-slate-900" value={featureSearch} onChange={(e) => setFeatureSearch(e.target.value)} />
                      </div>
                      <button onClick={startNewFeature} className="bg-sky-600 hover:bg-sky-500 text-white px-5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all shadow-md">
                        <i className="fas fa-plus mr-1.5"></i> Add Feature
                      </button>
                      <div className="flex bg-slate-800 rounded-xl p-1 shadow-md">
                        <button onClick={exportAllFasta} className="hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all" title="Export All FASTA">
                          <i className="fas fa-file-export mr-1.5"></i> FASTA
                        </button>
                        <button onClick={exportGenBankFile} className="hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all border-l border-slate-700" title="Export GenBank">
                          <i className="fas fa-dna mr-1.5"></i> GenBank
                        </button>
                        <button onClick={exportGffFile} className="hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all border-l border-slate-700" title="Export GFF3">
                          <i className="fas fa-file-code mr-1.5"></i> GFF3
                        </button>
                        <button onClick={exportProjectJson} className="hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all border-l border-slate-700" title="Export Project JSON">
                          <i className="fas fa-save mr-1.5"></i> Save Project
                        </button>
                      </div>
                      <button onClick={() => { if(confirm('Are you sure you want to clear all data?')) setRecords([]); }} className="bg-rose-600 hover:bg-rose-500 text-white px-5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all shadow-md">
                        <i className="fas fa-trash-alt mr-1.5"></i> Clear All
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 overflow-hidden border border-slate-200 rounded-3xl bg-white shadow-inner flex flex-col">
                    <div className="bg-slate-50 border-b border-slate-200 z-10 shadow-sm flex items-center px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      <div className="w-[15%]">Type / Strand</div>
                      <div className="w-[35%] px-4">Descriptor</div>
                      <div className="w-[20%] px-4">Location</div>
                      <div className="w-[10%] px-4 text-right">Length (bp)</div>
                      <div className="w-[20%] text-right">Actions</div>
                    </div>
                    <div className="flex-1">
                      <VariableSizeList
                        ref={hubListRef}
                        height={listHeight || 600}
                        width="100%"
                        itemCount={flattenedFeatures.length}
                        itemSize={getHubRowHeight}
                        className="custom-scrollbar-pro"
                      >
                        {HubRow}
                      </VariableSizeList>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
      
      <div className="bg-slate-950 border-t border-slate-800 px-6 py-2 flex justify-between items-center text-[9px] font-black uppercase tracking-widest text-slate-600">
        <div className="flex gap-4">
          <span>Dunceious v3.4</span>
          <span className="text-slate-800">|</span>
          <a href="https://creativecommons.org/licenses/by-nc/4.0/" target="_blank" rel="noreferrer" className="hover:text-sky-500 transition-colors">
            <i className="fab fa-creative-commons mr-1"></i> CC BY-NC 4.0 (Non-Commercial)
          </a>
        </div>
        <div className="flex gap-4">
          <span>Built for Science</span>
          <span className="text-slate-800">|</span>
          <span>© 2026</span>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes spin-slow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .animate-spin-slow { animation: spin-slow 12s linear infinite; }
        .tracking-tightest { tracking-letter: -0.05em; }
      `}} />
    </div>
  );
};

export default App;

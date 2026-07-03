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


import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { VariableSizeList } from 'react-window';
import { BioFeature, SearchResult, SelectionArea, SeqRecord } from '@/src/domain/bio/types';
import { RULER_HEIGHT, SIDEBAR_WIDTH } from './constants';
import { computeRecordLayouts } from './layout';
import { Ruler } from './Ruler';
import { ConservationTrack } from './tracks/ConservationTrack';
import { Row, type RowData } from './Row';
import { Minimap } from './Minimap';
import { useViewport } from './useViewport';
import { useSelectionDrag } from './useSelectionDrag';
import { SelectionOverlay } from './SelectionOverlay';

interface Props {
  records: SeqRecord[];
  consensus: string;
  showAnnotations: boolean;
  showTranslation: boolean;
  dragMode: 'pan' | 'select';
  activeSelection: SelectionArea | null;
  onSelectionChange: (selection: SelectionArea | null) => void;
  onExportFasta: () => void;
  onAddAnnotation: (recordId: string, start: number, end: number, name: string) => void;
  onExportRecord?: (recordId: string) => void;
  onViewDetails?: (recordId: string, feature?: BioFeature) => void;
  onRemoveRecord?: (recordId: string) => void;
  searchResults: SearchResult[];
  currentSearchIdx: number;
  selectedSearchIndices?: Set<number>;
  customColors?: Record<string, string>;
  jumpTo?: number | null;
  onJumpComplete?: () => void;
  showConservation: boolean;
  showTracks: boolean;
}

const GenomeViewer: React.FC<Props> = ({ 
  records, 
  consensus,
  showAnnotations, 
  showTranslation,
  dragMode,
  activeSelection,
  onSelectionChange,
  onExportFasta,
  onAddAnnotation,
  onExportRecord,
  onViewDetails,
  onRemoveRecord,
  searchResults,
  currentSearchIdx,
  selectedSearchIndices = new Set(),
  customColors,
  jumpTo,
  onJumpComplete,
  showConservation,
  showTracks
}) => {
  const [tooltip, setTooltip] = useState<{ x: number, y: number, content: string } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, recordId: string, feature?: BioFeature } | null>(null);
  const quantValueRanges = useMemo(() => {
    const ranges: Record<string, { min: number, max: number }> = {};
    records.forEach(r => {
      if (r.tracks) {
        r.tracks.forEach(t => {
          if (t.data.length === 0) {
            ranges[t.id] = { min: 0, max: 1 };
            return;
          }
          const min = t.data.reduce((min, d) => d.value < min ? d.value : min, t.data[0].value);
          const max = t.data.reduce((max, d) => d.value > max ? d.value : max, t.data[0].value);
          
          if (t.kind === 'interval') {
            ranges[t.id] = { min, max };
          } else {
            ranges[t.id] = { 
              min: Math.min(0, min),
              max: Math.max(0, max) 
            };
          }
          
          if (ranges[t.id].min === ranges[t.id].max) {
            ranges[t.id].max += 1;
          }
        });
      }
    });
    return ranges;
  }, [records]);
  const minimapContainerRef = useRef<HTMLDivElement>(null);


  const searchResultsByRecord = useMemo(() => {
    const groups: Record<string, SearchResult[]> = {};
    searchResults.forEach(r => {
      if (!groups[r.recordId]) groups[r.recordId] = [];
      groups[r.recordId].push(r);
    });
    return groups;
  }, [searchResults]);

  const alignmentLength = useMemo(() => {
    if (records.length === 0) return 0;
    return Math.max(...records.map(r => r.alignedSequence?.length || r.sequence.length));
  }, [records]);

  const {
    containerRef, horizontalScrollRef, listRef, listContainerRef,
    dimensions, listHeight, scrollX, zoomLevel, gotoPos, setGotoPos, mousePos, setZoomLevel,
    viewportWidth, chartWidth, fitZoom, xScaleGlobal,
    handleZoom, handleFit, handleCenterOnSelection, handleGoto, handleZoomToSelection,
    handleHorizontalScroll, handleMouseMove, handleMouseLeave,
  } = useViewport({ records, alignmentLength, activeSelection, onSelectionChange, jumpTo, onJumpComplete });

  const { dragSelection, dragCursorPos, handleMouseDown } = useSelectionDrag({ dragMode, activeSelection, onSelectionChange, records, alignmentLength, chartWidth, horizontalScrollRef, listRef });

  const handleContextMenu = useCallback((e: React.MouseEvent, recordId: string, feature?: BioFeature) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, recordId, feature });
  }, []);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  const conservationScores = useMemo(() => {
    if (!showConservation || records.length < 2) return [];
    const len = alignmentLength;
    const scores = new Array(len).fill(0);
    
    for (let i = 0; i < len; i++) {
      const counts: Record<string, number> = {};
      let total = 0;
      records.forEach(r => {
        const char = (r.alignedSequence || r.sequence)[i];
        if (char && char !== '-') {
          counts[char] = (counts[char] || 0) + 1;
          total++;
        }
      });
      if (total > 0) {
        const maxFreq = Math.max(...Object.values(counts));
        scores[i] = maxFreq / records.length; 
      }
    }
    return scores;
  }, [showConservation, records, alignmentLength]);

  const persistentSelection = activeSelection;
  const setPersistentSelection = onSelectionChange;

  // Layout Constants
  const RIGHT_SPACER = 250;
  const OVERVIEW_HEIGHT = 65;
  const SCROLLBAR_HEIGHT = 16;

  const recordLayouts = useMemo(
    () => computeRecordLayouts(records, { showAnnotations, showTranslation, showTracks }),
    [records, showAnnotations, showTranslation, showTracks],
  );

  useEffect(() => {
    if (listRef.current) {
      listRef.current.resetAfterIndex(0);
    }
  }, [recordLayouts]);

  // Main Tracks + Ruler Render (Now handled per row for virtualization)
  const itemData = useMemo<RowData>(() => ({
    recordLayouts,
    alignmentLength,
    scrollX,
    zoomLevel,
    viewportWidth,
    persistentSelection,
    showAnnotations,
    showTranslation,
    searchResultsByRecord,
    searchResults,
    currentSearchIdx,
    onSelectionChange: setPersistentSelection,
    onContextMenu: handleContextMenu,
    onViewDetails: (rid, f) => onViewDetails?.(rid, f),
    setTooltip,
    customColors,
    showConservation,
    conservationScores,
    quantValueRanges,
    showTracks
  }), [
    recordLayouts, alignmentLength, scrollX, zoomLevel, viewportWidth, 
    persistentSelection, showAnnotations, showTranslation, 
    searchResultsByRecord, searchResults, currentSearchIdx,
    setPersistentSelection, handleContextMenu, onViewDetails, setTooltip, customColors,
    showConservation, conservationScores, quantValueRanges, showTracks
  ]);

  return (
    <div ref={containerRef} className="flex-1 flex flex-col bg-white overflow-hidden relative border-t border-slate-200 min-h-0 min-w-0">
      
      {/* 1. COMPACT TOOLBAR & GLOBAL OVERVIEW */}
      <div ref={minimapContainerRef} className="h-[48px] flex-none bg-slate-50 border-b border-slate-200 px-3 flex items-center gap-3 z-20 min-w-0 shadow-sm">
        
        {/* MINIMAP SECTION */}
        <Minimap
          records={records}
          consensus={consensus}
          alignmentLength={alignmentLength}
          containerWidth={dimensions.width}
          viewportWidth={viewportWidth}
          scrollX={scrollX}
          zoomLevel={zoomLevel}
          fitZoom={fitZoom}
          searchResults={searchResults}
          currentSearchIdx={currentSearchIdx}
          customColors={customColors}
          horizontalScrollRef={horizontalScrollRef}
          onZoomChange={setZoomLevel}
        />

        {/* CONTROLS SECTION */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center bg-white rounded-md border border-slate-200 shadow-sm p-0.5">
            <div className="relative flex items-center">
              <i className="fas fa-location-arrow absolute left-2 text-[8px] text-slate-400"></i>
              <input 
                type="text" 
                placeholder="Go to..." 
                className="w-20 bg-transparent pl-5 pr-2 py-1 text-[9px] font-bold text-slate-700 outline-none focus:ring-1 focus:ring-sky-500 rounded"
                value={gotoPos}
                onChange={e => setGotoPos(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    handleGoto(parseInt(gotoPos.replace(/,/g, '')));
                    setGotoPos('');
                  }
                }}
              />
            </div>
          </div>
          {activeSelection && (
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-sky-50 rounded-lg border border-sky-100 text-[9px] font-black text-sky-700 uppercase tracking-tight">
              <i className="fas fa-vector-square text-[10px] opacity-50"></i>
              <span>{activeSelection.start.toLocaleString()} - {activeSelection.end.toLocaleString()}</span>
              <span className="opacity-30">|</span>
              {/* For circular wrap-around selections (start > end), compute length
                  as (seqLength - start) + end to avoid a negative/wrong value. */}
              <span>{(activeSelection.start <= activeSelection.end
                ? activeSelection.end - activeSelection.start
                : (alignmentLength - activeSelection.start) + activeSelection.end
              ).toLocaleString()} bp</span>
            </div>
          )}
          <div className="flex bg-white rounded-md border border-slate-200 shadow-sm p-0.5">
            <button onClick={handleFit} className="px-2 py-1 rounded hover:bg-slate-50 text-[8px] font-black uppercase text-slate-500 transition-all hover:text-sky-600">Fit</button>
            {activeSelection && (
              <div className="flex gap-0.5 ml-0.5 pl-0.5 border-l border-slate-100">
                <button onClick={handleCenterOnSelection} className="px-2 py-1 rounded bg-sky-50 hover:bg-sky-100 text-[8px] font-black uppercase text-sky-600" title="Center on Selection">Center</button>
                <button onClick={handleZoomToSelection} className="px-2 py-1 rounded bg-sky-50 hover:bg-sky-100 text-[8px] font-black uppercase text-sky-600">Zoom Sel</button>
                <button onClick={onExportFasta} className="w-6 h-6 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-600 flex items-center justify-center"><i className="fas fa-download text-[8px]"></i></button>
              </div>
            )}
          </div>
          <div className="flex bg-white rounded-md border border-slate-200 shadow-sm p-0.5">
            <button onClick={() => handleZoom(1)} className="w-6 h-6 rounded hover:bg-slate-50 text-slate-500 flex items-center justify-center hover:text-sky-600"><i className="fas fa-plus text-[9px]"></i></button>
            <button onClick={() => handleZoom(-1)} className="w-6 h-6 rounded hover:bg-slate-50 text-slate-500 flex items-center justify-center hover:text-sky-600"><i className="fas fa-minus text-[9px]"></i></button>
          </div>
        </div>
      </div>

      {/* 2. MAIN VISUAL VIEWPORT */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0 relative bg-slate-50">
        {/* STICKY TOP RULER */}
        <div className="h-[25px] flex-none bg-white/95 backdrop-blur-md border-b border-slate-200 z-30 shadow-sm flex items-end overflow-hidden min-w-0">
          <Ruler width={dimensions.width} height={RULER_HEIGHT} xScale={xScaleGlobal} scrollX={scrollX} sidebarWidth={SIDEBAR_WIDTH} onJump={handleGoto} />
        </div>

        {/* Selection Overlays */}
        <SelectionOverlay
          records={records} alignmentLength={alignmentLength} chartWidth={chartWidth}
          scrollX={scrollX} zoomLevel={zoomLevel} containerWidth={dimensions.width}
          mousePos={mousePos} persistentSelection={persistentSelection}
          dragSelection={dragSelection} dragCursorPos={dragCursorPos}
          onSelectionChange={onSelectionChange}
        />

        {contextMenu && (
          <div 
            className="fixed z-[1000] bg-white border border-slate-200 rounded-xl shadow-2xl py-2 min-w-[180px] animate-in fade-in zoom-in-95 duration-100"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={e => e.stopPropagation()}
          >
            <div className="px-4 py-2 border-b border-slate-100 mb-1">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                {contextMenu.feature ? 'Annotation Actions' : 'Record Actions'}
              </span>
              <div className="text-[11px] font-bold text-slate-900 truncate">
                {contextMenu.feature
                  ? contextMenu.feature.name
                  : (records.find(r => r.id === contextMenu.recordId)?.name || contextMenu.recordId)}
              </div>
            </div>
            <button 
              onClick={() => {
                if (contextMenu.feature) {
                  onSelectionChange({ start: contextMenu.feature.start, end: contextMenu.feature.end, recordIds: [contextMenu.recordId] });
                }
                handleZoomToSelection();
                setContextMenu(null);
              }}
              disabled={!persistentSelection && !contextMenu.feature}
              className={`w-full text-left px-4 py-2 text-[11px] font-bold flex items-center gap-3 transition-colors ${(!persistentSelection && !contextMenu.feature) ? 'text-slate-300 cursor-not-allowed' : 'text-slate-700 hover:bg-sky-50 hover:text-sky-600'}`}
            >
              <i className="fas fa-search-plus w-4 text-center opacity-50"></i> Zoom to {contextMenu.feature ? 'Annotation' : 'Selection'}
            </button>
            <button 
              onClick={() => {
                onExportRecord?.(contextMenu.recordId);
                setContextMenu(null);
              }}
              className="w-full text-left px-4 py-2 text-[11px] font-bold text-slate-700 hover:bg-emerald-50 hover:text-emerald-600 flex items-center gap-3 transition-colors"
            >
              <i className="fas fa-download w-4 text-center opacity-50"></i> Export Sequence
            </button>
            <button
              onClick={() => {
                onViewDetails?.(contextMenu.recordId, contextMenu.feature);
                setContextMenu(null);
              }}
              className="w-full text-left px-4 py-2 text-[11px] font-bold text-slate-700 hover:bg-amber-50 hover:text-amber-600 flex items-center gap-3 transition-colors"
            >
              <i className="fas fa-info-circle w-4 text-center opacity-50"></i> View Details
            </button>
            {onRemoveRecord && (
              <button
                onClick={() => {
                  const label = records.find(r => r.id === contextMenu.recordId)?.name || contextMenu.recordId;
                  if (window.confirm(`Remove sequence "${label}" from project?`)) {
                    onRemoveRecord(contextMenu.recordId);
                  }
                  setContextMenu(null);
                }}
                className="w-full text-left px-4 py-2 text-[11px] font-bold text-slate-700 hover:bg-rose-50 hover:text-rose-600 flex items-center gap-3 transition-colors"
              >
                <i className="fas fa-trash-alt w-4 text-center opacity-50"></i> Remove Sequence
              </button>
            )}
            <button
              onClick={() => {
                if (contextMenu.feature) {
                  const record = records.find(r => r.id === contextMenu.recordId);
                  if (record) {
                    const seq = record.alignedSequence || record.sequence;
                    const copiedSeq = seq.substring(contextMenu.feature.start, contextMenu.feature.end);
                    navigator.clipboard.writeText(copiedSeq);
                    setContextMenu(null);
                  }
                } else if (persistentSelection) {
                  const record = records.find(r => r.id === persistentSelection.recordIds[0]);
                  if (record) {
                    const seq = record.alignedSequence || record.sequence;
                    const start = Math.min(persistentSelection.start, persistentSelection.end);
                    const end = Math.max(persistentSelection.start, persistentSelection.end);
                    const copiedSeq = seq.substring(start, end);
                    navigator.clipboard.writeText(copiedSeq);
                    setContextMenu(null);
                  }
                }
              }}
              disabled={!persistentSelection && !contextMenu.feature}
              className={`w-full text-left px-4 py-2 text-[11px] font-bold flex items-center gap-3 transition-colors ${(!persistentSelection && !contextMenu.feature) ? 'text-slate-300 cursor-not-allowed' : 'text-slate-700 hover:bg-indigo-50 hover:text-indigo-600'}`}
            >
              <i className="fas fa-copy w-4 text-center opacity-50"></i> Copy Sequence
            </button>
          </div>
        )}

        {/* VIRTUALIZED LIST */}
        <div 
          ref={listContainerRef} 
          className={`flex-1 min-h-0 relative ${dragMode === 'pan' ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'}`} 
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {/* Mouse Guide */}
          {mousePos && (
            <div className="absolute top-0 bottom-0 w-px bg-sky-500/30 z-40 pointer-events-none" style={{ left: mousePos.x }}>
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full bg-sky-600 text-white text-[8px] font-black px-1.5 py-0.5 rounded shadow-lg">
                {mousePos.bp.toLocaleString()} bp
              </div>
            </div>
          )}
          {listHeight > 0 && (
            <VariableSizeList
              ref={listRef}
              height={listHeight}
              itemCount={records.length}
              itemSize={index => recordLayouts[index].height}
              width={dimensions.width}
              itemData={itemData}
              className="custom-scrollbar-pro overflow-x-hidden"
              style={{ overflowX: 'hidden' }}
            >
              {Row}
            </VariableSizeList>
          )}
        </div>

        {/* CONSERVATION TRACK (Optional) */}
        {showConservation && conservationScores && (
          <div className="h-[60px] flex-none bg-white border-t border-slate-200 relative overflow-hidden flex">
            <div className="w-[120px] flex-none bg-slate-50 border-r border-slate-200 z-10 flex flex-col items-end px-2 justify-center shrink-0">
              <div className="bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded text-[8px] font-black text-amber-600 uppercase tracking-widest">
                Conservation
              </div>
            </div>
            <div className="flex-1 relative overflow-hidden">
              <ConservationTrack 
                scores={conservationScores}
                viewportWidth={dimensions.width - SIDEBAR_WIDTH}
                height={60}
                xScale={xScaleGlobal}
                scrollX={scrollX}
              />
            </div>
          </div>
        )}

        {/* CUSTOM HORIZONTAL SCROLLBAR */}
        <div 
          ref={horizontalScrollRef}
          className="h-[16px] bg-slate-100 border-t border-slate-200 overflow-x-auto overflow-y-hidden custom-scrollbar-pro"
          onScroll={handleHorizontalScroll}
          style={{ width: dimensions.width - SIDEBAR_WIDTH, marginLeft: SIDEBAR_WIDTH }}
        >
          <div style={{ width: chartWidth + RIGHT_SPACER, height: 1 }} />
        </div>
      </div>

      {/* TOOLTIP */}
      {tooltip && (
        <div 
          className="fixed bg-slate-950 text-white border border-slate-700 p-4 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-[100] font-mono text-[11px] pointer-events-none animate-in fade-in zoom-in-95 duration-150" 
          style={{ left: tooltip.x + 20, top: tooltip.y + 20 }}
        >
          <div className="whitespace-pre font-bold leading-relaxed tracking-tight text-slate-100">
            {tooltip.content}
          </div>
          <div className="mt-2 pt-2 border-t border-slate-800 text-[9px] font-black uppercase text-slate-500 tracking-widest">
            Double-click to select region
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar-pro::-webkit-scrollbar { width: 14px; height: 14px; }
        .custom-scrollbar-pro::-webkit-scrollbar-track { background: #f1f5f9; }
        .custom-scrollbar-pro::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 8px; border: 4px solid #f1f5f9; }
        .custom-scrollbar-pro::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
        
        .brush .selection {
          fill: #0ea5e9;
          fill-opacity: 0.2;
          stroke: #0ea5e9;
          stroke-width: 2px;
          stroke-dasharray: 4,2;
          cursor: grab;
        }
        .brush .selection:active {
          cursor: grabbing;
          fill-opacity: 0.3;
        }
        .brush .handle {
          fill: #0ea5e9;
          width: 6px;
          rx: 3;
        }
        .brush .handle:hover {
          fill: #0284c7;
        }

        @keyframes selection-pulse {
          0% { background-color: rgba(56, 189, 248, 0.08); }
          50% { background-color: rgba(56, 189, 248, 0.15); }
          100% { background-color: rgba(56, 189, 248, 0.08); }
        }
        .animate-selection-pulse {
          animation: selection-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
      `}} />
    </div>
  );
};

export default GenomeViewer;
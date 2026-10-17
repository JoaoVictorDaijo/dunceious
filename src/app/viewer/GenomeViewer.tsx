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


import { ALIGNMENT_LOCK_TIP } from '@/src/app/logic/remoteAlignment';
import { isFocusedSelection, type FocusTarget } from '@/src/app/logic/focusTarget';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { VariableSizeList } from 'react-window';
import { BioFeature, SearchResult, SelectionArea, SeqRecord } from '@/src/domain/bio/types';
import { RULER_HEIGHT, SIDEBAR_WIDTH } from './constants';
import { computeRecordLayouts } from './layout';
import { ANNOT_BASES_MIN_ZOOM, TRANSLATION_MIN_ZOOM } from './constants';
import { Ruler } from './Ruler';
import { ConservationTrack } from './tracks/ConservationTrack';
import { Row, type RowData } from './Row';
import ViewerToolbar from './ViewerToolbar';
import type { ComparisonMenuProps } from '@/src/app/components/ComparisonMenu';
import { Minimap } from './Minimap';
import { useViewport } from './useViewport';
import { useBasesOpenness } from './useBasesOpenness';
import { useSelectionDrag } from './useSelectionDrag';
import { SelectionOverlay } from './SelectionOverlay';
import { TouchArbiter } from './touchGesture';
import { useTouchPanZoom } from './useTouchPanZoom';
import type { ActiveComparison } from '@/src/app/logic/alignmentComparison';

/**
 * GenomeViewer — virtualized, canvas-backed alignment/genome browser.
 *
 * Coordinate model: positions are 0-based half-open bp indices into a record's
 * `alignedSequence ?? sequence`. `alignmentLength` is the max aligned length
 * across records; the x-axis maps [0, alignmentLength] → px via a d3 linear
 * scale. A feature/selection with `start > end` denotes a circular wrap,
 * rendered as two segments: [start, len] and [0, end].
 *
 * Zoom/scroll model: `zoomLevel` is px-per-bp, clamped to [fitZoom, 150];
 * `fitZoom` fits the whole alignment in the viewport;
 * `chartWidth = alignmentLength * zoomLevel`. Horizontal position is driven by
 * a native scroll container (`horizontalScrollRef`) whose `scrollLeft` mirrors
 * `scrollX`; vertical scrolling is react-window (`VariableSizeList`, per-row
 * heights from the layout engine).
 *
 * Composition: pure layout (`layout.ts`) → per-row render (`Row` + canvas
 * `tracks/`) → viewport controls (`useViewport`) + drag/pan (`useSelectionDrag`)
 * + `Minimap` + `SelectionOverlay`. This container owns the record-derived
 * memos (`alignmentLength`, `quantValueRanges`, `conservationScores`,
 * `searchResultsByRecord`, `recordLayouts`, `itemData`) and wires the pieces.
 *
 * Props: see the `Props` interface below — records + consensus to render,
 * display toggles (annotations/translation/conservation/tracks), the
 * `dragMode`, the controlled `activeSelection`/`onSelectionChange`, search
 * state, and record-action callbacks.
 */
interface Props {
  records: SeqRecord[];
  consensus: string;
  showAnnotations: boolean;
  showTranslation: boolean;
  dragMode: 'pan' | 'select';
  activeSelection: SelectionArea | null;
  onClearSelection: () => void;
  comparisonMenu: Omit<ComparisonMenuProps, 'compact' | 'arrive'> | null;
  onSelectionChange: (selection: SelectionArea | null) => void;
  onExportFasta: () => void;
  onAddAnnotation: (recordId: string, start: number, end: number, name: string) => void;
  onExportRecord?: (recordId: string) => void;
  onViewDetails?: (recordId: string, feature?: BioFeature) => void;
  isAlignmentLocked?: boolean;
  onRemoveRecord?: (recordId: string) => void;
  searchResults: SearchResult[];
  currentSearchIdx: number;
  selectedSearchIndices?: Set<number>;
  customColors?: Record<string, string>;
  jumpTo?: number | null;
  onJumpComplete?: () => void;
  /** A region to fly to and frame once; `onFocusComplete` reports it handled. */
  focusRequest?: FocusTarget | null;
  onFocusComplete?: () => void;
  /** The last focused annotation, labelled while the selection is still exactly that region. */
  focusedRegion?: FocusTarget | null;
  showConservation: boolean;
  showTracks: boolean;
  /** Reference comparison to draw in the sequence rows; null draws every residue in its own colour. */
  comparison?: ActiveComparison | null;
  /** Offered in the record menu, on aligned records only, while a comparison is possible. */
  onSetComparisonReference?: (recordId: string) => void;
}

const GenomeViewer: React.FC<Props> = ({ 
  records, 
  consensus,
  showAnnotations, 
  showTranslation,
  dragMode,
  activeSelection,
  onClearSelection, comparisonMenu,
  onSelectionChange,
  onExportFasta,
  onAddAnnotation,
  onExportRecord,
  onViewDetails,
  onRemoveRecord,
  isAlignmentLocked = false,
  searchResults,
  currentSearchIdx,
  selectedSearchIndices = new Set(),
  customColors,
  jumpTo,
  onJumpComplete,
  focusRequest = null,
  onFocusComplete,
  focusedRegion = null,
  showConservation,
  showTracks,
  comparison = null,
  onSetComparisonReference,
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
    dimensions, listHeight, scrollX, zoomLevel, gotoPos, setGotoPos, mousePos, applyZoom, handleSelectionChange,
    viewportWidth, chartWidth, fitZoom, xScaleGlobal,
    handleZoom, handleFit, handleCenterOnSelection, handleGoto, handleZoomToSelection,
    handleHorizontalScroll, handleMouseMove, handleMouseLeave,
  } = useViewport({ records, alignmentLength, activeSelection, onSelectionChange, jumpTo, onJumpComplete, focusRequest, onFocusComplete });

  const touchArbiter = useRef(new TouchArbiter()).current;
  useTouchPanZoom({ containerRef: listContainerRef, horizontalScrollRef, listRef, arbiter: touchArbiter, zoomLevel, fitZoom, applyZoom });

  const { dragSelection, dragCursorPos, handleMouseDown } = useSelectionDrag({ dragMode, activeSelection, onSelectionChange: handleSelectionChange, records, alignmentLength, chartWidth, horizontalScrollRef, listRef });

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
  const setPersistentSelection = handleSelectionChange;

  // Layout Constants
  const RIGHT_SPACER = 250;
  const OVERVIEW_HEIGHT = 65;
  const SCROLLBAR_HEIGHT = 16;

  // A boolean, so the layout recomputes only when zoom crosses the threshold.
  const basesVisible = zoomLevel > ANNOT_BASES_MIN_ZOOM;
  const translationVisible = showTranslation && zoomLevel > TRANSLATION_MIN_ZOOM;
  const basesOpenness = useBasesOpenness(basesVisible);
  const recordLayouts = useMemo(
    () => computeRecordLayouts(records, { showAnnotations, translationVisible, showTracks, basesVisible }),
    [records, showAnnotations, translationVisible, showTracks, basesVisible],
  );

  useEffect(() => {
    if (listRef.current) {
      listRef.current.resetAfterIndex(0);
    }
  }, [recordLayouts]);

  // Shown once the flight has landed, and only until the selection is edited away from the region.
  const focusLabel = !focusRequest && isFocusedSelection(focusedRegion, activeSelection) ? focusedRegion : null;

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
    showTracks,
    basesOpenness,
    focusedRegion: focusLabel,
    comparison,
  }), [
    recordLayouts, alignmentLength, scrollX, zoomLevel, viewportWidth, 
    persistentSelection, showAnnotations, showTranslation, 
    searchResultsByRecord, searchResults, currentSearchIdx,
    setPersistentSelection, handleContextMenu, onViewDetails, setTooltip, customColors,
    showConservation, conservationScores, quantValueRanges, showTracks, basesOpenness, focusLabel, comparison
  ]);

  return (
    <div ref={containerRef} className="flex-1 flex flex-col bg-white overflow-hidden relative border-t border-slate-200 min-h-0 min-w-0">
      
      <ViewerToolbar activeSelection={activeSelection} alignmentLength={alignmentLength} comparisonMenu={comparisonMenu}
        onClearSelection={onClearSelection} onExportFasta={onExportFasta} gotoPos={gotoPos} setGotoPos={setGotoPos}
        handleGoto={handleGoto} handleCenterOnSelection={handleCenterOnSelection} handleZoomToSelection={handleZoomToSelection}
        handleFit={handleFit} handleZoom={handleZoom} minimap={
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
          onZoomChange={applyZoom}
          touchArbiter={touchArbiter}
        />      } />

      {/* 2. MAIN VISUAL VIEWPORT */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0 relative bg-[#f6f8fc]">
        {/* STICKY TOP RULER */}
        <div className="h-[25px] flex-none bg-[#f6f8fc] border-b border-slate-200/70 z-30 flex items-end overflow-hidden min-w-0">
          <Ruler width={dimensions.width} height={RULER_HEIGHT} xScale={xScaleGlobal} scrollX={scrollX} sidebarWidth={SIDEBAR_WIDTH} onJump={handleGoto} />
        </div>

        {/* Selection Overlays */}
        <SelectionOverlay
          records={records} alignmentLength={alignmentLength} chartWidth={chartWidth}
          scrollX={scrollX} zoomLevel={zoomLevel} containerWidth={dimensions.width}
          mousePos={mousePos} persistentSelection={persistentSelection}
          dragSelection={dragSelection} dragCursorPos={dragCursorPos}
          onSelectionChange={handleSelectionChange}
        />

        {contextMenu && (
          <div 
            className="fixed z-[1000] bg-white border border-slate-200 rounded-xl shadow-2xl py-2 min-w-[180px] animate-in fade-in zoom-in-95 duration-100"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={e => e.stopPropagation()}
          >
            <div className="px-4 py-2 border-b border-slate-100 mb-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
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
                  const selection = { start: contextMenu.feature.start, end: contextMenu.feature.end, recordIds: [contextMenu.recordId] };
                  handleSelectionChange(selection);
                  handleZoomToSelection(selection);
                } else {
                  handleZoomToSelection();
                }
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
            {onSetComparisonReference && !contextMenu.feature && records.find(r => r.id === contextMenu.recordId)?.alignedSequence && (
              <button
                onClick={() => {
                  onSetComparisonReference(contextMenu.recordId);
                  setContextMenu(null);
                }}
                data-tip="Compare every other aligned sequence against this one"
                className="w-full text-left px-4 py-2 text-[11px] font-bold text-slate-700 hover:bg-sky-50 hover:text-sky-600 flex items-center gap-3 transition-colors"
              >
                <i className="fas fa-thumbtack w-4 text-center opacity-50"></i> Use as Reference
              </button>
            )}
            {onRemoveRecord && (
              <button disabled={isAlignmentLocked} data-tip={isAlignmentLocked ? ALIGNMENT_LOCK_TIP : "Remove this sequence"}
                onClick={() => {
                  if (isAlignmentLocked) return;
                  const label = records.find(r => r.id === contextMenu.recordId)?.name || contextMenu.recordId;
                  if (window.confirm(`Remove sequence "${label}" from project?`)) {
                    if (!isAlignmentLocked) onRemoveRecord(contextMenu.recordId);
                  }
                  setContextMenu(null);
                }}
                className="disabled:opacity-30 disabled:cursor-not-allowed w-full text-left px-4 py-2 text-[11px] font-bold text-slate-700 hover:bg-rose-50 hover:text-rose-600 flex items-center gap-3 transition-colors"
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
          style={{ touchAction: 'none' }}
          className={`flex-1 min-h-0 relative ${dragMode === 'pan' ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'}`} 
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {/* Mouse Guide */}
          {mousePos && (
            <div className="absolute top-0 bottom-0 w-px bg-sky-500/30 z-40 pointer-events-none" style={{ left: mousePos.x }}>
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full bg-sky-600 text-white text-[11px] leading-none font-bold px-1.5 py-0.5 rounded shadow-lg">
                {(mousePos.bp + 1).toLocaleString()} bp
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
              className="custom-scrollbar-pro scrollbar-on-light overflow-x-hidden"
              style={{ overflowX: 'hidden', touchAction: 'none' }}
            >
              {Row}
            </VariableSizeList>
          )}
        </div>

        {/* CONSERVATION TRACK (Optional) */}
        {showConservation && conservationScores && (
          <div className="h-[60px] flex-none bg-white border-t border-slate-200 relative overflow-hidden flex">
            <div className="w-[120px] flex-none bg-slate-50 border-r border-slate-200 z-10 flex flex-col items-end px-2 justify-center shrink-0">
              <div className="bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded text-[8px] font-bold text-amber-600 uppercase tracking-widest">
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
          className="h-[12px] bg-slate-100 border-t border-slate-200 overflow-x-auto overflow-y-hidden custom-scrollbar-pro scrollbar-on-light"
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
          <div className="mt-2 pt-2 border-t border-slate-800 text-[10px] font-bold uppercase text-slate-500 tracking-widest">
            Double-click to select region
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        .brush .selection {
          fill: var(--env);
          fill-opacity: 0.07;
          stroke: var(--env);
          stroke-width: 2px;
          stroke-dasharray: 4,2;
          cursor: grab;
        }
        .brush .selection:active {
          cursor: grabbing;
          fill-opacity: 0.14;
        }
        .brush .handle {
          fill: var(--env);
          width: 6px;
          rx: 3;
        }
        .brush .handle:hover {
          fill: var(--env3);
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

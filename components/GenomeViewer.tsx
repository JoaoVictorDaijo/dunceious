import React, { useEffect, useRef, useState, useMemo, useCallback, memo } from 'react';
import * as d3 from 'd3';
import { VariableSizeList, ListChildComponentProps } from 'react-window';
import { SeqRecord, SelectionArea, SearchResult, BioFeature } from '../types';
import { getFeatureColor, translateSequence, getNucleotideColor, reverseComplement } from '../services/bioUtils';

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
  searchResults: SearchResult[];
  currentSearchIdx: number;
  selectedSearchIndices?: Set<number>;
  customColors?: Record<string, string>;
  jumpTo?: number | null;
  onJumpComplete?: () => void;
  showConservation: boolean;
  showTracks: boolean;
}

const SIDEBAR_WIDTH = 120;
const NT_ROW_HEIGHT = 22;
const AA_ROW_HEIGHT = 18;
const ANNOT_ROW_HEIGHT = 14;
const RULER_HEIGHT = 25;

const Ruler: React.FC<{ width: number; height: number; xScale: d3.ScaleLinear<number, number>; scrollX: number; sidebarWidth: number; onJump: (pos: number) => void }> = ({ width, height, xScale, scrollX, sidebarWidth, onJump }) => {
  const gRef = useRef<SVGGElement>(null);
  
  const handleClick = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - sidebarWidth;
    if (x >= 0) {
      const pos = Math.floor(xScale.invert(x + scrollX));
      onJump(pos);
    }
  };

  useEffect(() => {
    if (gRef.current) {
      const axisTop = d3.axisBottom(xScale)
        .ticks(Math.max(5, Math.floor((width - sidebarWidth) / 120)))
        .tickFormat(d => d.toLocaleString())
        .tickSize(8);
      
      const g = d3.select(gRef.current);
      g.call(axisTop);
      
      // Add minor ticks
      const [min, max] = xScale.domain();
      const tickValues = xScale.ticks(Math.max(5, Math.floor((width - sidebarWidth) / 120)));
      
      g.selectAll('.minor-tick').remove();
      if (tickValues.length > 1) {
        const step = tickValues[1] - tickValues[0];
        const minorTicks: number[] = [];
        for (let i = 0; i < tickValues.length; i++) {
          for (let j = 1; j < 5; j++) {
            const val = tickValues[i] + (step / 5) * j;
            if (val <= max) minorTicks.push(val);
          }
        }
        
        g.selectAll('.minor-tick')
          .data(minorTicks)
          .enter()
          .append('line')
          .attr('class', 'minor-tick')
          .attr('x1', d => xScale(d))
          .attr('x2', d => xScale(d))
          .attr('y1', 0)
          .attr('y2', 4)
          .attr('stroke', '#cbd5e1')
          .attr('stroke-width', 1);
      }

      g.selectAll('text')
        .attr('fill', '#475569')
        .style('font-size', '9px')
        .style('font-weight', '900')
        .style('font-family', 'JetBrains Mono, monospace');
      
      g.selectAll('.domain').attr('stroke', '#94a3b8').attr('stroke-width', 1.5);
      g.selectAll('.tick line').attr('stroke', '#94a3b8').attr('stroke-width', 1.5);
    }
  }, [xScale, width, sidebarWidth]);

  return (
    <svg width={width} height={height} className="overflow-visible cursor-pointer" onClick={handleClick}>
      <g ref={gRef} transform={`translate(${sidebarWidth - scrollX}, 0)`} />
    </svg>
  );
};

interface SequenceTrackProps {
  seq: string;
  xScale: d3.ScaleLinear<number, number>;
  viewportWidth: number;
  height: number;
  y: number;
  zoomLevel: number;
  scrollX: number;
  showTranslation: boolean;
  features: any[];
  conservationScores?: number[];
  showConservation?: boolean;
  searchResults: SearchResult[];
  allSearchResults: SearchResult[];
  currentSearchIdx: number;
}

const SequenceTrack: React.FC<SequenceTrackProps> = memo(({ 
  seq, xScale, viewportWidth, height, y, zoomLevel, scrollX, showTranslation, features,
  conservationScores, showConservation, searchResults, allSearchResults, currentSearchIdx
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = viewportWidth * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, viewportWidth, height);
    
    const seqY = y;

    const vStart = Math.max(0, Math.floor(scrollX / zoomLevel) - 5);
    const vEnd = Math.min(seq.length, Math.ceil((scrollX + viewportWidth) / zoomLevel) + 5);

    // Pre-calculate search highlights for this viewport
    const highlightMap = new Map<number, { isActive: boolean, strand: number }>();
    searchResults.forEach(r => {
      const globalIdx = allSearchResults.indexOf(r);
      const isActive = globalIdx === currentSearchIdx;
      
      const applyHighlight = (start: number, end: number) => {
        for (let k = start; k < end; k++) {
          if (k < vStart || k >= vEnd) continue;
          const existing = highlightMap.get(k);
          if (!existing || (!existing.isActive && isActive)) {
            highlightMap.set(k, { isActive, strand: r.strand });
          }
        }
      };

      if (r.segments && r.segments.length > 0) {
        r.segments.forEach(seg => applyHighlight(seg.start, seg.end));
      } else {
        if (r.start <= r.end) {
          applyHighlight(r.start, r.end);
        } else {
          applyHighlight(r.start, seq.length);
          applyHighlight(0, r.end);
        }
      }
    });

    // 0. Render Search Highlights (Background & Borders)
    const fullTrackH = (showTranslation ? AA_ROW_HEIGHT * 6 : 0) + NT_ROW_HEIGHT;
    const highlightY = showTranslation ? y - AA_ROW_HEIGHT * 3 : y;
    searchResults.forEach(r => {
      const globalIdx = allSearchResults.indexOf(r);
      const isActive = globalIdx === currentSearchIdx;
      
      const renderMatch = (start: number, end: number) => {
        const x = xScale(start) - scrollX;
        const w = xScale(end) - xScale(start);
        if (x + w < 0 || x > viewportWidth) return;

        const baseColor = r.strand === 1 ? (isActive ? "#fbbf24" : "#fef3c7") : (isActive ? "#f472b6" : "#fce7f3");
        ctx.save();
        ctx.fillStyle = baseColor;
        ctx.globalAlpha = isActive ? 0.9 : 0.5;
        ctx.fillRect(x, highlightY, w, fullTrackH);

        const strokeColor = r.strand === 1 ? (isActive ? "#92400e" : "#d97706") : (isActive ? "#9d174d" : "#db2777");
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = isActive ? 2 : 1;
        ctx.strokeRect(x, highlightY, w, fullTrackH);
        ctx.restore();
      };

      if (r.segments && r.segments.length > 0) {
        r.segments.forEach(seg => renderMatch(seg.start, seg.end));
      } else {
        if (r.start <= r.end) {
          renderMatch(r.start, r.end);
        } else {
          renderMatch(r.start, seq.length);
          renderMatch(0, r.end);
        }
      }
    });

    // 1. Render Nucleotides
    for (let j = vStart; j < vEnd; j++) {
      const char = seq[j] || '-';
      const isGap = char === '-';
      const cX = xScale(j) - scrollX;
      const cW = Math.max(0.1, xScale(j+1) - xScale(j));
      
      if (cX > viewportWidth) break;
      if (cX + cW < 0) continue;

      const highlight = highlightMap.get(j);
      if (!highlight) {
        ctx.fillStyle = isGap ? '#f1f5f9' : getNucleotideColor(char);
        ctx.globalAlpha = isGap ? 0.5 : 0.9;
        ctx.fillRect(cX, seqY, cW, NT_ROW_HEIGHT);
      }
      
      if (zoomLevel > 12) {
        if (!highlight) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(cX, seqY, cW, NT_ROW_HEIGHT);
        }
        
        ctx.globalAlpha = 1.0;
        ctx.fillStyle = (isGap && !highlight) ? '#94a3b8' : (highlight ? '#000' : '#fff');
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(char, cX + cW/2, seqY + NT_ROW_HEIGHT/2);
      }
    }

    // 2. Render Translation
    if (showTranslation && zoomLevel > 5) {
      features.filter(f => ['CDS', 'ORF', 'orf', 'cds'].includes(f.type)).forEach(f => {
        const segments = f.segments || [{ start: f.start, end: f.end }];
        let codingSeq = "";
        const alignedIndices: number[] = [];
        
        segments.forEach(seg => {
          for (let j = seg.start; j < seg.end; j++) {
            const char = seq[j];
            if (char && char !== '-') {
              codingSeq += char;
              alignedIndices.push(j);
            }
          }
        });

        if (f.strand === -1) {
          codingSeq = reverseComplement(codingSeq);
          alignedIndices.reverse();
        }

        for (let j = 0; j < codingSeq.length - 2; j += 3) {
          const aa = translateSequence(codingSeq.substring(j, j + 3));
          const startIdx = alignedIndices[j];
          const endIdx = alignedIndices[j+2];
          
          const aX = xScale(Math.min(startIdx, endIdx)) - scrollX;
          const aW = (xScale(Math.max(startIdx, endIdx) + 1) - xScale(Math.min(startIdx, endIdx)));

          if (aX + aW < 0 || aX > viewportWidth) continue;

          ctx.globalAlpha = 0.9;
          ctx.fillStyle = f.strand === 1 ? "#475569" : "#be185d";
          const frame = f.strand === 1 ? (f.start % 3) : (f.end % 3);
          const aaY = f.strand === 1 
            ? y - AA_ROW_HEIGHT * (3 - frame) 
            : y + NT_ROW_HEIGHT + AA_ROW_HEIGHT * frame;
          
          ctx.fillRect(aX, aaY, Math.max(1, aW), AA_ROW_HEIGHT);
          
          ctx.globalAlpha = 1.0;
          ctx.fillStyle = '#fff';
          ctx.font = 'bold 9px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(aa, aX + aW/2, aaY + AA_ROW_HEIGHT/2);
        }
      });
    }

    // 3. Render 6-Frame Translation Reference (Background)
    if (showTranslation && zoomLevel > 20) {
      const genomeLength = seq.length;
      ctx.save();
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      for (let frame = 0; frame < 3; frame++) {
        // Forward frames
        const fY = y - AA_ROW_HEIGHT * (3 - frame);
        // Start from the first possible codon start for this frame before vStart
        const startJ = vStart - ((vStart - frame + 3) % 3);
        
        for (let j = startJ; j < vEnd; j += 3) {
          if (j < 0 || j + 2 >= genomeLength) continue;
          const codon = seq.substring(j, j + 3);
          if (codon.includes('-')) continue;
          const aa = translateSequence(codon);
          const aX = xScale(j) - scrollX;
          const aW = xScale(j + 3) - xScale(j);
          if (aX + aW < 0 || aX > viewportWidth) continue;
          
          ctx.fillStyle = 'rgba(71, 85, 105, 0.4)';
          ctx.fillText(aa, aX + aW/2, fY + AA_ROW_HEIGHT/2);
        }

        // Reverse frames
        const rY = y + NT_ROW_HEIGHT + AA_ROW_HEIGHT * frame;
        // Reverse frame logic: translate RC(seq[j...j+2])
        // We use the same j positions but reverse complement the codon
        for (let j = startJ; j < vEnd; j += 3) {
          if (j < 0 || j + 2 >= genomeLength) continue;
          const codon = seq.substring(j, j + 3);
          if (codon.includes('-')) continue;
          const aa = translateSequence(reverseComplement(codon));
          const aX = xScale(j) - scrollX;
          const aW = xScale(j + 3) - xScale(j);
          if (aX + aW < 0 || aX > viewportWidth) continue;
          
          ctx.fillStyle = 'rgba(190, 24, 93, 0.4)';
          ctx.fillText(aa, aX + aW/2, rY + AA_ROW_HEIGHT/2);
        }
      }
      ctx.restore();
    }
  }, [seq, xScale, viewportWidth, height, y, zoomLevel, scrollX, showTranslation, features, searchResults, allSearchResults, currentSearchIdx]);

  return <canvas ref={canvasRef} style={{ width: viewportWidth, height: height, position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }} />;
});

interface RowData {
  recordLayouts: any[];
  alignmentLength: number;
  scrollX: number;
  zoomLevel: number;
  viewportWidth: number;
  persistentSelection: SelectionArea | null;
  showAnnotations: boolean;
  showTranslation: boolean;
  searchResultsByRecord: Record<string, SearchResult[]>;
  searchResults: SearchResult[];
  currentSearchIdx: number;
  onSelectionChange: (selection: SelectionArea | null) => void;
  onContextMenu: (e: React.MouseEvent, recordId: string, feature?: BioFeature) => void;
  onViewDetails: (recordId: string, feature?: BioFeature) => void;
  setTooltip: (tooltip: { x: number, y: number, content: string } | null) => void;
  customColors?: Record<string, string>;
  showConservation: boolean;
  conservationScores: number[];
  quantValueRanges: Record<string, { min: number, max: number }>;
  showTracks: boolean;
}

const ConservationTrack: React.FC<{
  scores: number[];
  viewportWidth: number;
  height: number;
  xScale: d3.ScaleLinear<number, number>;
  scrollX: number;
}> = memo(({ scores, viewportWidth, height, xScale, scrollX }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = viewportWidth * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, viewportWidth, height);

    const [minBP, maxBP] = xScale.domain();
    const vStart = Math.max(0, Math.floor(xScale.invert(scrollX)) - 5);
    const vEnd = Math.min(scores.length, Math.ceil(xScale.invert(scrollX + viewportWidth)) + 5);

    ctx.beginPath();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';

    let first = true;
    for (let j = vStart; j < vEnd; j++) {
      const score = scores[j] || 0;
      const x = xScale(j) - scrollX;
      const y = height - (score * (height - 10)) - 5;

      if (x > viewportWidth) break;
      if (x < 0 && !first) {
        ctx.lineTo(x, y);
        continue;
      }

      if (first) {
        ctx.moveTo(x, y);
        first = false;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    // Fill area under the line
    ctx.lineTo(xScale(vEnd - 1) - scrollX, height);
    ctx.lineTo(xScale(vStart) - scrollX, height);
    ctx.closePath();
    ctx.fillStyle = 'rgba(245, 158, 11, 0.1)';
    ctx.fill();

  }, [scores, viewportWidth, height, xScale, scrollX]);

  return <canvas ref={canvasRef} style={{ width: viewportWidth, height: height }} />;
});

const TRACK_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

const QuantitativeTrack: React.FC<{
  data: { start: number; end: number; value: number }[];
  viewportWidth: number;
  height: number;
  xScale: d3.ScaleLinear<number, number>;
  scrollX: number;
  minVal: number;
  maxVal: number;
  color?: string;
  kind?: 'line' | 'interval';
  packedRows?: any[][];
}> = memo(({ data, viewportWidth, height, xScale, scrollX, minVal, maxVal, color = '#6366f1', kind = 'line', packedRows: externalPackedRows }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const packedRows = useMemo(() => {
    if (kind !== 'interval') return [];
    if (externalPackedRows) return externalPackedRows;
    const rows: any[][] = [];
    const sorted = [...data].sort((a, b) => a.start - b.start);
    
    sorted.forEach(interval => {
      let placed = false;
      for (let i = 0; i < rows.length; i++) {
        const lastInRow = rows[i][rows[i].length - 1];
        if (interval.start >= lastInRow.end + 1) {
          rows[i].push(interval);
          placed = true;
          break;
        }
      }
      if (!placed) {
        rows.push([interval]);
      }
    });
    return rows;
  }, [data, kind, externalPackedRows]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = viewportWidth * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, viewportWidth, height);

    const range = Math.max(0.00001, maxVal - minVal);
    const getY = (val: number) => {
      const normalized = (val - minVal) / range;
      return height - (normalized * (height - 10)) - 5;
    };

    // Draw Grid
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= 4; i++) {
      const y = 5 + (i * (height - 10) / 4);
      ctx.moveTo(0, y);
      ctx.lineTo(viewportWidth, y);
    }
    ctx.stroke();

    // Draw Zero Line if range spans zero
    if (minVal < 0 && maxVal > 0) {
      const zeroY = getY(0);
      ctx.strokeStyle = '#e2e8f0';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, zeroY);
      ctx.lineTo(viewportWidth, zeroY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (!data || data.length === 0) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = 'italic 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No track data available', viewportWidth / 2, height / 2 + 4);
      return;
    }

    const vStart = xScale.invert(scrollX) - 10;
    const vEnd = xScale.invert(scrollX + viewportWidth) + 10;

    if (kind === 'line') {
      const visibleData = data.filter(d => d.end >= vStart && d.start <= vEnd);
      
      if (visibleData.length === 0) return;

      // Sort by start position for drawing
      const sorted = [...visibleData].sort((a, b) => a.start - b.start);

      const zeroY = getY(0);

      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';

      let first = true;
      sorted.forEach(d => {
        const x = xScale(d.start + (d.end - d.start) / 2) - scrollX;
        const y = getY(d.value);

        if (first) {
          ctx.moveTo(x, y);
          first = false;
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();

      // Area fill
      if (sorted.length > 0) {
        const lastX = xScale(sorted[sorted.length - 1].start + (sorted[sorted.length - 1].end - sorted[sorted.length - 1].start) / 2) - scrollX;
        const firstX = xScale(sorted[0].start + (sorted[0].end - sorted[0].start) / 2) - scrollX;
        
        ctx.lineTo(lastX, zeroY);
        ctx.lineTo(firstX, zeroY);
        ctx.closePath();
        ctx.fillStyle = `${color}15`;
        ctx.fill();
      }
    } else {
      // Interval logic with packing and coloring
      if (packedRows.length === 0) return;

      const rowHeight = 16;
      const colorScale = d3.scaleSequential(d3.interpolateViridis).domain([minVal, maxVal]);

      packedRows.forEach((row, rowIndex) => {
        const yOffset = 5 + rowIndex * rowHeight;
        const visibleInRow = row.filter(d => d.end >= vStart && d.start <= vEnd);
        
        visibleInRow.forEach(d => {
          const x1 = xScale(d.start) - scrollX;
          const x2 = xScale(d.end) - scrollX;
          const w = Math.max(1, x2 - x1);
          
          const fillColor = colorScale(d.value);
          ctx.fillStyle = fillColor;
          
          // Draw rounded rect
          const radius = 2;
          ctx.beginPath();
          ctx.moveTo(x1 + radius, yOffset);
          ctx.lineTo(x1 + w - radius, yOffset);
          ctx.quadraticCurveTo(x1 + w, yOffset, x1 + w, yOffset + radius);
          ctx.lineTo(x1 + w, yOffset + rowHeight - 2 - radius);
          ctx.quadraticCurveTo(x1 + w, yOffset + rowHeight - 2, x1 + w - radius, yOffset + rowHeight - 2);
          ctx.lineTo(x1 + radius, yOffset + rowHeight - 2);
          ctx.quadraticCurveTo(x1, yOffset + rowHeight - 2, x1, yOffset + rowHeight - 2 - radius);
          ctx.lineTo(x1, yOffset + radius);
          ctx.quadraticCurveTo(x1, yOffset, x1 + radius, yOffset);
          ctx.closePath();
          ctx.fill();
          
          // Outline
          ctx.strokeStyle = 'rgba(0,0,0,0.15)';
          ctx.lineWidth = 0.5;
          ctx.stroke();

          // Add value label if wide enough
          if (w > 30 && rowHeight > 10) {
            ctx.fillStyle = d3.hsl(fillColor).l > 0.6 ? '#000' : '#fff';
            ctx.font = '7px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(d.value.toFixed(1), x1 + w/2, yOffset + rowHeight/2 + 2);
          }
        });
      });
    }
  }, [data, viewportWidth, height, xScale, scrollX, minVal, maxVal, color, kind, packedRows]);

  return <canvas ref={canvasRef} style={{ width: viewportWidth, height: height, position: 'absolute', top: 0, left: 0, display: 'block' }} />;
});

const Row = memo(({ index, style, data }: ListChildComponentProps<RowData>) => {
  const { 
    recordLayouts, alignmentLength, scrollX, zoomLevel, viewportWidth, 
    persistentSelection, showAnnotations, showTranslation, 
    searchResultsByRecord, searchResults, currentSearchIdx,
    onSelectionChange, onContextMenu, onViewDetails, setTooltip, customColors,
    showConservation, conservationScores,
    quantValueRanges,
    showTracks
  } = data;

  const l = recordLayouts[index];
  const chartWidth = alignmentLength * zoomLevel;
  const xScale = d3.scaleLinear().domain([0, alignmentLength]).range([0, chartWidth]);
  
  const vStart = Math.max(0, Math.floor(scrollX / zoomLevel) - 30);
  const vEnd = Math.min(alignmentLength, Math.ceil((scrollX + viewportWidth) / zoomLevel) + 30);

  const seq = l.record.alignedSequence || l.record.sequence;
  const rowSearchResults = searchResultsByRecord[l.id] || [];
  const tracks = l.record.tracks || [];

  return (
    <div 
      style={style} 
      className="flex group hover:bg-sky-50/20 transition-colors relative border-b border-slate-100"
      onContextMenu={(e) => onContextMenu(e, l.id)}
    >
      {/* SIDEBAR (Sticky Names) */}
      <div className="w-[120px] flex-none bg-slate-50 border-r border-slate-200 z-10 select-none flex flex-col items-end px-2 shrink-0 relative">
        {showAnnotations && l.annotHeight > 0 && (
          <>
            <div className="absolute right-0 w-1 bg-slate-200" style={{ top: 0, height: l.annotHeight + l.topPadding }} />
            <div className="absolute right-2 flex items-center" style={{ top: 4, height: 12 }}>
              <span className="text-[6px] font-black uppercase text-slate-400 tracking-widest">Annot</span>
            </div>
          </>
        )}
        
        {showTracks && tracks.length > 0 && (
          <>
            <div className="absolute right-0 w-1 bg-indigo-400/30" style={{ top: l.annotHeight + l.topPadding, height: l.quantHeight }} />
            <div className="absolute right-2 flex items-center" style={{ top: l.annotHeight + l.topPadding - 12, height: 12 }}>
              <span className="text-[6px] font-black uppercase text-indigo-400 tracking-widest">Tracks</span>
            </div>
            {/* Track Legends */}
            <div className="absolute left-0 right-2 flex flex-col items-end pointer-events-none" style={{ top: l.annotHeight + l.topPadding }}>
              {l.trackLayouts.map((t: any) => {
                const range = quantValueRanges[t.id] || { min: 0, max: 1 };
                return (
                  <div key={t.id} className="flex flex-col justify-center items-end" style={{ height: t.height, marginBottom: 12 }}>
                    <span className="text-[7px] font-bold text-slate-500">{range.max.toFixed(1)}</span>
                    {t.kind === 'interval' ? (
                      <div 
                        className="w-16 h-1.5 my-0.5 rounded-[1px]" 
                        style={{ background: 'linear-gradient(to right, #440154, #21918c, #fde725)' }} 
                      />
                    ) : (
                      <div className="w-16 h-[1px] my-1 bg-indigo-400/50" />
                    )}
                    <span className="text-[7px] font-bold text-slate-500">{range.min.toFixed(1)}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div className="absolute right-0 w-1 bg-emerald-400/30" style={{ top: l.seqBaseY - (showTranslation ? AA_ROW_HEIGHT * 3 : 0), height: (showTranslation ? AA_ROW_HEIGHT * 6 : 0) + NT_ROW_HEIGHT }} />
        <div className="absolute right-2 flex items-center" style={{ top: l.seqBaseY - (showTranslation ? AA_ROW_HEIGHT * 3 : 0) - 12, height: 12 }}>
          <span className="text-[6px] font-black uppercase text-emerald-500 tracking-widest">Sequence</span>
        </div>

        {showTranslation && (
          <div className="absolute left-0 right-2 flex flex-col items-end pointer-events-none" style={{ top: l.seqBaseY - AA_ROW_HEIGHT * 3 }}>
            <span className="text-[7px] font-black text-slate-400 h-[18px] flex items-center">F1</span>
            <span className="text-[7px] font-black text-slate-400 h-[18px] flex items-center">F2</span>
            <span className="text-[7px] font-black text-slate-400 h-[18px] flex items-center">F3</span>
          </div>
        )}
        <div className="w-full truncate text-right bg-white px-2 py-1.5 rounded-md border border-slate-200 text-[9px] font-black text-slate-900 shadow-sm tracking-tight" title={l.id} style={{ marginTop: l.seqBaseY + 2 }}>
          {l.id}
        </div>
        {showTranslation && (
          <div className="absolute left-0 right-2 flex flex-col items-end pointer-events-none" style={{ top: l.seqBaseY + NT_ROW_HEIGHT }}>
            <span className="text-[7px] font-black text-slate-400 h-[18px] flex items-center">R1</span>
            <span className="text-[7px] font-black text-slate-400 h-[18px] flex items-center">R2</span>
            <span className="text-[7px] font-black text-slate-400 h-[18px] flex items-center">R3</span>
          </div>
        )}
      </div>

      {/* SEQUENCE CONTENT AREA */}
      <div className="flex-1 overflow-hidden bg-white relative">
        <div style={{ width: viewportWidth, height: l.height, position: 'relative' }}>
          {/* Section Backgrounds & Labels */}
          {showAnnotations && l.annotHeight > 0 && (
            <div className="absolute left-0 right-0 bg-slate-50/30 border-b border-slate-100/50" style={{ top: 0, height: l.annotHeight + l.topPadding }}>
              <div className="absolute left-2 z-30 pointer-events-none" style={{ top: 4 }}>
                <span className="text-[7px] font-black uppercase text-slate-400 tracking-widest">Annotations</span>
              </div>
            </div>
          )}
          
          {showTracks && tracks.length > 0 && (
            <div className="absolute left-2 z-30 pointer-events-none" style={{ top: l.annotHeight + l.topPadding - 12 }}>
              <span className="text-[7px] font-black uppercase text-indigo-400 tracking-widest">Quantitative Tracks</span>
            </div>
          )}

          <SequenceTrack 
            seq={seq}
            xScale={xScale}
            viewportWidth={viewportWidth}
            height={l.height}
            y={l.seqBaseY}
            zoomLevel={zoomLevel}
            scrollX={scrollX}
            showTranslation={showTranslation}
            features={l.record.features}
            showConservation={showConservation}
            conservationScores={conservationScores}
            searchResults={rowSearchResults}
            allSearchResults={searchResults}
            currentSearchIdx={currentSearchIdx}
          />
          <svg width={viewportWidth} height={l.height} style={{ position: 'absolute', top: 0, left: 0, zIndex: 5 }}>
            {/* Background Grid */}
            {(() => {
              const tickValues = xScale.ticks(Math.max(5, Math.floor(viewportWidth / 120)));
              return tickValues.map(t => {
                const x = xScale(t) - scrollX;
                if (x < 0 || x > viewportWidth) return null;
                return <line key={t} x1={x} y1={0} x2={x} y2={l.height} stroke="#f1f5f9" strokeWidth={1} />;
              });
            })()}

            {/* Selection Backgrounds (Row Specific) */}
            {persistentSelection && persistentSelection.recordIds.includes(l.id) && (
              (() => {
                const s = xScale(persistentSelection.start) - scrollX;
                const e = xScale(persistentSelection.end) - scrollX;
                
                if (persistentSelection.start <= persistentSelection.end) {
                  if (s > viewportWidth || e < 0) return null;
                  return (
                    <rect 
                      x={Math.max(0, s)} 
                      y={0} 
                      width={Math.min(viewportWidth - Math.max(0, s), e - Math.max(0, s))} 
                      height={l.height} 
                      fill="#3b82f6" 
                      opacity={0.08} 
                    />
                  );
                } else {
                  const e1 = xScale(alignmentLength) - scrollX;
                  const e2 = xScale(persistentSelection.end) - scrollX;
                  return (
                    <React.Fragment>
                      {s < viewportWidth && (
                        <rect x={Math.max(0, s)} y={0} width={Math.min(viewportWidth, e1) - Math.max(0, s)} height={l.height} fill="#3b82f6" opacity={0.08} />
                      )}
                      {e2 > 0 && (
                        <rect x={0} y={0} width={Math.min(viewportWidth, e2)} height={l.height} fill="#3b82f6" opacity={0.08} />
                      )}
                    </React.Fragment>
                  );
                }
              })()
            )}
            
            {/* Annotations */}
            {showAnnotations && l.placements.map((p: any, i: number) => {
              const f = p.feature;
              const isWrap = f.start > f.end;
              
              // Visibility check: if the feature is completely outside the viewport
              // For wrapped features, they are almost always visible if the sequence is visible, 
              // but we can be more precise.
              if (!isWrap) {
                if (f.end < vStart || f.start > vEnd) return null;
              } else {
                // Wrapped feature: visible if [start, len] or [0, end] overlaps [vStart, vEnd]
                const part1Visible = f.start <= vEnd && alignmentLength >= vStart;
                const part2Visible = 0 <= vEnd && f.end >= vStart;
                if (!part1Visible && !part2Visible) return null;
              }

              const y = p.row * (ANNOT_ROW_HEIGHT + 6) + l.topPadding;
              const isSelected = persistentSelection && f.start === persistentSelection.start && f.end === persistentSelection.end;

              const tooltipContent = [
                `${f.name} [${f.type}]`,
                f.metadata?.value ? `Value: ${f.metadata.value}` : null,
                `Locus: ${f.locationString || `${f.start + 1}..${f.end}`}`,
                `Strand: ${f.strand === 1 ? '+' : '-'}`,
                f.metadata?.product ? `Product: ${f.metadata.product}` : null,
                f.metadata?.note ? `Note: ${f.metadata.note}` : null
              ].filter(Boolean).join('\n');

              const renderPart = (s: number, e: number, keySuffix: string) => {
                const fX = xScale(s) - scrollX, fW = xScale(e) - xScale(s);
                if (fX > viewportWidth || fX + fW < 0) return null;

                if (f.type === 'quantitative_data') return null; // Handled by QuantitativeTrack

                let rectHeight = ANNOT_ROW_HEIGHT;
                let rectY = y;
                let fill = f.color || getFeatureColor(f.type, customColors);

                return (
                  <rect 
                    key={`${i}-${keySuffix}`}
                    x={fX} y={rectY} width={Math.max(1, fW)} height={rectHeight}
                    fill={fill} rx={4}
                    stroke={isSelected ? '#000' : 'none'} strokeWidth={1}
                    style={{ cursor: 'pointer' }} opacity={isSelected ? 1 : 0.85}
                    onMouseOver={(ev) => setTooltip({ x: ev.pageX, y: ev.pageY, content: tooltipContent })}
                    onMouseOut={() => setTooltip(null)}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onViewDetails?.(l.id, f);
                    }}
                    onContextMenu={(ev) => {
                      ev.stopPropagation();
                      onContextMenu(ev, l.id, f);
                    }}
                    onDoubleClick={(ev) => {
                      ev.stopPropagation();
                      ev.preventDefault();
                      onSelectionChange({ start: f.start, end: f.end, recordIds: [l.id] });
                    }}
                  />
                );
              };

              if (f.segments && f.segments.length > 0) {
                const firstSeg = f.segments[0];
                const lastSeg = f.segments[f.segments.length - 1];
                const lineY = y + ANNOT_ROW_HEIGHT / 2;
                
                // Draw connecting lines between segments
                const connectingLines: React.ReactElement[] = [];
                for (let idx = 0; idx < f.segments.length - 1; idx++) {
                  const s1 = f.segments[idx];
                  const s2 = f.segments[idx + 1];
                  
                  // Normal connection
                  if (s1.end <= s2.start) {
                    const x1 = xScale(s1.end) - scrollX;
                    const x2 = xScale(s2.start) - scrollX;
                    if (x2 > 0 && x1 < viewportWidth) {
                      connectingLines.push(
                        <line 
                          key={`line-${idx}`}
                          x1={Math.max(0, x1)} y1={lineY} x2={Math.min(viewportWidth, x2)} y2={lineY} 
                          stroke={f.color || getFeatureColor(f.type, customColors)} strokeWidth={1} opacity={0.4} strokeDasharray="2,1"
                        />
                      );
                    }
                  } else {
                    // Wrap around connection (e.g. end of genome to start of genome)
                    const x1 = xScale(s1.end) - scrollX;
                    const xEnd = xScale(alignmentLength) - scrollX;
                    const xStart = xScale(0) - scrollX;
                    const x2 = xScale(s2.start) - scrollX;
                    
                    if (xEnd > 0 && x1 < viewportWidth) {
                      connectingLines.push(
                        <line 
                          key={`line-wrap-1-${idx}`}
                          x1={Math.max(0, x1)} y1={lineY} x2={Math.min(viewportWidth, xEnd)} y2={lineY} 
                          stroke={f.color || getFeatureColor(f.type, customColors)} strokeWidth={1} opacity={0.4} strokeDasharray="2,1"
                        />
                      );
                    }
                    if (x2 > 0 && xStart < viewportWidth) {
                      connectingLines.push(
                        <line 
                          key={`line-wrap-2-${idx}`}
                          x1={Math.max(0, xStart)} y1={lineY} x2={Math.min(viewportWidth, x2)} y2={lineY} 
                          stroke={f.color || getFeatureColor(f.type, customColors)} strokeWidth={1} opacity={0.4} strokeDasharray="2,1"
                        />
                      );
                    }
                  }
                }
                
                return (
                  <React.Fragment key={i}>
                    {connectingLines}
                    {f.segments.map((seg: any, idx: number) => renderPart(seg.start, seg.end, `seg-${idx}`))}
                  </React.Fragment>
                );
              }

              if (isWrap) {
                return (
                  <React.Fragment key={i}>
                    {renderPart(f.start, alignmentLength, 'p1')}
                    {renderPart(0, f.end, 'p2')}
                  </React.Fragment>
                );
              }
              return renderPart(f.start, f.end, 'p1');
            })}

          </svg>

          {/* Quantitative Tracks - Rendered after SVG to be on top */}
          {showTracks && l.trackLayouts.map((track: any, idx: number) => {
            const trackColor = track.color || TRACK_COLORS[idx % TRACK_COLORS.length];
            const trackTop = l.annotHeight + l.topPadding + track.top;
            return (
              <div 
                key={track.id} 
                className="absolute left-0 right-0 border border-slate-200/60 bg-white/60 rounded-sm shadow-[0_1px_3px_rgba(0,0,0,0.05)] group/track z-30 mx-0.5" 
                style={{ height: track.height, top: trackTop }}
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const bp = xScale.invert(x + scrollX);
                  const nearest = track.data.find((d: any) => bp >= d.start && bp <= d.end);
                  if (nearest) {
                    setTooltip({ 
                      x: e.pageX, 
                      y: e.pageY, 
                      content: `${track.name}\nPos: ${Math.floor(bp) + 1}\nValue: ${nearest.value}` 
                    });
                  } else {
                    setTooltip(null);
                  }
                }}
                onMouseLeave={() => setTooltip(null)}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const bp = xScale.invert(x + scrollX);
                  const nearest = track.data.find((d: any) => bp >= d.start && bp <= d.end);
                  if (nearest) {
                    onSelectionChange({ start: nearest.start, end: nearest.end, recordIds: [l.id] });
                  }
                }}
              >
                <div className="absolute left-2 top-2 z-10">
                  <span 
                    className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded border shadow-sm"
                    style={{ 
                      color: trackColor, 
                      backgroundColor: '#fff',
                      borderColor: `${trackColor}40`
                    }}
                  >
                    {track.name}
                  </span>
                </div>
                <QuantitativeTrack 
                  data={track.data}
                  viewportWidth={viewportWidth}
                  height={track.height}
                  xScale={xScale}
                  scrollX={scrollX}
                  minVal={quantValueRanges[track.id]?.min || 0}
                  maxVal={quantValueRanges[track.id]?.max || 1}
                  color={trackColor}
                  kind={track.kind}
                  packedRows={track.packedRows}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

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
  searchResults,
  currentSearchIdx,
  selectedSearchIndices = new Set(),
  customColors,
  jumpTo,
  onJumpComplete,
  showConservation,
  showTracks
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const horizontalScrollRef = useRef<HTMLDivElement>(null);
  const minimapRef = useRef<SVGSVGElement>(null);
  const minimapWrapperRef = useRef<HTMLDivElement>(null);

  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [listHeight, setListHeight] = useState(0);
  const [scrollX, setScrollX] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(1); // px per bp
  const [dragSelection, setDragSelection] = useState<SelectionArea | null>(null);
  const [dragCursorPos, setDragCursorPos] = useState<{ x: number, y: number } | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number, y: number, content: string } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, recordId: string, feature?: BioFeature } | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number, bp: number } | null>(null);

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
  const [gotoPos, setGotoPos] = useState<string>('');
  const listRef = useRef<VariableSizeList>(null);
  const brushRef = useRef<any>(null);
  const isBrushing = useRef(false);
  const minimapContainerRef = useRef<HTMLDivElement>(null);

  const minimapCanvasRef = useRef<HTMLCanvasElement>(null);

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

  const chartWidth = useMemo(() => alignmentLength * zoomLevel, [alignmentLength, zoomLevel]);
  const SIDEBAR_WIDTH = 120;
  const viewportWidth = useMemo(() => Math.max(0, dimensions.width - SIDEBAR_WIDTH), [dimensions.width]);

  const fitZoom = useMemo(() => {
    if (alignmentLength > 0 && viewportWidth > 0) {
      return (viewportWidth - 40) / alignmentLength;
    }
    return 0.001;
  }, [alignmentLength, viewportWidth]);

  const handleZoom = useCallback((delta: number, mouseBp?: number) => {
    setZoomLevel(prev => {
      const factor = delta > 0 ? 1.2 : 1 / 1.2;
      const next = prev * factor;
      const clamped = Math.min(150, Math.max(fitZoom, next));
      
      // If mouseBp is provided, adjust scroll to keep it centered
      if (mouseBp !== undefined && horizontalScrollRef.current) {
        const actualFactor = clamped / prev;
        const currentScroll = horizontalScrollRef.current.scrollLeft;
        const mouseX = mouseBp * prev - currentScroll;
        const newScroll = mouseBp * clamped - mouseX;
        
        // We can't set scrollLeft directly here because it might trigger a render loop
        // if not careful, but since it's a ref it's usually fine.
        // However, it's better to do it in a useEffect or after state update.
        setTimeout(() => {
          if (horizontalScrollRef.current) {
            horizontalScrollRef.current.scrollLeft = newScroll;
          }
        }, 0);
      }
      
      return clamped;
    });
  }, [fitZoom]);

  const handleCenterOnSelection = useCallback(() => {
    if (activeSelection && horizontalScrollRef.current && viewportWidth > 0) {
      const targetX = activeSelection.start * zoomLevel - (viewportWidth / 2);
      horizontalScrollRef.current.scrollTo({
        left: Math.max(0, targetX),
        behavior: 'smooth'
      });
    }
  }, [activeSelection, zoomLevel, viewportWidth]);

  const handleFit = useCallback(() => {
    setZoomLevel(fitZoom);
  }, [fitZoom]);

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

  const handleGoto = useCallback((pos: number) => {
    if (isNaN(pos) || pos < 0 || pos > alignmentLength) return;
    if (horizontalScrollRef.current) {
      const targetX = pos * zoomLevel - (viewportWidth / 2);
      horizontalScrollRef.current.scrollTo({
        left: Math.max(0, targetX),
        behavior: 'smooth'
      });
    }
  }, [zoomLevel, viewportWidth, alignmentLength]);

  useEffect(() => {
    if (jumpTo !== null && jumpTo !== undefined) {
      handleGoto(jumpTo);
      onJumpComplete?.();
    }
  }, [jumpTo, handleGoto, onJumpComplete]);

  const handleZoomToSelection = useCallback(() => {
    if (activeSelection && viewportWidth > 0) {
      let length: number;
      if (activeSelection.start <= activeSelection.end) {
        length = activeSelection.end - activeSelection.start;
      } else {
        // Wrap around case
        length = (alignmentLength - activeSelection.start) + activeSelection.end;
      }
      
      const targetZoom = (viewportWidth - 120) / Math.max(1, length);
      setZoomLevel(Math.min(150, Math.max(fitZoom, targetZoom)));
    }
  }, [activeSelection, viewportWidth, fitZoom, alignmentLength]);

  // Sync internal selection with prop
  const persistentSelection = activeSelection;
  const setPersistentSelection = onSelectionChange;

  // Handle Auto-Scroll to selection (separate to handle zoom changes)
  useEffect(() => {
    if (activeSelection && horizontalScrollRef.current) {
      // 1. Horizontal Scroll
      const targetX = activeSelection.start * zoomLevel - 60; // Small offset
      horizontalScrollRef.current.scrollTo({
        left: Math.max(0, targetX),
        behavior: 'smooth'
      });

      // 2. Vertical Scroll (to the record containing the match)
      if (listRef.current && activeSelection.recordIds.length > 0) {
        const targetRecordId = activeSelection.recordIds[0];
        const recordIndex = records.findIndex(r => r.id === targetRecordId);
        if (recordIndex !== -1) {
          listRef.current.scrollToItem(recordIndex, 'smart');
        }
      }
    }
  }, [activeSelection, zoomLevel, records]);

  // Layout Constants
  const RIGHT_SPACER = 250;
  const OVERVIEW_HEIGHT = 65;
  const SCROLLBAR_HEIGHT = 16;

  const listContainerRef = useRef<HTMLDivElement>(null);

  // Handle Container Resize
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight
        });
      }
      if (listContainerRef.current) {
        setListHeight(listContainerRef.current.clientHeight);
      }
    };
    handleResize();
    const observer = new ResizeObserver(handleResize);
    if (containerRef.current) observer.observe(containerRef.current);
    if (listContainerRef.current) observer.observe(listContainerRef.current);
    return () => observer.disconnect();
  }, []);

  const recordLayouts = useMemo(() => {
    return records.map(record => {
      // 1. Feature Packing (Annotations)
      const rows: { start: number, end: number }[][] = [];
      const sortedFeatures = [...record.features].sort((a, b) => a.start - b.start);
      
      const placements = sortedFeatures.map(feat => {
        const genomeLength = record.sequence.length;
        const featIntervals = feat.start > feat.end 
          ? [{ start: feat.start, end: genomeLength }, { start: 0, end: feat.end }]
          : [{ start: feat.start, end: feat.end }];
        
        let rowIdx = 0;
        const buffer = 10;
        
        while (rowIdx < rows.length) {
          const row = rows[rowIdx];
          const hasOverlap = row.some(interval => 
            featIntervals.some(fi => 
              fi.start < interval.end + buffer && interval.start < fi.end + buffer
            )
          );
          if (!hasOverlap) break;
          rowIdx++;
        }
        
        if (rowIdx === rows.length) {
          rows.push([]);
        }
        
        rows[rowIdx].push(...featIntervals);
        return { feature: feat, row: rowIdx };
      });

      const featRowsCount = showAnnotations ? rows.length : 0;
      const annotHeight = featRowsCount * (ANNOT_ROW_HEIGHT + 6);
      
      // 2. Track Packing & Height Calculation
      const tracks = record.tracks || [];
      const trackSpacing = 12;
      let totalQuantHeight = 0;
      
      const trackLayouts = tracks.map(track => {
        let height = 80; // Default height for line tracks
        let packedRows: any[][] = [];
        
        if (track.kind === 'interval') {
          // Pack intervals to determine required height
          const sortedData = [...track.data].sort((a, b) => a.start - b.start);
          sortedData.forEach(interval => {
            let placed = false;
            for (let i = 0; i < packedRows.length; i++) {
              const lastInRow = packedRows[i][packedRows[i].length - 1];
              if (interval.start >= lastInRow.end + 1) {
                packedRows[i].push(interval);
                placed = true;
                break;
              }
            }
            if (!placed) {
              packedRows.push([interval]);
            }
          });
          
          // Calculate height based on rows (min 12px per row + padding)
          const rowHeight = 16;
          height = Math.max(80, packedRows.length * rowHeight + 10);
        }
        
        const top = totalQuantHeight;
        if (showTracks) {
          totalQuantHeight += height + trackSpacing;
        }
        
        return { ...track, height, top, packedRows };
      });

      const quantHeight = showTracks ? totalQuantHeight : 0;
      const topPadding = (featRowsCount > 0 || quantHeight > 0) ? 24 : 0;
      const seqBaseY = annotHeight + quantHeight + topPadding + (showTranslation ? AA_ROW_HEIGHT * 3 : 0);
      const height = seqBaseY + (showTranslation ? AA_ROW_HEIGHT * 3 : 0) + NT_ROW_HEIGHT + 20;

      return { 
        id: record.id, 
        record, 
        placements, 
        annotHeight,
        quantHeight,
        topPadding,
        height,
        seqBaseY,
        trackLayouts
      };
    });
  }, [records, showAnnotations, showTranslation, showTracks]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.resetAfterIndex(0);
    }
  }, [recordLayouts]);

  // Minimap Static Parts (Ruler, Sequence, Brush Init)
  useEffect(() => {
    if (!minimapRef.current || !minimapWrapperRef.current || alignmentLength === 0) return;

    const width = minimapWrapperRef.current.clientWidth - 8;
    const height = 45;
    
    // Canvas Rendering for heavy elements
    const canvas = minimapCanvasRef.current;
    if (canvas) {
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, width, height);
        const miniX = d3.scaleLinear().domain([0, alignmentLength]).range([0, width]);
        const step = Math.max(1, Math.floor(alignmentLength / 1000));

        // Background track
        ctx.fillStyle = '#f1f5f9';
        ctx.beginPath();
        ctx.roundRect(0, 2, width, 20, 2);
        ctx.fill();

        // Feature density / markers (Optimized for large datasets)
        const density = new Float32Array(width);
        const featureColorsMap: Record<number, string> = {};
        
        records.forEach(r => {
          r.features.forEach(f => {
            const x0 = Math.floor(miniX(f.start));
            const x1 = Math.ceil(miniX(f.end));
            for (let x = Math.max(0, x0); x <= Math.min(width - 1, x1); x++) {
              density[x] += 0.1;
              if (!featureColorsMap[x]) featureColorsMap[x] = f.color || getFeatureColor(f.type, customColors);
            }
          });
        });

        for (let x = 0; x < width; x++) {
          if (density[x] > 0) {
            ctx.fillStyle = featureColorsMap[x] || '#94a3b8';
            ctx.globalAlpha = Math.min(1, density[x]);
            ctx.fillRect(x, 2, 1, 20);
          }
        }
        ctx.globalAlpha = 1.0;

        // Conservation line
        if (consensus) {
          ctx.strokeStyle = '#3b82f6';
          ctx.lineWidth = 1;
          ctx.globalAlpha = 0.5;
          ctx.beginPath();
          for (let i = 0; i < alignmentLength; i += step) {
            let matchCount = 0;
            const base = consensus[i];
            if (base && base !== '-') {
              records.forEach(r => {
                const s = r.alignedSequence || r.sequence;
                if (s[i] === base) matchCount++;
              });
            }
            const y = 22 - ((matchCount / Math.max(1, records.length)) * 18);
            if (i === 0) ctx.moveTo(miniX(i), y);
            else ctx.lineTo(miniX(i), y);
          }
          ctx.stroke();
        }
        ctx.globalAlpha = 1.0;

        // Search Results in Minimap
        if (searchResults && searchResults.length > 0) {
          searchResults.forEach((r, idx) => {
            const isActive = idx === currentSearchIdx;
            const x = miniX(r.start);
            const w = Math.max(1.5, miniX(r.end) - x);
            ctx.fillStyle = r.strand === 1 ? (isActive ? '#f59e0b' : '#fbbf24') : (isActive ? '#db2777' : '#f472b6');
            ctx.globalAlpha = isActive ? 1.0 : 0.7;
            ctx.fillRect(x, 0, w, 2); // Top stripe
            ctx.fillRect(x, 20, w, 2); // Bottom stripe
            if (isActive) {
              ctx.globalAlpha = 0.4;
              ctx.fillRect(x, 2, w, 18); // Highlight active region
            }
          });
          ctx.globalAlpha = 1.0;
        }

        // Sequence preview (dots)
        for (let i = 0; i < alignmentLength; i += step * 2) {
          const char = consensus[i];
          if (char && char !== '-') {
            ctx.fillStyle = getNucleotideColor(char);
            ctx.globalAlpha = 0.3;
            ctx.fillRect(miniX(i), 2, Math.max(1, width / 500), 20);
          }
        }
        ctx.globalAlpha = 1.0;
      }
    }

    const miniSvg = d3.select(minimapRef.current).attr('width', width).attr('height', height);
    miniSvg.selectAll('*').remove(); 

    const miniX = d3.scaleLinear().domain([0, alignmentLength]).range([0, width]);
    
    // Ruler background (SVG for crisp text)
    miniSvg.append('rect')
      .attr('width', width)
      .attr('height', 18)
      .attr('y', 22)
      .attr('fill', '#f8fafc')
      .attr('opacity', 0.8);

    // Ticks (Explicit Ruler)
    const axis = d3.axisBottom(miniX).ticks(Math.max(2, Math.floor(width / 80))).tickFormat(d => d.toLocaleString());
    miniSvg.append('g')
      .attr('transform', 'translate(0, 24)')
      .call(axis)
      .selectAll('text')
      .attr('fill', '#475569')
      .style('font-size', '9px')
      .style('font-weight', '900');
    
    miniSvg.selectAll('.domain').attr('stroke', '#94a3b8').attr('stroke-width', 1.5);
    miniSvg.selectAll('.tick line').attr('stroke', '#94a3b8');

    // Brush Implementation
    const brush = d3.brushX()
      .extent([[0, 0], [width, height]])
      .on('start', (event) => {
        if (event.sourceEvent) isBrushing.current = true;
      })
      .on('brush', (event) => {
        if (!event.sourceEvent) return; // Programmatic
        const selection = event.selection;
        if (selection) {
          const inverted = (selection as [number, number]).map(d => miniX.invert(d));
          const x0 = inverted[0] as number;
          const x1 = inverted[1] as number;
          const range = x1 - x0;
          if (range > 0) {
            const newZoom = viewportWidth / range;
            const targetZoom = Math.min(150, Math.max(fitZoom, newZoom));
            const newScroll = x0 * targetZoom;
            
            setZoomLevel(targetZoom);
            if (horizontalScrollRef.current) {
              horizontalScrollRef.current.scrollLeft = newScroll;
            }
          }
        }
      })
      .on('end', (event) => {
        if (event.sourceEvent) isBrushing.current = false;
      });

    brushRef.current = brush;
    miniSvg.append('g')
      .attr('class', 'brush')
      .call(brush);

    // Remove old click handler as brush handles it now
  }, [alignmentLength, dimensions.width, consensus, records, viewportWidth]);

  // Minimap Dynamic Indicator (Sync Brush with Main Viewport)
  useEffect(() => {
    if (!minimapRef.current || !minimapWrapperRef.current || !brushRef.current || alignmentLength === 0 || isBrushing.current) return;

    const width = minimapWrapperRef.current.clientWidth - 8;
    const miniX = d3.scaleLinear().domain([0, alignmentLength]).range([0, width]);
    const brushG = d3.select(minimapRef.current).select('.brush');
    
    const bX0 = Math.max(0, Math.min(width, miniX(scrollX / zoomLevel)));
    const bX1 = Math.max(0, Math.min(width, miniX((scrollX + viewportWidth) / zoomLevel)));
    
    brushG.transition().duration(150).ease(d3.easeCubicOut).call(brushRef.current.move, [bX0, bX1]);

  }, [scrollX, zoomLevel, viewportWidth, alignmentLength, dimensions.width]);

  const handleHorizontalScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollX(e.currentTarget.scrollLeft);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - SIDEBAR_WIDTH;
    if (x < 0) {
      setMousePos(null);
      return;
    }
    const bp = Math.floor(xScaleGlobal.invert(x + scrollX));
    setMousePos({ x: x + SIDEBAR_WIDTH, bp });
  };

  const handleMouseLeave = () => {
    setMousePos(null);
  };

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

  // Selection Overlay (Global)
  const renderSelectionOverlay = () => {
    const xScale = d3.scaleLinear().domain([0, alignmentLength]).range([0, chartWidth]);
    const elements: (React.ReactElement | null)[] = [];

    // Vertical Cursor Line
    if (mousePos) {
      elements.push(
        <div 
          key="cursor-line" 
          className="absolute top-0 w-px h-full bg-slate-400/30 pointer-events-none z-40"
          style={{ left: mousePos.x }}
        >
          <div className="absolute top-0 left-2 bg-slate-800 text-white text-[8px] font-mono px-1 rounded shadow-sm whitespace-nowrap">
            {(mousePos.bp + 1).toLocaleString()} bp
          </div>
        </div>
      );
    }
    
    if (persistentSelection && persistentSelection.recordIds.length === records.length) {
      const s = xScale(persistentSelection.start) - scrollX;
      const e = xScale(persistentSelection.end) - scrollX;
      const isWrap = persistentSelection.start > persistentSelection.end;

      const renderHandle = (pos: number, type: 'start' | 'end') => {
        const x = xScale(pos) - scrollX + SIDEBAR_WIDTH;
        if (x < SIDEBAR_WIDTH || x > dimensions.width) return null;
        return (
          <div 
            key={`handle-${type}`}
            className="absolute top-0 w-3 h-full -ml-1.5 cursor-ew-resize z-50 group"
            style={{ left: x }}
            onMouseDown={(e) => {
              e.stopPropagation();
              const startX = e.clientX;
              const initialPos = pos;
              
              const onMouseMove = (moveEvent: MouseEvent) => {
                const dx = moveEvent.clientX - startX;
                const bpDelta = Math.round(dx / zoomLevel);
                const newPos = Math.max(0, Math.min(alignmentLength, initialPos + bpDelta));
                onSelectionChange({ ...persistentSelection, [type]: newPos });
              };
              
              const onMouseUp = () => {
                window.removeEventListener('mousemove', onMouseMove);
                window.removeEventListener('mouseup', onMouseUp);
              };
              
              window.addEventListener('mousemove', onMouseMove);
              window.addEventListener('mouseup', onMouseUp);
            }}
          >
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-8 bg-sky-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"></div>
          </div>
        );
      };

      if (!isWrap) {
        elements.push(
          <div key="persistent" className="absolute top-0 pointer-events-none border-x-2 border-sky-400 border-dashed bg-sky-400/5 z-20 shadow-[0_0_15px_rgba(56,189,248,0.1)] animate-selection-pulse" style={{ left: s + SIDEBAR_WIDTH, width: Math.max(2, e - s), height: '100%' }}>
             <div className="absolute top-0 left-0 right-0 h-1 bg-sky-400/50"></div>
             <div className="absolute bottom-0 left-0 right-0 h-1 bg-sky-400/50"></div>
          </div>
        );
        elements.push(renderHandle(persistentSelection.start, 'start'));
        elements.push(renderHandle(persistentSelection.end, 'end'));
      } else {
        // Wrap around case
        const s1 = xScale(persistentSelection.start) - scrollX;
        const e1 = xScale(alignmentLength) - scrollX;
        const s2 = xScale(0) - scrollX;
        const e2 = xScale(persistentSelection.end) - scrollX;
        
        elements.push(
          <React.Fragment key="persistent-wrap">
            <div className="absolute top-0 pointer-events-none border-l-2 border-sky-400 border-dashed bg-sky-400/5 z-20" style={{ left: s1 + SIDEBAR_WIDTH, width: Math.max(0, e1 - s1), height: '100%' }}>
              <div className="absolute top-0 left-0 right-0 h-1 bg-sky-400/50"></div>
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-sky-400/50"></div>
            </div>
            <div className="absolute top-0 pointer-events-none border-r-2 border-sky-400 border-dashed bg-sky-400/5 z-20" style={{ left: s2 + SIDEBAR_WIDTH, width: Math.max(0, e2 - s2), height: '100%' }}>
              <div className="absolute top-0 left-0 right-0 h-1 bg-sky-400/50"></div>
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-sky-400/50"></div>
            </div>
          </React.Fragment>
        );
        elements.push(renderHandle(persistentSelection.start, 'start'));
        elements.push(renderHandle(persistentSelection.end, 'end'));
      }
    }

    if (dragSelection) {
      const isCircular = dragSelection.start > dragSelection.end;
      const s = xScale(isCircular ? dragSelection.end : dragSelection.start) - scrollX;
      const e = xScale(isCircular ? dragSelection.start : dragSelection.end) - scrollX;
      
      // For drag selection, we usually just show the linear range being dragged
      // unless we want to support circular dragging which is more complex.
      // For now, let's just ensure it renders correctly.
      const left = xScale(Math.min(dragSelection.start, dragSelection.end)) - scrollX;
      const width = Math.max(2, xScale(Math.max(dragSelection.start, dragSelection.end)) - xScale(Math.min(dragSelection.start, dragSelection.end)));

      elements.push(
        <React.Fragment key="drag-group">
          <div key="drag" className="absolute top-0 pointer-events-none border-x-2 border-emerald-400 bg-emerald-400/15 z-20" style={{ left: left + SIDEBAR_WIDTH, width, height: '100%' }} />
          {dragCursorPos && (
            <div 
              className="fixed pointer-events-none z-[110] bg-emerald-600 text-white text-[9px] font-black px-3 py-1.5 rounded-lg shadow-xl border border-emerald-400/50 animate-in fade-in zoom-in-95 duration-100"
              style={{ left: dragCursorPos.x + 15, top: dragCursorPos.y - 40 }}
            >
              <div className="flex items-center gap-2">
                <i className="fas fa-arrows-left-right text-[8px] opacity-70"></i>
                <span>{Math.min(dragSelection.start, dragSelection.end).toLocaleString()}</span>
                <span className="opacity-50">→</span>
                <span>{Math.max(dragSelection.start, dragSelection.end).toLocaleString()}</span>
                <span className="ml-1 opacity-70">({Math.abs(dragSelection.end - dragSelection.start).toLocaleString()} bp)</span>
              </div>
            </div>
          )}
        </React.Fragment>
      );
    }

    return elements;
  };

  // Handle Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onSelectionChange(null);
      }
      
      // Don't trigger shortcuts if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const scrollSpeed = 100;
      if (e.key === 'ArrowRight') {
        if (horizontalScrollRef.current) horizontalScrollRef.current.scrollLeft += scrollSpeed;
      } else if (e.key === 'ArrowLeft') {
        if (horizontalScrollRef.current) horizontalScrollRef.current.scrollLeft -= scrollSpeed;
      } else if (e.key === 'ArrowUp') {
        if (listRef.current) {
          const currentScroll = (listRef.current as any)._outerRef.scrollTop;
          listRef.current.scrollTo(currentScroll - 50);
        }
      } else if (e.key === 'ArrowDown') {
        if (listRef.current) {
          const currentScroll = (listRef.current as any)._outerRef.scrollTop;
          listRef.current.scrollTo(currentScroll + 50);
        }
      } else if (e.key === 'PageUp') {
        if (listRef.current) {
          const currentScroll = (listRef.current as any)._outerRef.scrollTop;
          listRef.current.scrollTo(currentScroll - listHeight);
        }
      } else if (e.key === 'PageDown') {
        if (listRef.current) {
          const currentScroll = (listRef.current as any)._outerRef.scrollTop;
          listRef.current.scrollTo(currentScroll + listHeight);
        }
      } else if (e.key === 'Home') {
        if (horizontalScrollRef.current) horizontalScrollRef.current.scrollLeft = 0;
      } else if (e.key === 'End') {
        if (horizontalScrollRef.current) horizontalScrollRef.current.scrollLeft = chartWidth;
      } else if (e.key === '+' || e.key === '=') {
        handleZoom(1);
      } else if (e.key === '-' || e.key === '_') {
        handleZoom(-1);
      } else if (e.key === 'f') {
        handleFit();
      } else if (e.key === 'c') {
        handleCenterOnSelection();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onSelectionChange, handleZoom, handleFit, handleCenterOnSelection]);

  const handleMouseDown = (e: React.MouseEvent) => {
    const xScale = d3.scaleLinear().domain([0, alignmentLength]).range([0, chartWidth]);
    const rect = e.currentTarget.getBoundingClientRect();
    
    const getPosFromEvent = (ev: MouseEvent | React.MouseEvent) => {
      const x = ev.clientX - rect.left + horizontalScrollRef.current!.scrollLeft - SIDEBAR_WIDTH;
      return Math.max(0, Math.min(alignmentLength, Math.floor(xScale.invert(x))));
    };

    if (dragMode === 'pan') {
      const startX = e.clientX;
      const startScrollLeft = horizontalScrollRef.current!.scrollLeft;
      const startY = e.clientY;
      const startScrollTop = listRef.current ? (listRef.current as any)._outerRef.scrollTop : 0;

      const onMouseMove = (moveEvent: MouseEvent) => {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        if (horizontalScrollRef.current) {
          horizontalScrollRef.current.scrollLeft = startScrollLeft - dx;
        }
        if (listRef.current) {
          listRef.current.scrollTo(startScrollTop - dy);
        }
      };

      const onMouseUp = () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
      return;
    }

    if (dragMode !== 'select') return;
    
    const clickedPos = getPosFromEvent(e);

    if (e.shiftKey && activeSelection) {
      // Extend selection
      const newStart = activeSelection.start;
      onSelectionChange({ ...activeSelection, start: newStart, end: clickedPos });
      return;
    }

    setDragSelection({ start: clickedPos, end: clickedPos, recordIds: records.map(r => r.id) });
    setDragCursorPos({ x: e.clientX, y: e.clientY });

    let animationFrameId: number;
    const onMouseMove = (moveEvent: MouseEvent) => {
      const moveBase = getPosFromEvent(moveEvent);
      setDragSelection(prev => prev ? { ...prev, end: moveBase } : null);
      setDragCursorPos({ x: moveEvent.clientX, y: moveEvent.clientY });

      // Auto-scroll logic
      const threshold = 50;
      const scrollSpeed = 15;
      const leftDist = moveEvent.clientX - rect.left - SIDEBAR_WIDTH;
      const rightDist = rect.right - moveEvent.clientX;

      cancelAnimationFrame(animationFrameId);
      const scroll = () => {
        if (leftDist < threshold && horizontalScrollRef.current!.scrollLeft > 0) {
          horizontalScrollRef.current!.scrollLeft -= scrollSpeed;
          animationFrameId = requestAnimationFrame(scroll);
        } else if (rightDist < threshold) {
          horizontalScrollRef.current!.scrollLeft += scrollSpeed;
          animationFrameId = requestAnimationFrame(scroll);
        }
      };
      animationFrameId = requestAnimationFrame(scroll);
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      cancelAnimationFrame(animationFrameId);
      setDragCursorPos(null);
      
      setDragSelection(prev => {
        if (prev && Math.abs(prev.end - prev.start) > 0) {
          // Move side effect out of functional update
          setTimeout(() => onSelectionChange(prev), 0);
        }
        return null;
      });
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const x = e.clientX - rect.left - SIDEBAR_WIDTH;
        const bp = xScaleGlobal.invert(x + scrollX);
        handleZoom(-e.deltaY, bp);
      } else if (e.shiftKey) {
        e.preventDefault();
        setScrollX(prev => Math.max(0, prev + e.deltaY));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomLevel, handleZoom]);

  const xScaleGlobal = d3.scaleLinear().domain([0, alignmentLength]).range([0, chartWidth]);

  return (
    <div ref={containerRef} className="flex-1 flex flex-col bg-white overflow-hidden relative border-t border-slate-200 min-h-0 min-w-0">
      
      {/* 1. COMPACT TOOLBAR & GLOBAL OVERVIEW */}
      <div ref={minimapContainerRef} className="h-[48px] flex-none bg-slate-50 border-b border-slate-200 px-3 flex items-center gap-3 z-20 min-w-0 shadow-sm">
        
        {/* MINIMAP SECTION */}
        <div className="flex-1 flex flex-col justify-center min-w-0">
          <div ref={minimapWrapperRef} className="relative bg-white rounded-md border border-slate-200 shadow-inner p-0.5 h-[45px] overflow-hidden">
            <canvas ref={minimapCanvasRef} className="absolute inset-0 pointer-events-none" />
            <svg ref={minimapRef} className="absolute inset-0 cursor-crosshair w-full h-full" />
            <div className="absolute top-0 right-1 pointer-events-none z-10">
               <span className="text-[7px] font-mono text-slate-300 italic">1:{Math.round(alignmentLength / (dimensions.width || 1))}</span>
            </div>
          </div>
        </div>

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
        {renderSelectionOverlay()}

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
                {contextMenu.feature ? contextMenu.feature.name : contextMenu.recordId}
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
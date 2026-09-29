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

import * as d3 from 'd3';
import React, { useEffect, useRef } from 'react';
import type { SeqRecord, SearchResult } from '@/src/domain/bio/types';
import { getFeatureColor, getNucleotideColor } from '@/src/app/viewer/colors';

export interface MinimapProps {
  records: SeqRecord[];
  consensus: string;
  alignmentLength: number;
  containerWidth: number;
  viewportWidth: number;
  scrollX: number;
  zoomLevel: number;
  fitZoom: number;
  searchResults: SearchResult[];
  currentSearchIdx: number;
  customColors?: Record<string, string>;
  horizontalScrollRef: React.RefObject<HTMLDivElement | null>;
  onZoomChange: (zoom: number) => void;
}

export const Minimap: React.FC<MinimapProps> = ({
  records,
  consensus,
  alignmentLength,
  containerWidth,
  viewportWidth,
  scrollX,
  zoomLevel,
  fitZoom,
  searchResults,
  currentSearchIdx,
  customColors,
  horizontalScrollRef,
  onZoomChange,
}) => {
  const minimapRef = useRef<SVGSVGElement>(null);
  const minimapWrapperRef = useRef<HTMLDivElement>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement>(null);
  const brushRef = useRef<any>(null);
  const isBrushing = useRef(false);

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
        ctx.fillStyle = '#0d1424';
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
      .attr('fill', '#0f1a2e')
      .attr('opacity', 0.8);

    // Ticks (Explicit Ruler)
    const axis = d3.axisBottom(miniX).ticks(Math.max(2, Math.floor(width / 80))).tickFormat(d => d.toLocaleString());
    miniSvg.append('g')
      .attr('transform', 'translate(0, 24)')
      .call(axis)
      .selectAll('text')
      .attr('fill', '#8093b6')
      .style('font-size', '8px')
      .style('font-weight', '500')
      .style('letter-spacing', '0.06em');

    miniSvg.selectAll('.domain').attr('stroke', 'rgba(148,163,184,0.4)').attr('stroke-width', 1.5);
    miniSvg.selectAll('.tick line').attr('stroke', 'rgba(148,163,184,0.3)');

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
            
            onZoomChange(targetZoom);
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
  }, [alignmentLength, containerWidth, consensus, records, viewportWidth]);

  // Minimap Dynamic Indicator (Sync Brush with Main Viewport)
  useEffect(() => {
    if (!minimapRef.current || !minimapWrapperRef.current || !brushRef.current || alignmentLength === 0 || isBrushing.current) return;

    const width = minimapWrapperRef.current.clientWidth - 8;
    const miniX = d3.scaleLinear().domain([0, alignmentLength]).range([0, width]);
    const brushG = d3.select(minimapRef.current).select('.brush');
    
    const bX0 = Math.max(0, Math.min(width, miniX(scrollX / zoomLevel)));
    const bX1 = Math.max(0, Math.min(width, miniX((scrollX + viewportWidth) / zoomLevel)));
    
    brushG.transition().duration(150).ease(d3.easeCubicOut).call(brushRef.current.move, [bX0, bX1]);

  }, [scrollX, zoomLevel, viewportWidth, alignmentLength, containerWidth]);

  return (
    <div className="flex-1 flex flex-col justify-center min-w-0">
      <div ref={minimapWrapperRef} className="relative bg-[#12203c] rounded-md border border-black/20 p-0.5 h-[45px] overflow-hidden shadow-[inset_0_1px_2px_rgba(0,0,0,0.45)]">
        <canvas ref={minimapCanvasRef} className="absolute inset-0 pointer-events-none" />
        <svg ref={minimapRef} className="absolute inset-0 cursor-crosshair w-full h-full" />
        <div className="absolute top-0 right-1 pointer-events-none z-10">
          <span className="text-[7px] font-mono text-slate-500 italic">1:{Math.round(alignmentLength / (containerWidth || 1))}</span>
        </div>
      </div>
    </div>
  );
};

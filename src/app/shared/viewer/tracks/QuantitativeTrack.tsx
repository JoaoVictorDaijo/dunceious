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
import React, { memo, useEffect, useMemo, useRef } from 'react';
import type { TrackDatum } from '../layout';

export const TRACK_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

export const QuantitativeTrack: React.FC<{
  data: { start: number; end: number; value: number }[];
  viewportWidth: number;
  height: number;
  xScale: d3.ScaleLinear<number, number>;
  scrollX: number;
  minVal: number;
  maxVal: number;
  color?: string;
  kind?: 'line' | 'interval';
  packedRows?: TrackDatum[][];
}> = memo(({ data, viewportWidth, height, xScale, scrollX, minVal, maxVal, color = '#6366f1', kind = 'line', packedRows: externalPackedRows }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const packedRows = useMemo(() => {
    if (kind !== 'interval') return [];
    if (externalPackedRows) return externalPackedRows;
    const rows: TrackDatum[][] = [];
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

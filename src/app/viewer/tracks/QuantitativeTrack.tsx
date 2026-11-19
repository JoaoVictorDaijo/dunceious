/*
 * Dunceious
 * Copyright (C) 2026 João Victor Daijo and Murilo Cassiano
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
import React, { memo, useEffect, useRef } from 'react';
import type { DisplayTrack } from '@/src/domain/bio/types';
import { packTrackRows } from '@/src/domain/bio/quantitativeTracks';
import { trackGeometry } from './trackGeometry';

export const TRACK_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

export const QuantitativeTrack: React.FC<{
  display: DisplayTrack;
  viewportWidth: number;
  height: number;
  xScale: d3.ScaleLinear<number, number>;
  scrollX: number;
  minVal: number;
  maxVal: number;
  color?: string;
  kind?: 'line' | 'interval';
  packedRows?: number[][];
  highlighted?: number[];
}> = memo(({ display, viewportWidth, height, xScale, scrollX, minVal, maxVal, color = '#6366f1', kind = 'line', packedRows, highlighted = [] }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = viewportWidth * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, viewportWidth, height);
    const getY = (value: number) => height - (value - minVal) / Math.max(0.00001, maxVal - minVal) * (height - 10) - 5;
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= 4; i++) {
      const y = 5 + i * (height - 10) / 4;
      ctx.moveTo(0, y); ctx.lineTo(viewportWidth, y);
    }
    ctx.stroke();
    if (minVal < 0 && maxVal > 0) {
      ctx.strokeStyle = '#e2e8f0';
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(0, getY(0)); ctx.lineTo(viewportWidth, getY(0)); ctx.stroke();
      ctx.setLineDash([]);
    }
    if (!display.track.data.length) {
      ctx.fillStyle = '#94a3b8'; ctx.font = 'italic 8px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('No track data available', viewportWidth / 2, height / 2 + 4);
      return;
    }
    const geometry = trackGeometry(display, x => xScale(x) - scrollX, [xScale.invert(scrollX), xScale.invert(scrollX + viewportWidth)]);
    const rows = kind === 'interval' ? packedRows ?? packTrackRows(display) : [];
    const lanes = new Map<number, number>();
    rows.forEach((row, lane) => row.forEach(index => lanes.set(index, lane)));
    const colors = d3.scaleSequential(d3.interpolateViridis).domain([minVal, maxVal]);
    ctx.save();
    ctx.beginPath();
    for (const mask of geometry.mask) ctx.rect(mask.x, 0, mask.width, height);
    ctx.clip();
    for (const shape of geometry.shapes) {
      ctx.save();
      ctx.beginPath(); ctx.rect(shape.x, 0, shape.width, height); ctx.clip();
      const y = kind === 'line' ? getY(shape.value) : 5 + (lanes.get(shape.index) ?? 0) * 16;
      const bottom = kind === 'line' ? getY(0) : y + 14;
      ctx.fillStyle = kind === 'line' ? `${color}15` : colors(shape.value);
      ctx.beginPath();
      // Square ends preserve narrow support without expanding every interval across every run.
      ctx.rect(shape.x, Math.min(y, bottom), shape.width, Math.abs(bottom - y));
      ctx.fill();
      if (kind === 'line') {
        ctx.lineCap = 'butt'; ctx.lineWidth = 2.5; ctx.strokeStyle = color;
        ctx.beginPath(); ctx.moveTo(shape.x, y); ctx.lineTo(shape.x + shape.width, y); ctx.stroke();
      }
      if (highlighted.includes(shape.index)) {
        ctx.strokeStyle = color; ctx.lineWidth = 1;
        for (const mask of geometry.mask) {
          const start = Math.max(shape.x, mask.x);
          const end = Math.min(shape.x + shape.width, mask.x + mask.width);
          if (end <= start) continue;
          ctx.strokeRect(start + Math.min(0.5, (end - start) / 2), Math.min(y, bottom) + 0.5, Math.max(0, end - start - 1), Math.max(0, Math.abs(bottom - y) - 1));
        }
      }
      if (kind === 'interval' && shape.width > 30) {
        const fill = colors(shape.value);
        ctx.fillStyle = d3.hsl(fill).l > 0.6 ? '#000' : '#fff';
        ctx.font = '7px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(shape.value.toFixed(1), shape.x + shape.width / 2, y + 10);
      }
      ctx.restore();
    }
    ctx.restore();
  }, [display, viewportWidth, height, xScale, scrollX, minVal, maxVal, color, kind, packedRows, highlighted]);
  return <canvas ref={canvasRef} style={{ width: viewportWidth, height, position: 'absolute', top: 0, left: 0, display: 'block' }} />;
});

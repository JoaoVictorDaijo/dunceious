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
import React from 'react';
import type { SeqRecord, SelectionArea } from '@/src/domain/bio/types';
import { SIDEBAR_WIDTH } from './constants';

export interface SelectionOverlayProps {
  records: SeqRecord[];
  alignmentLength: number;
  chartWidth: number;
  scrollX: number;
  zoomLevel: number;
  containerWidth: number;
  mousePos: { x: number; bp: number } | null;
  persistentSelection: SelectionArea | null;
  dragSelection: SelectionArea | null;
  dragCursorPos: { x: number; y: number } | null;
  onSelectionChange: (s: SelectionArea | null) => void;
}

export const SelectionOverlay: React.FC<SelectionOverlayProps> = ({
  records,
  alignmentLength,
  chartWidth,
  scrollX,
  zoomLevel,
  containerWidth,
  mousePos,
  persistentSelection,
  dragSelection,
  dragCursorPos,
  onSelectionChange,
}) => {
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
        if (x < SIDEBAR_WIDTH || x > containerWidth) return null;
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

    return <>{elements}</>;
};

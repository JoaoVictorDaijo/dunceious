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
import React, { useState } from 'react';
import type { VariableSizeList } from 'react-window';
import type { SeqRecord, SelectionArea } from '@/src/domain/bio/types';
import { SIDEBAR_WIDTH } from './constants';

export interface UseSelectionDragParams {
  dragMode: 'pan' | 'select';
  activeSelection: SelectionArea | null;
  onSelectionChange: (s: SelectionArea | null) => void;
  records: SeqRecord[];
  alignmentLength: number;
  chartWidth: number;
  horizontalScrollRef: React.RefObject<HTMLDivElement | null>;
  listRef: React.RefObject<VariableSizeList | null>;
}

export function useSelectionDrag(p: UseSelectionDragParams) {
  const { dragMode, activeSelection, onSelectionChange, records, alignmentLength, chartWidth, horizontalScrollRef, listRef } = p;
  const [dragSelection, setDragSelection] = useState<SelectionArea | null>(null);
  const [dragCursorPos, setDragCursorPos] = useState<{ x: number, y: number } | null>(null);

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

  return { dragSelection, dragCursorPos, handleMouseDown };
}

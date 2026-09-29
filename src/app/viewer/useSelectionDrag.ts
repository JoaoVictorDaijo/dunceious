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
import React, { useEffect, useRef, useState } from 'react';
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

function startPan(e: React.MouseEvent, { horizontalScrollRef, listRef }: UseSelectionDragParams) {
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
  return onMouseUp;
}

export function useSelectionDrag(p: UseSelectionDragParams) {
  const { dragMode, activeSelection, onSelectionChange, records, alignmentLength, chartWidth, horizontalScrollRef } = p;
  const [dragSelection, setDragSelection] = useState<SelectionArea | null>(null);
  const [dragCursorPos, setDragCursorPos] = useState<{ x: number, y: number } | null>(null);

  const cancelDragRef = useRef<(() => void) | null>(null);

  useEffect(() => () => cancelDragRef.current?.(), []);

  const handleMouseDown = (e: React.MouseEvent) => {
    cancelDragRef.current?.();
    const xScale = d3.scaleLinear().domain([0, alignmentLength]).range([0, chartWidth]);
    const rect = e.currentTarget.getBoundingClientRect();
    
    const getPosFromEvent = (ev: MouseEvent | React.MouseEvent) => {
      const x = ev.clientX - rect.left + horizontalScrollRef.current!.scrollLeft - SIDEBAR_WIDTH;
      return Math.max(0, Math.min(alignmentLength, Math.floor(xScale.invert(x))));
    };

    if (dragMode === 'pan') {
      cancelDragRef.current = startPan(e, p);
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

    const recordIds = records.map(r => r.id);
    // Only a new drag is linear. Existing circular selections keep their
    // directed endpoints when edited through Shift or the overlay handles.
    const selectionAt = (ev: MouseEvent | React.MouseEvent): SelectionArea => {
      const pos = getPosFromEvent(ev);
      return { start: Math.min(clickedPos, pos), end: Math.max(clickedPos, pos), recordIds };
    };
    setDragSelection(selectionAt(e));
    setDragCursorPos({ x: e.clientX, y: e.clientY });

    let animationFrameId = 0;
    const onMouseMove = (moveEvent: MouseEvent) => {
      setDragSelection(selectionAt(moveEvent));
      setDragCursorPos({ x: moveEvent.clientX, y: moveEvent.clientY });

      const threshold = 50;
      const scrollSpeed = 15;
      const leftDist = moveEvent.clientX - rect.left - SIDEBAR_WIDTH;
      const rightDist = rect.right - moveEvent.clientX;

      cancelAnimationFrame(animationFrameId);
      const scroll = () => {
        const scroller = horizontalScrollRef.current;
        if (!scroller) return;
        const before = scroller.scrollLeft;
        if (leftDist < threshold && before > 0) {
          scroller.scrollLeft -= scrollSpeed;
        } else if (rightDist < threshold) {
          scroller.scrollLeft += scrollSpeed;
        }
        // The browser clamps scrollLeft at its bounds. Stop there, and keep
        // the endpoint under the stationary cursor after each actual scroll.
        if (scroller.scrollLeft !== before) {
          setDragSelection(selectionAt(moveEvent));
          animationFrameId = requestAnimationFrame(scroll);
        }
      };
      animationFrameId = requestAnimationFrame(scroll);
    };

    const cancelDrag = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      cancelAnimationFrame(animationFrameId);
      cancelDragRef.current = null;
      setDragCursorPos(null);
      setDragSelection(null);
    };
    const onMouseUp = (upEvent: MouseEvent) => {
      const selection = selectionAt(upEvent);
      cancelDrag();
      if (selection.start !== selection.end) onSelectionChange(selection);
    };

    cancelDragRef.current = cancelDrag;
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  return { dragSelection, dragCursorPos, handleMouseDown };
}

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
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { VariableSizeList } from 'react-window';
import type { SeqRecord, SelectionArea } from '@/src/domain/bio/types';
import { SIDEBAR_WIDTH } from './constants';

export interface UseViewportParams {
  records: SeqRecord[];
  alignmentLength: number;
  activeSelection: SelectionArea | null;
  onSelectionChange: (s: SelectionArea | null) => void;
  jumpTo?: number | null;
  onJumpComplete?: () => void;
}

export function useViewport(params: UseViewportParams) {
  const { records, alignmentLength, activeSelection, onSelectionChange, jumpTo, onJumpComplete } = params;

  const containerRef = useRef<HTMLDivElement>(null);
  const horizontalScrollRef = useRef<HTMLDivElement>(null);

  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [listHeight, setListHeight] = useState(0);
  const [scrollX, setScrollX] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(1); // px per bp

  const [mousePos, setMousePos] = useState<{ x: number, bp: number } | null>(null);

  const [gotoPos, setGotoPos] = useState<string>('');
  const listRef = useRef<VariableSizeList>(null);

  const chartWidth = useMemo(() => alignmentLength * zoomLevel, [alignmentLength, zoomLevel]);
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
        
        // Defer to a later task so React first commits the new zoom level: chartWidth
        // scales with zoomLevel, so the scroll container only reaches `newScroll` once
        // the wider content has rendered. Setting scrollLeft synchronously here would
        // clamp it to the old (smaller) width and lose the zoom-to-cursor anchor.
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

  return {
    containerRef, horizontalScrollRef, listRef, listContainerRef,
    dimensions, listHeight, scrollX, zoomLevel, gotoPos, setGotoPos, mousePos, setZoomLevel,
    viewportWidth, chartWidth, fitZoom, xScaleGlobal,
    handleZoom, handleFit, handleCenterOnSelection, handleGoto, handleZoomToSelection,
    handleHorizontalScroll, handleMouseMove, handleMouseLeave,
  };
}

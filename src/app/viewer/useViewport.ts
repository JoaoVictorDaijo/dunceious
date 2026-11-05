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
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { VariableSizeList } from 'react-window';
import type { SeqRecord, SelectionArea } from '@/src/domain/bio/types';
import type { FocusTarget } from '@/src/app/logic/focusTarget';
import { MAX_ZOOM, SIDEBAR_WIDTH } from './constants';
import { centeredScroll, pixelToColumn, selectionExtent } from './coordinates';
import { useFocusFlight } from './useFocusFlight';

export interface UseViewportParams {
  records: SeqRecord[];
  alignmentLength: number;
  activeSelection: SelectionArea | null;
  onSelectionChange: (s: SelectionArea | null) => void;
  jumpTo?: number | null;
  onJumpComplete?: () => void;
  /** Frame this region once; `onFocusComplete` fires when it has been handled. */
  focusRequest?: FocusTarget | null;
  onFocusComplete?: () => void;
}

export function useViewport(params: UseViewportParams) {
  const { records, alignmentLength, activeSelection, onSelectionChange, jumpTo, onJumpComplete, focusRequest, onFocusComplete } = params;

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
      return Math.min(MAX_ZOOM, Math.max(0.001, (viewportWidth - 40) / alignmentLength));
    }
    return 0.001;
  }, [alignmentLength, viewportWidth]);

  const pendingScroll = useRef<number | null>(null);
  const localSelection = useRef<SelectionArea | null>(null);

  const scrollTo = useCallback((left: number) => {
    const scroller = horizontalScrollRef.current;
    if (!scroller) return;
    scroller.scrollLeft = left; // Native clamping is the authority, including the right spacer.
    setScrollX(scroller.scrollLeft);
  }, []);

  const applyZoom = useCallback((zoom: number, left: number) => {
    const next = Math.min(MAX_ZOOM, Math.max(fitZoom, zoom));
    if (next === zoomLevel) {
      scrollTo(left);
    } else {
      pendingScroll.current = left;
      setZoomLevel(next);
    }
  }, [fitZoom, zoomLevel, scrollTo]);

  // The new content width must exist before assigning scrollLeft, or the browser
  // clamps against the old width. Keep the canvas and native scrollbar in sync.
  useLayoutEffect(() => {
    scrollTo(pendingScroll.current ?? horizontalScrollRef.current?.scrollLeft ?? 0);
    pendingScroll.current = null;
  }, [chartWidth, viewportWidth, scrollTo]);

  const handleSelectionChange = useCallback((selection: SelectionArea | null) => {
    localSelection.current = selection;
    onSelectionChange(selection);
  }, [onSelectionChange]);

  const handleZoom = useCallback((delta: number, mouseBp?: number) => {
    const left = horizontalScrollRef.current?.scrollLeft ?? 0;
    const anchor = mouseBp ?? (left + viewportWidth / 2) / zoomLevel;
    const anchorX = anchor * zoomLevel - left;
    const next = Math.min(MAX_ZOOM, Math.max(fitZoom, zoomLevel * (delta > 0 ? 1.2 : 1 / 1.2)));
    applyZoom(next, anchor * next - anchorX);
  }, [fitZoom, zoomLevel, viewportWidth, applyZoom]);

  const handleCenterOnSelection = useCallback(() => {
    if (activeSelection && viewportWidth > 0) {
      const [start, end] = selectionExtent(activeSelection, alignmentLength);
      scrollTo(centeredScroll(start, end, zoomLevel, viewportWidth));
    }
  }, [activeSelection, alignmentLength, zoomLevel, viewportWidth, scrollTo]);

  const handleFit = useCallback(() => {
    applyZoom(fitZoom, 0);
  }, [fitZoom, applyZoom]);

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

  const handleZoomToSelection = useCallback((selection: SelectionArea | null = activeSelection) => {
    if (selection && viewportWidth > 0) {
      const [start, end] = selectionExtent(selection, alignmentLength);
      const targetZoom = Math.min(MAX_ZOOM, Math.max(fitZoom, (viewportWidth - 120) / Math.max(1, end - start)));
      applyZoom(targetZoom, centeredScroll(start, end, targetZoom, viewportWidth));
    }
  }, [activeSelection, viewportWidth, fitZoom, alignmentLength, applyZoom]);

  // External selections (search/inspector) reveal their target. A manual drag or
  // handle edit already occurs in view and must stay under the pointer. A focused
  // selection is revealed by its flight instead.
  const selectionView = useRef({ zoomLevel, viewportWidth, alignmentLength, records, focusRequest });
  selectionView.current = { zoomLevel, viewportWidth, alignmentLength, records, focusRequest };
  useEffect(() => {
    if (activeSelection && activeSelection !== localSelection.current && !selectionView.current.focusRequest) {
      const view = selectionView.current;
      const [start, end] = selectionExtent(activeSelection, view.alignmentLength);
      scrollTo(centeredScroll(start, end, view.zoomLevel, view.viewportWidth));
      const recordIndex = view.records.findIndex(r => r.id === activeSelection.recordIds[0]);
      if (recordIndex !== -1) listRef.current?.scrollToItem(recordIndex, 'smart');
    }
    localSelection.current = null;
  }, [activeSelection, scrollTo]);

  useFocusFlight({
    focusRequest, onFocusComplete, records, alignmentLength, viewportWidth, fitZoom, zoomLevel,
    applyZoom, containerRef, horizontalScrollRef, listRef,
  });

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
    const bp = pixelToColumn(x, horizontalScrollRef.current?.scrollLeft ?? 0, zoomLevel, alignmentLength);
    setMousePos(bp < alignmentLength ? { x: x + SIDEBAR_WIDTH, bp } : null);
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
  }, [onSelectionChange, handleZoom, handleFit, handleCenterOnSelection, chartWidth, listHeight]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const x = e.clientX - rect.left - SIDEBAR_WIDTH;
        const bp = (x + (horizontalScrollRef.current?.scrollLeft ?? 0)) / zoomLevel;
        handleZoom(-e.deltaY, bp);
      } else if (e.shiftKey) {
        e.preventDefault();
        scrollTo((horizontalScrollRef.current?.scrollLeft ?? 0) + e.deltaY);
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomLevel, handleZoom, scrollTo]);

  const xScaleGlobal = d3.scaleLinear().domain([0, alignmentLength]).range([0, chartWidth]);

  return {
    containerRef, horizontalScrollRef, listRef, listContainerRef,
    dimensions, listHeight, scrollX, zoomLevel, gotoPos, setGotoPos, mousePos, applyZoom, handleSelectionChange,
    viewportWidth, chartWidth, fitZoom, xScaleGlobal,
    handleZoom, handleFit, handleCenterOnSelection, handleGoto, handleZoomToSelection,
    handleHorizontalScroll, handleMouseMove, handleMouseLeave,
  };
}

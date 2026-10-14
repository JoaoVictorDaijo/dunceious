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
import type { VariableSizeList } from 'react-window';
import type { SeqRecord } from '@/src/domain/bio/types';
import type { FocusTarget } from '@/src/app/logic/focusTarget';
import { MAX_ZOOM } from './constants';
import { selectionExtent } from './coordinates';

/** Share of the viewport the focused region fills, leaving context on both sides. */
const FOCUS_FILL = 0.8;
const MIN_FLIGHT_MS = 450;
const MAX_FLIGHT_MS = 1200;
const USER_INPUT = ['wheel', 'pointerdown', 'mousedown', 'touchstart'] as const;

/** A view as the column at its center and the columns it spans. */
interface ViewWindow { center: number; width: number }

export interface UseFocusFlightParams {
  focusRequest?: FocusTarget | null;
  onFocusComplete?: () => void;
  records: SeqRecord[];
  alignmentLength: number;
  viewportWidth: number;
  fitZoom: number;
  zoomLevel: number;
  applyZoom: (zoom: number, left: number) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  horizontalScrollRef: React.RefObject<HTMLDivElement | null>;
  listRef: React.RefObject<VariableSizeList | null>;
}

/**
 * Frames a focus request by flying the view along van Wijk & Nuij's smooth
 * zoom-pan path (`d3.interpolateZoom`): out far enough to see both ends, across,
 * then in. Reduced motion jumps straight to the frame; any user input ends the
 * flight where it is. The request is reported handled on landing or on hand-back.
 */
export function useFocusFlight(params: UseFocusFlightParams): void {
  const latest = useRef(params);
  latest.current = params;
  // A viewer opened by a focus has no view of its own yet, so it dives in from the whole alignment.
  const openedOnFocus = useRef(params.focusRequest ?? null);
  // StrictMode re-runs the effect for the same request; it must be reported handled only once.
  const handled = useRef<FocusTarget | null>(null);
  const measured = params.viewportWidth > 0;
  const { focusRequest } = params;

  useEffect(() => {
    if (!focusRequest || !measured || focusRequest === handled.current) return;
    const { alignmentLength, viewportWidth, fitZoom, zoomLevel, records, containerRef, horizontalScrollRef, listRef } = latest.current;

    const show = ({ center, width }: ViewWindow) => {
      const zoom = Math.min(MAX_ZOOM, Math.max(latest.current.fitZoom, viewportWidth / width));
      latest.current.applyZoom(zoom, center * zoom - viewportWidth / 2);
    };
    const [start, end] = selectionExtent(focusRequest, alignmentLength);
    const to: ViewWindow = {
      center: (start + end) / 2,
      width: Math.min(viewportWidth / fitZoom, Math.max(viewportWidth / MAX_ZOOM, (end - start) / FOCUS_FILL)),
    };
    const from: ViewWindow = focusRequest === openedOnFocus.current
      ? { center: alignmentLength / 2, width: viewportWidth / fitZoom }
      : {
          center: ((horizontalScrollRef.current?.scrollLeft ?? 0) + viewportWidth / 2) / zoomLevel,
          width: viewportWidth / zoomLevel,
        };

    const recordIndex = records.findIndex(r => r.id === focusRequest.recordId);
    if (recordIndex !== -1) listRef.current?.scrollToItem(recordIndex, 'smart');

    const finish = () => {
      handled.current = focusRequest;
      openedOnFocus.current = null;
      latest.current.onFocusComplete?.();
    };
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      show(to);
      finish();
      return;
    }

    const path = d3.interpolateZoom([from.center, 0, from.width], [to.center, 0, to.width]);
    const duration = Math.min(MAX_FLIGHT_MS, Math.max(MIN_FLIGHT_MS, path.duration));
    const container = containerRef.current;
    let frame = 0;
    let startedAt: number | null = null;

    const detach = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      USER_INPUT.forEach(type => container?.removeEventListener(type, handBack, true));
      window.removeEventListener('keydown', handBack, true);
    };
    function handBack() {
      detach();
      finish();
    }
    const step = (now: number) => {
      startedAt ??= now;
      const t = Math.min(1, (now - startedAt) / duration);
      if (t < 1) {
        const [center, , width] = path(d3.easeCubicInOut(t));
        show({ center, width });
        frame = requestAnimationFrame(step);
      } else {
        show(to);
        handBack();
      }
    };

    // Capture phase, so the flight lets go before the viewport handles the same input.
    USER_INPUT.forEach(type => container?.addEventListener(type, handBack, true));
    window.addEventListener('keydown', handBack, true);
    show(from);
    frame = requestAnimationFrame(step);
    return detach;
  }, [focusRequest, measured]);
}

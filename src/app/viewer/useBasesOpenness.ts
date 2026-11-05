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

import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';

const DURATION_MS = 240;

/**
 * How open the annotation bars are, 0 (thin) to 1 (room for bases), easing
 * toward `open`. The bar height is derived from this value on each render, so
 * bar, label and bases always share one frame; a CSS transition on the bar's
 * path would also tween its x and trail the scroll. One value per viewer: rows
 * are virtualized and remount while scrolling.
 */
export function useBasesOpenness(open: boolean): number {
  const target = open ? 1 : 0;
  const [value, setValue] = useState(target);
  const current = useRef(value);

  useEffect(() => {
    const from = current.current;
    if (from === target) return;
    const publish = (next: number) => { current.current = next; setValue(next); };
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      publish(target);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const progress = Math.min(1, Math.max(0, (now - start) / DURATION_MS));
      publish(progress >= 1 ? target : from + (target - from) * d3.easeCubicInOut(progress));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return value;
}

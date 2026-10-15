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

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { D614G_POSITION, GENES, GENOME_LENGTH } from './greeterContent';
import { BASE_SPAN, REGION_SPAN, clampPosition, geneLandmark } from './genomeZoom';

export const INTRO_MS = 1600;

/** Row boundaries of the drawing, in SVG units, so a drag knows which strip it started on. */
export interface LensLayout {
  genomeBottom: number;
  regionBottom: number;
}

type Drag =
  | { mode: 'genome' }
  | { mode: 'pan'; startX: number; startCenter: number; basesPerUnit: number };

function prefersMotion(): boolean {
  if (typeof window.matchMedia !== 'function' || typeof window.requestAnimationFrame !== 'function') return false;
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * The lens position over the genome. It opens with one glide from the start of
 * the genome to the D614G site, which any input cancels.
 */
export function useLens() {
  const [animate] = useState(prefersMotion);
  const [center, setCenterState] = useState(animate ? 1 : D614G_POSITION);
  const frame = useRef<number | null>(null);
  const drag = useRef<Drag | null>(null);
  const [touched, setTouched] = useState(false);

  const stopIntro = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
  };
  const setCenter = (pos: number) => {
    stopIntro();
    setTouched(true);
    setCenterState(clampPosition(pos));
  };

  useEffect(() => {
    if (!animate) return;
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / INTRO_MS);
      setCenterState(clampPosition(1 + (D614G_POSITION - 1) * easeInOut(t)));
      frame.current = t < 1 ? requestAnimationFrame(tick) : null;
    };
    frame.current = requestAnimationFrame(tick);
    return stopIntro;
  }, [animate]);

  const toUnits = (e: PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const view = e.currentTarget.viewBox.baseVal;
    return {
      x: ((e.clientX - box.left) * view.width) / (box.width || 1),
      y: ((e.clientY - box.top) * view.height) / (box.height || 1),
      width: view.width,
    };
  };

  const onPointerDown = (e: PointerEvent<SVGSVGElement>, layout: LensLayout) => {
    const p = toUnits(e);
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (p.y < layout.genomeBottom) {
      drag.current = { mode: 'genome' };
      setCenter((p.x / p.width) * GENOME_LENGTH);
      return;
    }
    // The region strip shows one base per unit; the base strip spreads BASE_SPAN bases over the width.
    const basesPerUnit = p.y < layout.regionBottom ? REGION_SPAN / p.width : BASE_SPAN / p.width;
    drag.current = { mode: 'pan', startX: p.x, startCenter: center, basesPerUnit };
    stopIntro();
    setTouched(true);
  };

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    const p = toUnits(e);
    if (d.mode === 'genome') setCenter((p.x / p.width) * GENOME_LENGTH);
    else setCenter(d.startCenter - (p.x - d.startX) * d.basesPerUnit);
  };

  const onPointerUp = () => { drag.current = null; };

  const onKeyDown = (e: KeyboardEvent) => {
    const step = e.shiftKey ? REGION_SPAN : 1;
    const moves: Record<string, number> = {
      ArrowRight: center + step, ArrowUp: center + step, ArrowLeft: center - step, ArrowDown: center - step,
      PageUp: center + REGION_SPAN, PageDown: center - REGION_SPAN, Home: 1, End: GENOME_LENGTH,
    };
    if (!(e.key in moves)) return;
    e.preventDefault();
    setCenter(moves[e.key]);
  };

  const landmarks = GENES.map(geneLandmark);
  const nextGene = () => setCenter(landmarks.find((p) => p > center) ?? landmarks[0]);
  const previousGene = () => setCenter([...landmarks].reverse().find((p) => p < center) ?? landmarks[landmarks.length - 1]);

  return { center, touched, onPointerDown, onPointerMove, onPointerUp, onKeyDown, nextGene, previousGene };
}

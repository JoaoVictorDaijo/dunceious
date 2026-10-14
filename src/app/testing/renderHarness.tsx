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

import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Re-export the full testing-library surface (render, screen, within, fireEvent, …)
// so tests import everything from one place.
export * from '@testing-library/react';

// The project does not enable `globals: true`, so testing-library's own
// auto-cleanup (which only fires when a global `afterEach` exists) never runs.
// Register it explicitly; imported here, it binds to each test file that imports
// the harness.
afterEach(cleanup);

export interface CanvasRecorder {
  /** Ordered arguments passed to ctx.fillText — the glyphs/letters drawn. */
  texts(): string[];
  /** Ordered [x, y, w, h] tuples passed to ctx.fillRect. */
  fillRects(): Array<[number, number, number, number]>;
  /** Colours used for each fillRect, in draw order. */
  fillColors(): string[];
  /** Ordered [x, y, w, h] tuples passed to ctx.strokeRect, with the strokeStyle and lineWidth in force. */
  strokeRects(): Array<{ rect: [number, number, number, number]; color: string; width: number }>;
}

/**
 * Replace HTMLCanvasElement.prototype.getContext with a recording 2D context.
 * Records fillText / fillRect and fillStyle; every other method is a no-op and
 * other property assignments (font, …) are ignored, so these draw calls
 * exercise cannot throw. Call in each canvas test's beforeEach: the returned
 * recorder is fresh per call, and the getContext patch persists within a file
 * until the next install (it is not restored between tests) — vitest isolates
 * test files, so it never leaks across files.
 */
export function installCanvasRecorder(): CanvasRecorder {
  const texts: string[] = [];
  const fillRects: Array<[number, number, number, number]> = [];
  const fillColors: string[] = [];
  const strokeRects: Array<{ rect: [number, number, number, number]; color: string; width: number }> = [];
  let fillStyle = '';
  let strokeStyle = '';
  let lineWidth = 1;

  const ctx = new Proxy(
    {
      fillText: (t: unknown) => { texts.push(String(t)); },
      fillRect: (x: number, y: number, w: number, h: number) => {
        fillRects.push([x, y, w, h]);
        fillColors.push(fillStyle);
      },
      strokeRect: (x: number, y: number, w: number, h: number) => {
        strokeRects.push({ rect: [x, y, w, h], color: strokeStyle, width: lineWidth });
      },
    } as Record<string, unknown>,
    {
      get(target, prop) {
        return prop in target ? target[prop as string] : () => {};
      },
      set(_target, prop, value) {
        if (prop === 'fillStyle') fillStyle = String(value);
        if (prop === 'strokeStyle') strokeStyle = String(value);
        if (prop === 'lineWidth') lineWidth = Number(value);
        return true;
      },
    },
  );

  HTMLCanvasElement.prototype.getContext = (() => ctx) as unknown as HTMLCanvasElement['getContext'];

  return { texts: () => texts, fillRects: () => fillRects, fillColors: () => fillColors, strokeRects: () => strokeRects };
}

/** jsdom has no ResizeObserver; install a no-op so components that construct one render. */
export function stubResizeObserver(): void {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

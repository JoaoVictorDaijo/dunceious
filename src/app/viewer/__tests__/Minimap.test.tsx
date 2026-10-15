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

// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, installCanvasRecorder, render } from '@/src/app/testing/renderHarness';
import { Minimap } from '../Minimap';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('minimap drawing area', () => {
  it('updates its scale when selection controls resize the flex item without changing the viewer width', () => {
    installCanvasRecorder();
    let width = 900;
    let resize: () => void;
    const disconnect = vi.fn();
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => width);
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { resize = callback; }
      observe() {}
      disconnect = disconnect;
    });
    const view = render(<Minimap records={[]} consensus="" alignmentLength={10000} containerWidth={1200}
      viewportWidth={1080} scrollX={0} zoomLevel={1} fitZoom={0.1}
      searchResults={[]} currentSearchIdx={-1} onZoomChange={vi.fn()} />);
    const svg = view.container.querySelector('[data-minimap-ruler]')!;
    // The ruler, brush, and preview must share the resized drawing bounds.
    expect(svg.getAttribute('width')).toBe('892');
    width = 600;
    act(() => resize!());
    expect(svg.getAttribute('width')).toBe('592');
    expect(svg.querySelector('[data-minimap-brush-area]')!.getAttribute('width')).toBe('592');
    expect(view.container.querySelector<HTMLCanvasElement>('[data-minimap-preview]')!.width).toBe(592);
    width = 0;
    // Narrow layouts must not allocate a negative typed-array size.
    act(() => resize!());
    view.unmount();
    expect(disconnect).toHaveBeenCalledOnce();
  });
});

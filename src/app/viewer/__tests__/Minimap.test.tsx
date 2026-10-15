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
import React, { useRef } from 'react';
import type { VariableSizeList } from 'react-window';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, installCanvasRecorder, render } from '@/src/app/testing/renderHarness';
import { Minimap } from '../Minimap';
import { TouchArbiter } from '../touchGesture';
import { useTouchPanZoom } from '../useTouchPanZoom';

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
    const view = render(<Minimap touchArbiter={new TouchArbiter()} records={[]} consensus="" alignmentLength={10000} containerWidth={1200}
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

function pointer(target: Element, type: string, id: number, x = 100, y = 10) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
  Object.defineProperties(event, { pointerId: { value: id }, pointerType: { value: 'touch' } });
  act(() => { target.dispatchEvent(event); });
  return event;
}

function mouse(target: Window | Element, type: string, x: number) {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: 10, buttons: 1 });
  // jsdom rejects its Window proxy in MouseEventInit; d3 needs view for its mouse listeners.
  Object.defineProperty(event, 'view', { value: window });
  act(() => { fireEvent(target, event); });
}

function setupTouch() {
  installCanvasRecorder();
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1008);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  const arbiter = new TouchArbiter();
  const zoom = vi.fn();
  function Harness() {
    const containerRef = useRef<HTMLDivElement>(null);
    const horizontalScrollRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<VariableSizeList>(null);
    useTouchPanZoom({ containerRef, horizontalScrollRef, listRef, arbiter, zoomLevel: 2, fitZoom: 0.1, applyZoom: zoom });
    return <><div ref={containerRef} data-testid="rows" /><div ref={horizontalScrollRef} data-testid="horizontal" />
      <Minimap touchArbiter={arbiter} records={[]} consensus="" alignmentLength={10000} containerWidth={1200}
        viewportWidth={800} scrollX={200} zoomLevel={2} fitZoom={0.1}
        searchResults={[]} currentSearchIdx={-1} onZoomChange={zoom} /></>;
  }
  const rendered = render(<Harness />);
  const mini = rendered.container.querySelector<SVGSVGElement>('[data-minimap-ruler]')!;
  const rows = rendered.getByTestId('rows');
  const horizontal = rendered.getByTestId('horizontal');
  Object.defineProperty(rows, 'setPointerCapture', { value: vi.fn() });
  Object.defineProperty(mini, 'setPointerCapture', { value: vi.fn() });
  vi.spyOn(mini, 'getBoundingClientRect').mockReturnValue({ left: 20, width: 1000 } as DOMRect);
  horizontal.scrollLeft = 200;
  return { ...rendered, arbiter, mini, rows, horizontal, zoom };
}

describe('minimap touch', () => {
  it('touch drag on the minimap moves the window at the same zoom', () => {
    const h = setupTouch();
    expect(pointer(h.mini, 'pointerdown', 1).defaultPrevented).toBe(true);
    pointer(h.mini, 'pointermove', 1, 105);
    expect(h.zoom).not.toHaveBeenCalled();
    pointer(h.mini, 'pointermove', 1, 110);
    expect(h.zoom).toHaveBeenLastCalledWith(2, 400);
    pointer(h.mini, 'pointermove', 1, 120);
    expect(h.zoom).toHaveBeenLastCalledWith(2, 600);
    pointer(h.mini, 'pointerup', 1, 120);
    expect(h.zoom).toHaveBeenCalledTimes(2);
    expect(h.mini.style.touchAction).toBe('none');
  });
  it('touch tap centres the view', () => {
    const h = setupTouch();
    pointer(h.mini, 'pointerdown', 1, 220);
    pointer(h.mini, 'pointerup', 1, 220);
    expect(h.zoom).toHaveBeenCalledExactlyOnceWith(2, 3600);
  });
  it('cancel stops movement and never centres the view', () => {
    const h = setupTouch();
    pointer(h.mini, 'pointerdown', 1);
    pointer(h.mini, 'pointercancel', 1);
    pointer(h.mini, 'pointermove', 1, 120);
    expect(h.zoom).not.toHaveBeenCalled();
    expect(h.arbiter.owner()).toBeNull();
  });
  it('mouse brushing is unchanged and touch listeners cannot start d3 brushing', () => {
    const h = setupTouch();
    const brush = h.mini.querySelector('[data-minimap-brush-area]')!;
    expect((brush.parentNode as Element & { __on: { type: string }[] }).__on.map(listener => listener.type))
      .not.toContain('touchstart');
    vi.spyOn(brush.parentNode as Element, 'getBoundingClientRect').mockReturnValue({ left: 20, top: 0 } as DOMRect);
    mouse(brush, 'mousedown', 100);
    mouse(window, 'mousemove', 300);
    mouse(window, 'mouseup', 300);
    expect(h.zoom).toHaveBeenCalledWith(expect.closeTo(0.4, 10), expect.closeTo(320, 10));
  });
});

describe('touch surface arbitration', () => {
  it.each(['rows', 'minimap'] as const)('cross-surface fingers are ignored in both orders: %s first', first => {
    for (const ownerUpFirst of [true, false]) {
      const h = setupTouch();
      const owner = first === 'rows' ? h.rows : h.mini;
      const other = first === 'rows' ? h.mini : h.rows;
      pointer(owner, 'pointerdown', 1);
      expect(pointer(other, 'pointerdown', 2).defaultPrevented).toBe(true);
      pointer(other, 'pointermove', 2, 150);
      expect(h.zoom).not.toHaveBeenCalled();
      expect(h.horizontal.scrollLeft).toBe(200);
      pointer(owner, 'pointermove', 1, 80);
      if (first === 'rows') {
        expect(h.horizontal.scrollLeft).toBe(220);
        expect(h.zoom).not.toHaveBeenCalled();
      } else {
        expect(h.zoom).toHaveBeenLastCalledWith(2, -200);
        expect(h.horizontal.scrollLeft).toBe(200);
      }
      if (ownerUpFirst) pointer(owner, 'pointerup', 1, 80);
      h.zoom.mockClear();
      pointer(other, 'pointermove', 2, 180);
      expect(h.zoom).not.toHaveBeenCalled();
      pointer(other, 'pointerup', 2, 180);
      if (!ownerUpFirst) pointer(owner, 'pointerup', 1, 80);
      expect(h.arbiter.owner()).toBeNull();
      h.unmount();
    }
  });
});

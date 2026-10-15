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
import { act, fireEvent, render } from '@/src/app/testing/renderHarness';
import { TouchArbiter } from '../touchGesture';
import { useTouchPanZoom } from '../useTouchPanZoom';

afterEach(() => vi.restoreAllMocks());

export function pointer(target: Element, type: string, id: number, x = 200, y = 100, pointerType = 'touch') {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
  Object.defineProperties(event, { pointerId: { value: id }, pointerType: { value: pointerType } });
  act(() => { target.dispatchEvent(event); });
  return event;
}

function setup(arbiter = new TouchArbiter()) {
  const click = vi.fn();
  const mouse = vi.fn();
  const zoom = vi.fn();
  const capture = vi.fn();
  const outer = document.createElement('div');
  outer.scrollTop = 50;
  const scrollTo = vi.fn((top: number) => { outer.scrollTop = Math.max(0, top); });
  function Harness({ level = 2 }: { level?: number }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const horizontalScrollRef = useRef<HTMLDivElement>(null);
    const listRef = useRef({ _outerRef: outer, scrollTo } as unknown as VariableSizeList);
    useTouchPanZoom({ containerRef, horizontalScrollRef, listRef, arbiter, zoomLevel: level, fitZoom: 0.5, applyZoom: zoom });
    return <><div ref={containerRef} onMouseDown={mouse} data-testid="rows"><button onClick={click}>Feature</button></div>
      <div ref={horizontalScrollRef} data-testid="horizontal" /></>;
  }
  const rendered = render(<Harness />);
  const rows = rendered.getByTestId('rows');
  const feature = rendered.getByText('Feature');
  const horizontal = rendered.getByTestId('horizontal');
  horizontal.scrollLeft = 100;
  Object.defineProperty(rows, 'setPointerCapture', { value: capture });
  vi.spyOn(rows, 'getBoundingClientRect').mockReturnValue({ left: 20 } as DOMRect);
  return { ...rendered, rows, feature, horizontal, click, mouse, zoom, capture, scrollTo, arbiter, Harness };
}

describe('rows touch controller', () => {
  it('one finger pan scrolls both axes', () => {
    const h = setup();
    pointer(h.rows, 'pointerdown', 1);
    pointer(h.rows, 'pointermove', 1, 180, 70);
    expect(h.horizontal.scrollLeft).toBe(120);
    expect(h.scrollTo).toHaveBeenLastCalledWith(80);
    pointer(h.rows, 'pointermove', 1, 170, 60);
    expect(h.horizontal.scrollLeft).toBe(130);
    expect(h.scrollTo).toHaveBeenLastCalledWith(90);
  });
  it('tap on a feature still fires its click', () => {
    const h = setup();
    pointer(h.feature, 'pointerdown', 1);
    pointer(h.feature, 'pointermove', 1, 203, 104);
    pointer(h.feature, 'pointerup', 1, 203, 104);
    fireEvent.click(h.feature);
    expect(h.click).toHaveBeenCalledOnce();
    expect(h.capture).not.toHaveBeenCalled();
    expect(h.scrollTo).not.toHaveBeenCalled();
  });
  it('pan survives the implicit-capture handoff', () => {
    const h = setup();
    pointer(h.feature, 'pointerdown', 1);
    pointer(h.feature, 'pointermove', 1, 193);
    expect(h.capture).toHaveBeenCalledWith(1);
    pointer(h.feature, 'lostpointercapture', 1);
    pointer(h.rows, 'lostpointercapture', 1);
    pointer(h.rows, 'gotpointercapture', 1);
    pointer(h.rows, 'pointermove', 1, 180);
    expect(h.horizontal.scrollLeft).toBe(120);
    pointer(h.rows, 'lostpointercapture', 1);
    pointer(h.rows, 'pointermove', 1, 150);
    expect(h.horizontal.scrollLeft).toBe(120);
    pointer(h.rows, 'pointerup', 1);
    expect(h.arbiter.owner()).toBeNull();
  });
  it('pinch zooms around the midpoint excluding the label gutter', () => {
    const h = setup();
    pointer(h.rows, 'pointerdown', 1, 200);
    pointer(h.rows, 'pointerdown', 2, 240);
    pointer(h.rows, 'pointermove', 2, 280, 100);
    expect(h.zoom).toHaveBeenLastCalledWith(4, 260);
    expect(h.capture.mock.calls).toEqual([[1], [2]]);
  });
  it('keeps an active pinch through rerenders', () => {
    const h = setup();
    pointer(h.rows, 'pointerdown', 1, 200);
    pointer(h.rows, 'pointerdown', 2, 240);
    pointer(h.rows, 'pointermove', 2, 280);
    h.rerender(<h.Harness level={4} />);
    pointer(h.rows, 'pointermove', 2, 320);
    expect(h.zoom).toHaveBeenLastCalledWith(6, 420);
  });
});

describe('rows touch lifecycle', () => {
  it('release click is suppressed after a pan and the next tap works', () => {
    const h = setup();
    pointer(h.rows, 'pointerdown', 1);
    pointer(h.rows, 'pointermove', 1, 190);
    pointer(h.rows, 'pointerup', 1);
    fireEvent.click(h.feature);
    expect(h.click).not.toHaveBeenCalled();
    fireEvent.click(h.feature);
    expect(h.click).toHaveBeenCalledOnce();
  });
  it('touch pointerdown calls preventDefault even when rejected', () => {
    const h = setup();
    expect(pointer(h.rows, 'pointerdown', 1).defaultPrevented).toBe(true);
    pointer(h.rows, 'pointerup', 1);
    h.arbiter.claim('minimap', 2);
    expect(pointer(h.rows, 'pointerdown', 3).defaultPrevented).toBe(true);
    pointer(h.rows, 'pointermove', 3, 100);
    expect(h.horizontal.scrollLeft).toBe(100);
  });
  it.each(['mouse', 'pen'])('%s path ignores the touch controller', kind => {
    const h = setup();
    expect(pointer(h.rows, 'pointerdown', 1, 200, 100, kind).defaultPrevented).toBe(false);
    pointer(h.rows, 'pointermove', 1, 100, 50, kind);
    fireEvent.mouseDown(h.rows);
    expect(h.mouse).toHaveBeenCalledOnce();
    expect(h.capture).not.toHaveBeenCalled();
    expect(h.zoom).not.toHaveBeenCalled();
    expect(h.scrollTo).not.toHaveBeenCalled();
    expect(h.arbiter.owner()).toBeNull();
  });
  it('cancel and lifting one pinch finger prevent remaining motion', () => {
    const h = setup();
    pointer(h.rows, 'pointerdown', 1);
    pointer(h.rows, 'pointerdown', 2, 240);
    pointer(h.rows, 'pointercancel', 2);
    pointer(h.rows, 'pointermove', 1, 100);
    expect(h.zoom).not.toHaveBeenCalled();
    expect(h.horizontal.scrollLeft).toBe(100);
    pointer(h.rows, 'pointerup', 1);
    expect(h.arbiter.owner()).toBeNull();
  });
  it('releases ownership and removes listeners on unmount', () => {
    const h = setup();
    pointer(h.rows, 'pointerdown', 1);
    h.unmount();
    expect(h.arbiter.owner()).toBeNull();
    pointer(h.rows, 'pointermove', 1, 100);
    expect(h.horizontal.scrollLeft).toBe(100);
  });
});

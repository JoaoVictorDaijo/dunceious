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
import React, { StrictMode, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@/src/app/testing/renderHarness';
import type { SelectionArea, SeqRecord } from '@/src/domain/bio/types';
import type { FocusTarget } from '@/src/app/shared/logic/focusTarget';
import { useViewport } from '../useViewport';

const records: SeqRecord[] = [{ id: 'synthetic', name: 'synthetic', sequence: 'A'.repeat(10000), features: [] }];
const selection = (start: number, end: number) => ({ start, end, recordIds: ['synthetic'] });

const focusSelection = (t: FocusTarget): SelectionArea => ({ start: t.start, end: t.end, recordIds: [t.recordId] });

function setup(initialFocus: FocusTarget | null = null) {
  let view: ReturnType<typeof useViewport>;
  let setSelection: (s: SelectionArea | null) => void;
  let setFocus: (t: FocusTarget) => void;
  const onFocusComplete = vi.fn();
  function Harness() {
    const [activeSelection, update] = useState<SelectionArea | null>(initialFocus && focusSelection(initialFocus));
    const [focusRequest, setFocusRequest] = useState<FocusTarget | null>(initialFocus);
    setSelection = update;
    setFocus = t => { update(focusSelection(t)); setFocusRequest(t); };
    view = useViewport({
      records, alignmentLength: 10000, activeSelection, onSelectionChange: update,
      focusRequest, onFocusComplete: () => { onFocusComplete(); setFocusRequest(null); },
    });
    return <div ref={view.containerRef} data-testid="container">
      <div ref={view.listContainerRef} />
      <div ref={view.horizontalScrollRef} data-testid="scroll" onScroll={view.handleHorizontalScroll}>
        <div style={{ width: view.chartWidth + 250 }} />
      </div>
    </div>;
  }
  render(<StrictMode><Harness /></StrictMode>);
  const scroll = screen.getByTestId('scroll');
  let left = 0;
  Object.defineProperty(scroll, 'scrollLeft', {
    get: () => left,
    set: (value: number) => {
      left = Math.max(0, Math.min(parseFloat((scroll.firstChild as HTMLElement).style.width) - 800, value));
    },
  });
  const run = (fn: (v: ReturnType<typeof useViewport>) => void) => act(() => fn(view!));
  return { get view() { return view!; }, scroll, run, onFocusComplete,
    external: (s: SelectionArea) => act(() => setSelection!(s)),
    focus: (t: FocusTarget) => act(() => setFocus!(t)),
    advance: (ms: number) => act(() => { vi.advanceTimersByTime(ms); }),
    nativeScroll: (x: number) => { scroll.scrollLeft = x; fireEvent.scroll(scroll); },
  };
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(920);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(500);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('viewport scroll and zoom', () => {
  it('uses the native scroll position for Shift+wheel, render and pointer conversion', () => {
    const h = setup();
    fireEvent.wheel(screen.getByTestId('container'), { shiftKey: true, deltaY: 300 });
    expect(h.scroll.scrollLeft).toBe(300);
    expect(h.view.scrollX).toBe(300);
    h.run(v => v.handleMouseMove({ currentTarget: { getBoundingClientRect: () => ({ left: 100 }) }, clientX: 420 } as unknown as React.MouseEvent));
    expect(h.view.mousePos?.bp).toBe(500);
  });

  it('retains the cursor anchor after scrolling, with an active manual selection', () => {
    const h = setup();
    h.run(v => v.handleSelectionChange(selection(100, 200)));
    h.nativeScroll(2000);
    fireEvent.wheel(screen.getByTestId('container'), { ctrlKey: true, deltaY: -100, clientX: 320 });
    expect(h.view.zoomLevel).toBeCloseTo(1.2);
    expect(h.scroll.scrollLeft).toBeCloseTo(2440);
    expect(h.view.scrollX).toBe(h.scroll.scrollLeft);
  });

  it('keeps a manual selection at the pointer and centers its midpoint only on request', () => {
    const h = setup();
    h.nativeScroll(1000);
    h.run(v => v.handleSelectionChange(selection(1200, 1400)));
    expect(h.scroll.scrollLeft).toBe(1000);
    h.run(v => v.handleCenterOnSelection());
    expect(h.scroll.scrollLeft).toBe(900);
  });

  it('applies zoom scroll after the new width exists, including max zoom and a repeated request', () => {
    const h = setup();
    h.external(selection(9000, 9001));
    h.run(v => v.handleZoomToSelection());
    expect(h.view.zoomLevel).toBe(150);
    expect(h.scroll.scrollLeft).toBe(1349675);
    h.nativeScroll(0);
    h.run(v => v.handleZoomToSelection());
    expect(h.scroll.scrollLeft).toBe(1349675);
  });

  it('centers a wide selection and resets scroll when fitting the alignment', () => {
    const h = setup();
    h.external(selection(4000, 4200));
    h.run(v => v.handleZoomToSelection());
    expect(h.view.zoomLevel).toBe(3.4);
    expect(h.scroll.scrollLeft).toBe(13540);
    h.run(v => v.handleFit());
    expect(h.scroll.scrollLeft).toBe(0);
    expect(h.view.scrollX).toBe(0);
  });

  it('clamps at the left boundary and shows both circular arms without changing endpoints', () => {
    const h = setup();
    h.external(selection(0, 1));
    h.run(v => v.handleZoomToSelection());
    expect(h.scroll.scrollLeft).toBe(0);
    h.external(selection(9900, 100));
    h.run(v => v.handleZoomToSelection());
    expect(h.view.zoomLevel).toBe(0.076);
    expect(h.scroll.scrollLeft).toBe(0);
  });
});

describe('focus flight', () => {
  // 4000–4500 framed at 80% of an 800px view: 640 / 500 px per bp, midpoint 4250 centered.
  const target: FocusTarget = { recordId: 'synthetic', start: 4000, end: 4500, label: 'g', length: 500 };
  const framedZoom = 1.28;
  const framedLeft = 4250 * framedZoom - 400;
  const reducedMotion = (matches: boolean) =>
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: matches && query.includes('reduce'), media: query }));

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    reducedMotion(false);
  });
  afterEach(() => { vi.useRealTimers(); });

  it('dives in from the whole alignment when the viewer opens on a focus, then frames the region', () => {
    const h = setup(target);
    h.advance(16);
    expect(h.view.zoomLevel).toBeLessThan(0.2);
    expect(h.onFocusComplete).not.toHaveBeenCalled();
    h.advance(3000);
    expect(h.view.zoomLevel).toBeCloseTo(framedZoom);
    expect(h.scroll.scrollLeft).toBeCloseTo(framedLeft);
    expect(h.onFocusComplete).toHaveBeenCalledTimes(1);
  });

  it('flies from the current view when a focus arrives in an open viewer, without jumping first', () => {
    const h = setup();
    h.focus(target);
    expect(h.scroll.scrollLeft).toBe(0);
    h.advance(3000);
    expect(h.view.zoomLevel).toBeCloseTo(framedZoom);
    expect(h.scroll.scrollLeft).toBeCloseTo(framedLeft);
    expect(h.onFocusComplete).toHaveBeenCalledTimes(1);
  });

  it('jumps straight to the frame when reduced motion is requested', () => {
    reducedMotion(true);
    const h = setup();
    h.focus(target);
    expect(h.view.zoomLevel).toBeCloseTo(framedZoom);
    expect(h.scroll.scrollLeft).toBeCloseTo(framedLeft);
    expect(h.onFocusComplete).toHaveBeenCalledTimes(1);
  });

  it('hands the view back as soon as the user zooms mid-flight', () => {
    const h = setup(target);
    h.advance(200);
    fireEvent.wheel(screen.getByTestId('container'), { ctrlKey: true, deltaY: -100, clientX: 320 });
    const zoom = h.view.zoomLevel, left = h.scroll.scrollLeft;
    h.advance(3000);
    expect(h.view.zoomLevel).toBe(zoom);
    expect(h.scroll.scrollLeft).toBe(left);
    expect(h.onFocusComplete).toHaveBeenCalledTimes(1);
  });
});

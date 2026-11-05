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

// @vitest-environment jsdom
import React, { StrictMode, useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@/src/app/testing/renderHarness';
import type { SelectionArea, SeqRecord } from '@/src/domain/bio/types';
import { useSelectionDrag } from '../useSelectionDrag';
import { VariableSizeList } from 'react-window';

const records: SeqRecord[] = [
  { id: 'first', name: 'first', sequence: 'A'.repeat(1000), features: [] },
  { id: 'second', name: 'second', sequence: 'C'.repeat(1000), features: [] },
];

function setup(options: { scrollLeft?: number; zoom?: number; selection?: SelectionArea; dragMode?: 'pan' | 'select' } = {}) {
  const scroll = document.createElement('div');
  let offset = options.scrollLeft ?? 0;
  // jsdom has no layout: model the browser's scroll range, including clamping.
  Object.defineProperty(scroll, 'scrollLeft', {
    get: () => offset,
    set: (value: number) => { offset = Math.max(0, Math.min(600, value)); },
  });
  const commits: SelectionArea[] = [];
  function Harness() {
    const [selection, setSelection] = useState<SelectionArea | null>(options.selection ?? null);
    const { handleMouseDown, dragSelection } = useSelectionDrag({
      dragMode: options.dragMode ?? 'select', activeSelection: selection,
      onSelectionChange: value => { if (value) commits.push(value); setSelection(value); },
      records, alignmentLength: 1000, chartWidth: 1000 * (options.zoom ?? 1),
      horizontalScrollRef: { current: scroll }, listRef: { current: null },
    });
    return <>
      <div role="region" aria-label="Genome" onMouseDown={handleMouseDown} />
      <output aria-label="Preview">{JSON.stringify(dragSelection)}</output>
      <output aria-label="Selection">{JSON.stringify(selection)}</output>
    </>;
  }
  const view = render(<StrictMode><Harness /></StrictMode>);
  const viewport = screen.getByRole('region', { name: 'Genome' });
  vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 0, 520, 200));
  const down = (x: number, shiftKey = false) => fireEvent.mouseDown(viewport, { clientX: x, clientY: 100, shiftKey });
  const move = (x: number) => fireEvent.mouseMove(window, { clientX: x, clientY: 100 });
  const up = (x: number) => {
    fireEvent.mouseUp(window, { clientX: x, clientY: 100 });
    act(() => { vi.runOnlyPendingTimers(); });
  };
  const preview = () => JSON.parse(screen.getByLabelText('Preview').textContent!);
  const selected = () => JSON.parse(screen.getByLabelText('Selection').textContent!);
  return { ...view, scroll, commits, down, move, up, preview, selected };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('selection dragging', () => {
  it('preserves horizontal panning without creating a selection', () => {
    const h = setup({ dragMode: 'pan', scrollLeft: 200 });
    h.down(320); h.move(350); h.up(350);
    expect(h.scroll.scrollLeft).toBe(170);
    expect(h.selected()).toBeNull();
    expect(h.commits).toHaveLength(0);
  });

  it('stops panning after the viewer is unmounted', () => {
    const h = setup({ dragMode: 'pan', scrollLeft: 200 });
    h.down(320); h.move(350);
    h.unmount(); h.move(250); h.up(250);
    expect(h.scroll.scrollLeft).toBe(170);
  });

  it('stops scheduling scroll frames at the browser scroll boundary', () => {
    const h = setup({ scrollLeft: 590 });
    h.down(320); h.move(600);
    act(() => { vi.advanceTimersByTime(100); });
    expect(h.scroll.scrollLeft).toBe(600);
    expect(h.preview()).toEqual({ start: 690, end: 980, recordIds: ['first', 'second'] });
    expect(vi.getTimerCount()).toBe(0);
    h.up(600);
  });

  it.each([[320, 520], [520, 320]])('commits the same linear interval for a drag from %i to %i', (from, to) => {
    const h = setup();
    h.down(from); h.move(to);
    h.up(to);
    expect(h.selected()).toEqual({ start: 100, end: 300, recordIds: ['first', 'second'] });
    expect(h.commits).toHaveLength(1);
    expect(h.preview()).toBeNull();
  });

  it('uses the release coordinate even without a final mousemove', () => {
    const h = setup();
    h.down(320); h.move(400); h.up(520);
    expect(h.selected()).toEqual({ start: 100, end: 300, recordIds: ['first', 'second'] });
  });

  it.each([
    { offset: 200, pointer: 600, expectedScroll: 215, start: 300, end: 595 },
    { offset: 200, pointer: 230, expectedScroll: 185, start: 195, end: 300 },
  ])('updates the preview and committed interval while scrolling with a stationary pointer at $pointer', c => {
    const h = setup({ scrollLeft: c.offset });
    h.down(320); h.move(c.pointer);
    act(() => { vi.advanceTimersToNextFrame(); });
    expect(h.scroll.scrollLeft).toBe(c.expectedScroll);
    expect(h.preview()).toEqual({ start: c.start, end: c.end, recordIds: ['first', 'second'] });
    h.up(c.pointer);
    expect(h.selected()).toEqual({ start: c.start, end: c.end, recordIds: ['first', 'second'] });
    const stoppedAt = h.scroll.scrollLeft;
    act(() => { vi.advanceTimersByTime(100); });
    expect(h.scroll.scrollLeft).toBe(stoppedAt);
    expect(h.commits).toHaveLength(1);
  });

  it('maps zoom and scroll to bases and clamps a release beyond the sequence', () => {
    const h = setup({ scrollLeft: 200, zoom: 2 });
    h.down(420); h.move(520); h.up(2500);
    expect(h.selected()).toEqual({ start: 200, end: 1000, recordIds: ['first', 'second'] });
  });

  it('ignores right clicks and the fixed record-name sidebar', () => {
    const h = setup();
    fireEvent.mouseDown(screen.getByRole('region', { name: 'Genome' }), { button: 2, clientX: 320 });
    h.move(520); h.up(520);
    h.down(150); h.move(520); h.up(520);
    expect(h.selected()).toBeNull();
    expect(h.commits).toHaveLength(0);
  });

  it('clamps release past the left edge without creating a circular interval', () => {
    const h = setup({ scrollLeft: 200, zoom: 2 });
    h.down(420); h.up(-1000);
    expect(h.selected()).toEqual({ start: 0, end: 200, recordIds: ['first', 'second'] });
  });

  it('does not replace an existing circular selection on a click without a range', () => {
    const selection = { start: 800, end: 200, recordIds: ['first'] };
    const h = setup({ selection });
    h.down(320); h.up(320);
    expect(h.selected()).toEqual(selection);
    expect(h.commits).toHaveLength(0);
  });

  it('preserves the directed circular interval when extending an existing selection with Shift', () => {
    const h = setup({ selection: { start: 800, end: 200, recordIds: ['first'] } });
    h.down(520, true); h.up(520);
    expect(h.selected()).toEqual({ start: 800, end: 300, recordIds: ['first'] });
  });

  it('cancels the drag on unmount without scrolling or committing afterwards', () => {
    const h = setup();
    h.down(320); h.move(600);
    h.unmount();
    act(() => { vi.advanceTimersByTime(100); });
    h.up(600);
    expect(h.scroll.scrollLeft).toBe(0);
    expect(h.commits).toHaveLength(0);
  });
});


describe('vertical pan with the virtualized record list', () => {
  it.each([[130, 170], [70, 230]])('moves the list to %i-pixel pointer position and stops on release', (pointerY, expectedTop) => {
    const outerRef = React.createRef<HTMLDivElement>();
    function Harness() {
      const listRef = useRef<VariableSizeList>(null);
      const horizontalScrollRef = useRef<HTMLDivElement>(null);
      const { handleMouseDown } = useSelectionDrag({
        dragMode: 'pan', activeSelection: null, onSelectionChange: () => {},
        records, alignmentLength: 1000, chartWidth: 1000,
        horizontalScrollRef, listRef,
      });
      return <div role="region" aria-label="Genome" onMouseDown={handleMouseDown}>
        <div ref={horizontalScrollRef} />
        <VariableSizeList ref={listRef} outerRef={outerRef} height={100} width={400}
          itemCount={records.length} itemSize={() => 500} initialScrollOffset={200}>
          {({ index, style }) => <div style={style}>{records[index].name}</div>}
        </VariableSizeList>
      </div>;
    }
    render(<Harness />);
    const viewport = screen.getByRole('region', { name: 'Genome' });
    expect(outerRef.current!.scrollTop).toBe(200);
    fireEvent.mouseDown(viewport, { clientX: 300, clientY: 100 });
    fireEvent.mouseMove(window, { clientX: 300, clientY: pointerY });
    expect(outerRef.current!.scrollTop).toBe(expectedTop);
    fireEvent.mouseUp(window, { clientX: 300, clientY: pointerY });
    fireEvent.mouseMove(window, { clientX: 300, clientY: 10 });
    expect(outerRef.current!.scrollTop).toBe(expectedTop);
  });
});

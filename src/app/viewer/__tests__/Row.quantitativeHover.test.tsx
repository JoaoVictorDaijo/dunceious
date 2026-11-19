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
import { afterEach, expect, it, vi } from 'vitest';
import { act, render, installCanvasRecorder } from '@/src/app/testing/renderHarness';
import type { SeqRecord } from '@/src/domain/bio/types';
import { Row, type RowData } from '../Row';
import { computeRecordLayouts } from '../layout';

afterEach(() => vi.restoreAllMocks());

function setup(record: SeqRecord) {
  const layout = computeRecordLayouts([record], { showAnnotations: false, translationVisible: false, showTracks: true })[0];
  const setTooltip = vi.fn();
  const data: RowData = {
    recordLayouts: [layout], alignmentLength: record.sequence.length, scrollX: 0, zoomLevel: 8,
    viewportWidth: record.sequence.length * 8, persistentSelection: null, showAnnotations: false,
    showTranslation: false, searchResultsByRecord: {}, searchResults: [], currentSearchIdx: -1,
    onSelectionChange: vi.fn(), onContextMenu: vi.fn(), onViewDetails: vi.fn(), setTooltip,
    showConservation: false, conservationScores: [], quantValueRanges: {}, showTracks: true,
    basesOpenness: 0, focusedRegion: null, comparison: null,
  };
  return { layout, setTooltip, data };
}

function move(track: Element, position: number, y = 8) {
  act(() => track.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: position * 8, clientY: y })));
}

it('bounds lane hover work with many short intervals and long overlaps while listing every match', () => {
  const recorder = installCanvasRecorder();
  const shortCount = 128, longCount = 128;
  const record: SeqRecord = { id: 'r', name: 'r', sequence: 'A'.repeat(256), features: [], tracks: [{
    id: 'q', name: 'Coverage', kind: 'interval', data: [
      ...Array.from({ length: shortCount }, (_, i) => ({ start: i, end: i + 1, value: 1 })),
      ...Array.from({ length: longCount }, () => ({ start: 0, end: 256, value: 2 })),
    ],
  }] };
  const h = setup(record);
  const lane = h.layout.trackLayouts[0].packedRows[0];
  expect(lane).toEqual(Array.from({ length: shortCount }, (_, i) => i));
  let reads = 0;
  h.layout.trackLayouts[0].packedRows[0] = new Proxy(lane, { get(target, key, receiver) {
    if (typeof key === 'string' && /^\d+$/.test(key)) reads++;
    return Reflect.get(target, key, receiver);
  } });
  const view = render(<Row index={0} style={{}} data={h.data} />);
  reads = 0;
  move(view.container.querySelector('[data-quantitative-track]')!, shortCount - 0.5);
  expect(h.setTooltip.mock.lastCall?.[0].content).toContain(`${longCount + 1} overlapping intervals`);
  expect(recorder.strokeRects().map(stroke => stroke.rect[0])).toEqual([(shortCount - 1) * 8 + 0.5]);
  expect(reads).toBeLessThan(6 * (shortCount + longCount));
});


it('redraws only tracks whose hovered source changes and keeps tooltip positions current', () => {
  installCanvasRecorder();
  const clears = new Map<HTMLCanvasElement, number>();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    return new Proxy({ clearRect: () => clears.set(this, (clears.get(this) ?? 0) + 1) }, {
      get(target, key) { return key in target ? Reflect.get(target, key) : () => {}; },
      set() { return true; },
    }) as unknown as CanvasRenderingContext2D;
  });
  const record: SeqRecord = { id: 'r', name: 'r', sequence: 'A'.repeat(100), features: [], tracks: [
    { id: 'q', name: 'Coverage', data: [{ start: 0, end: 10, value: 2 }, { start: 10, end: 20, value: 4 }] },
    { id: 'other', name: 'Other', data: [{ start: 0, end: 100, value: 3 }] },
  ] };
  const h = setup(record);
  const view = render(<Row index={0} style={{}} data={h.data} />);
  const track = view.container.querySelector('[data-quantitative-track="q"]')!;
  const other = view.container.querySelector('[data-quantitative-track="other"]')!;
  const canvas = track.querySelector('canvas')!;
  const otherCanvas = other.querySelector('canvas')!;
  expect([clears.get(canvas), clears.get(otherCanvas)]).toEqual([1, 1]);

  move(track, 1);
  const firstHoverDraws = clears.get(canvas)!;
  expect(firstHoverDraws).toBe(2);
  move(track, 2);
  expect(clears.get(canvas)).toBe(firstHoverDraws);
  expect(h.setTooltip.mock.lastCall?.[0].content).toContain('Pos: 3');
  expect(clears.get(otherCanvas)).toBe(1);

  move(track, 11);
  expect([clears.get(canvas), clears.get(otherCanvas)]).toEqual([3, 1]);
  move(other, 1);
  expect([clears.get(canvas), clears.get(otherCanvas)]).toEqual([4, 2]);
  act(() => other.dispatchEvent(new MouseEvent('pointerout', { bubbles: true })));
  expect([clears.get(canvas), clears.get(otherCanvas)]).toEqual([4, 3]);
  expect(h.setTooltip.mock.lastCall?.[0]).toBeNull();
});

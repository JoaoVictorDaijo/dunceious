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
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, render, installCanvasRecorder, stubResizeObserver } from '@/src/app/testing/renderHarness';
import type { SeqRecord } from '@/src/domain/bio/types';
import GenomeViewer from '../GenomeViewer';

beforeEach(() => {
  installCanvasRecorder();
  stubResizeObserver();
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(500);
});
afterEach(() => { vi.restoreAllMocks(); });

const records: SeqRecord[] = [{
  id: 'r', name: 'r', sequence: 'A'.repeat(1000),
  features: [{ type: 'gene', name: 'Feature', start: 0, end: 300, strand: 1 }],
  tracks: [{ id: 'coverage', name: 'Coverage', kind: 'line', data: [{ start: 0, end: 1000, value: 7 }] }],
}];

function setup() {
  const view = render(<GenomeViewer onClearSelection={() => {}} comparisonMenu={null}
    records={records} consensus={records[0].sequence} showAnnotations showTracks
    showTranslation={false} showConservation={false} dragMode="select" activeSelection={null}
    onSelectionChange={() => {}} onExportFasta={() => {}} onAddAnnotation={() => {}}
    searchResults={[]} currentSearchIdx={-1} />);
  const annotation = view.container.querySelector('[data-annotation-part]')!;
  const track = view.getByText('Coverage').parentElement!.parentElement!;
  const row = view.container.querySelector('[data-viewer-record="r"]')!;
  return { ...view, annotation, track, row };
}

function pointer(target: Element, type: string, pointerType: string) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 200, clientY: 100 });
  Object.defineProperties(event, { pointerId: { value: 1 }, pointerType: { value: pointerType } });
  act(() => { target.dispatchEvent(event); });
}

const touchSequence = [
  'mousemove', 'pointerover', 'pointerenter', 'mouseover', 'mouseenter', 'pointerdown',
  'mousedown', 'pointerup', 'mouseup', 'pointerout', 'pointerleave', 'mouseout', 'mouseleave', 'click',
];

function touchTap(target: Element, afterEvent: () => void = () => {}) {
  for (const type of touchSequence) {
    pointer(target, type, 'touch');
    afterEvent();
  }
}

const surfaces = [
  { key: 'annotation', hover: 'pointerover', leave: 'pointerout', tooltip: /Double-click to select region/ },
  { key: 'track', hover: 'pointermove', leave: 'pointerout', tooltip: /Value: 7/ },
] as const;

it('touch tap on an annotation never shows the tooltip', () => {
  const h = setup();
  touchTap(h.annotation, () => expect(h.queryByText('Double-click to select region')).toBeNull());
});

it('touch tap on a track never shows the tooltip', () => {
  const h = setup();
  touchTap(h.track, () => expect(h.queryByText(/Value:/)).toBeNull());
  pointer(h.track, 'pointermove', 'touch');
  expect(h.queryByText(/Value:/)).toBeNull();
});

it('mouse hover shows the tooltip on both surfaces', () => {
  const h = setup();
  for (const surface of surfaces) {
    pointer(h[surface.key], surface.hover, 'mouse');
    expect(h.getByText(surface.tooltip)).toBeTruthy();
    pointer(h[surface.key], surface.leave, 'mouse');
    expect(h.queryByText(surface.tooltip)).toBeNull();
  }
});

it('mouse hover after a touch tap shows the tooltip', () => {
  const h = setup();
  for (const surface of surfaces) {
    touchTap(h[surface.key]);
    pointer(h[surface.key], surface.hover, 'mouse');
    expect(h.getByText(surface.tooltip)).toBeTruthy();
    pointer(h[surface.key], surface.leave, 'mouse');
  }
});

it('pen hover shows the tooltip', () => {
  const h = setup();
  for (const surface of surfaces) {
    pointer(h[surface.key], surface.hover, 'pen');
    expect(h.getByText(surface.tooltip)).toBeTruthy();
    pointer(h[surface.key], surface.leave, 'pen');
    expect(h.queryByText(surface.tooltip)).toBeNull();
  }
});

it('a touch tap hides a tooltip a mouse opened', () => {
  const h = setup();
  for (const surface of surfaces) {
    pointer(h[surface.key], surface.hover, 'mouse');
    expect(h.getByText(surface.tooltip)).toBeTruthy();
    pointer(h.row, 'pointerdown', 'touch');
    expect(h.queryByText(surface.tooltip)).toBeNull();
    pointer(h.row, 'pointerup', 'touch');
  }
});

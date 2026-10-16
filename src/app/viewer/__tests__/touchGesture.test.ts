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

import { describe, expect, it } from 'vitest';
import { nextGesture, pinchViewport, TouchArbiter, TOUCH_SLOP_PX, type GestureEvent, type GestureState } from '../touchGesture';

const view = { zoom: 2, scrollLeft: 100, sequenceLeft: 120, minZoom: 0.5, maxZoom: 150 };
const pending: GestureState = { kind: 'pending', id: 1, startX: 200, startY: 100 };
const panning: GestureState = { kind: 'panning', id: 1, lastX: 200, lastY: 100 };
function event(type: GestureEvent['type'], id: number, points: [number, number, number][]): GestureEvent {
  const pointers = new Map(points.map(([key, x, y]) => [key, { x, y }]));
  return { type, id, x: pointers.get(id)?.x ?? 200, y: pointers.get(id)?.y ?? 100, pointers };
}
const pinch = { anchorColumn: 100, midpointX: 100, startZoom: 2, startDistance: 40, distance: 80, minZoom: 0.5, maxZoom: 150 };

describe('pinch viewport', () => {
  it('keeps the anchor under the spreading midpoint', () => {
    expect(pinchViewport(pinch)).toEqual({ zoom: 4, scrollLeft: 300 });
  });
  it('pans when the midpoint moves with equal distance', () => {
    expect(pinchViewport({ ...pinch, distance: 40, midpointX: 130 })).toEqual({ zoom: 2, scrollLeft: 70 });
  });
  it.each([[1, 0.5, -50], [4000, 150, 14900]])('anchors at the zoom limit for distance %s', (distance, zoom, scrollLeft) => {
    expect(pinchViewport({ ...pinch, distance })).toEqual({ zoom, scrollLeft });
  });
  it('keeps coincident fingers finite', () => {
    expect(pinchViewport({ ...pinch, startDistance: 0, distance: 0 })).toEqual({ zoom: 2, scrollLeft: 100 });
  });
});

describe('gesture transitions', () => {
  it('starts pending and leaves a 5 px move pending', () => {
    expect(TOUCH_SLOP_PX).toBe(6);
    expect(nextGesture({ kind: 'idle' }, event('down', 1, [[1, 200, 100]]), view).state).toEqual(pending);
    expect(nextGesture(pending, event('move', 1, [[1, 203, 104]]), view)).toEqual({ state: pending, actions: [] });
  });
  it('captures then pans the full displacement at 7 px', () => {
    expect(nextGesture(pending, event('move', 1, [[1, 207, 100]]), view)).toEqual({
      state: { kind: 'panning', id: 1, lastX: 207, lastY: 100 },
      actions: [{ type: 'capture', id: 1 }, { type: 'pan', dx: 7, dy: 0 }],
    });
  });
  it.each([pending, panning])('starts a pinch from $kind and captures both fingers', state => {
    expect(nextGesture(state, event('down', 2, [[1, 200, 100], [2, 240, 100]]), view)).toEqual({
      state: { kind: 'pinching', ids: [1, 2], anchorColumn: 100, startZoom: 2, startDistance: 40, lastMidY: 100 },
      actions: [{ type: 'capture', id: 1 }, { type: 'capture', id: 2 }],
    });
  });
  it('pans incrementally on both axes', () => {
    expect(nextGesture(panning, event('move', 1, [[1, 180, 70]]), view).actions).toEqual([{ type: 'pan', dx: -20, dy: -30 }]);
  });
  it('zooms at the clamped anchor and scrolls with the vertical midpoint', () => {
    const state = nextGesture(pending, event('down', 2, [[1, 200, 100], [2, 240, 100]]), view).state;
    expect(nextGesture(state, event('move', 2, [[1, 180, 120], [2, 260, 120]]), { ...view, maxZoom: 3 }).actions)
      .toEqual([{ type: 'zoom', zoom: 3, scrollLeft: 200, dy: 20 }]);
  });
  it('does nothing for a tap but suppresses the pan release click', () => {
    expect(nextGesture(pending, event('up', 1, []), view)).toEqual({ state: { kind: 'idle' }, actions: [] });
    expect(nextGesture(panning, event('up', 1, []), view)).toEqual({ state: { kind: 'idle' }, actions: [{ type: 'suppressClick' }] });
  });
  it('ends on a third finger and ignores motion until every finger lifts', () => {
    const state = nextGesture(pending, event('down', 2, [[1, 200, 100], [2, 240, 100]]), view).state;
    const ended = nextGesture(state, event('down', 3, [[1, 200, 100], [2, 240, 100], [3, 300, 100]]), view);
    expect(ended).toEqual({ state: { kind: 'ended' }, actions: [{ type: 'suppressClick' }] });
    expect(nextGesture(ended.state, event('move', 1, [[1, 250, 100]]), view)).toEqual({ state: { kind: 'ended' }, actions: [] });
    expect(nextGesture(ended.state, event('up', 1, []), view).state).toEqual({ kind: 'idle' });
  });
  it('ends when a pinch finger lifts and does not resume one finger pan', () => {
    const state = nextGesture(pending, event('down', 2, [[1, 200, 100], [2, 240, 100]]), view).state;
    const ended = nextGesture(state, event('up', 2, [[1, 200, 100]]), view);
    expect(ended).toEqual({ state: { kind: 'ended' }, actions: [{ type: 'suppressClick' }] });
    expect(nextGesture(ended.state, event('move', 1, [[1, 150, 100]]), view).actions).toEqual([]);
  });
  it('cancel ends a gesture until remaining pointers lift', () => {
    expect(nextGesture(panning, event('cancel', 1, [[2, 240, 100]]), view)).toEqual({ state: { kind: 'ended' }, actions: [{ type: 'suppressClick' }] });
  });
});

describe('surface arbitration', () => {
  it.each(['rows', 'minimap'] as const)('%s owns until its last finger lifts; rejected ids stay rejected', surface => {
    const arbiter = new TouchArbiter();
    const other = surface === 'rows' ? 'minimap' : 'rows';
    expect(arbiter.claim(surface, 1)).toBe(true);
    expect(arbiter.claim(surface, 2)).toBe(true);
    expect(arbiter.claim(other, 3)).toBe(false);
    expect(arbiter.owner()).toBe(surface);
    expect(arbiter.owns(3)).toBe(false);
    arbiter.release(1);
    expect(arbiter.owner()).toBe(surface);
    arbiter.release(2);
    expect(arbiter.owner()).toBeNull();
    expect(arbiter.claim(other, 3)).toBe(false);
    expect(arbiter.claim(other, 4)).toBe(true);
    arbiter.release(3);
    arbiter.release(4);
    expect(arbiter.claim(other, 3)).toBe(true);
  });
});

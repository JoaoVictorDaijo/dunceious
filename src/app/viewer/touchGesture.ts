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

export const TOUCH_SLOP_PX = 6;

export function pinchViewport(p: {
  anchorColumn: number; midpointX: number; startZoom: number; startDistance: number;
  distance: number; minZoom: number; maxZoom: number;
}): { zoom: number; scrollLeft: number } {
  const ratio = p.startDistance > 0 ? p.distance / p.startDistance : 1;
  const zoom = Math.min(p.maxZoom, Math.max(p.minZoom, p.startZoom * ratio));
  return { zoom, scrollLeft: p.anchorColumn * zoom - p.midpointX };
}

export type TouchSurface = 'rows' | 'minimap';

export class TouchArbiter {
  private surface: TouchSurface | null = null;
  private pointers = new Set<number>();
  private rejected = new Set<number>();

  claim(surface: TouchSurface, pointerId: number): boolean {
    if (this.rejected.has(pointerId)) return false;
    if (this.surface !== null && this.surface !== surface) {
      this.rejected.add(pointerId);
      return false;
    }
    this.surface = surface;
    this.pointers.add(pointerId);
    return true;
  }

  release(pointerId: number): void {
    this.rejected.delete(pointerId);
    this.pointers.delete(pointerId);
    if (this.pointers.size === 0) this.surface = null;
  }

  owner(): TouchSurface | null { return this.surface; }
  owns(pointerId: number): boolean { return this.pointers.has(pointerId); }
}

export type GestureState =
  | { kind: 'idle' }
  | { kind: 'pending'; id: number; startX: number; startY: number }
  | { kind: 'panning'; id: number; lastX: number; lastY: number }
  | { kind: 'pinching'; ids: [number, number]; anchorColumn: number; startZoom: number; startDistance: number; lastMidY: number }
  | { kind: 'ended' };

export type GestureEvent = {
  type: 'down' | 'move' | 'up' | 'cancel'; id: number; x: number; y: number;
  pointers: Map<number, { x: number; y: number }>;
};
export type GestureAction =
  | { type: 'pan'; dx: number; dy: number }
  | { type: 'zoom'; zoom: number; scrollLeft: number; dy: number }
  | { type: 'capture'; id: number }
  | { type: 'suppressClick' };

type GestureView = { zoom: number; scrollLeft: number; sequenceLeft: number; minZoom: number; maxZoom: number };
type GestureResult = { state: GestureState; actions: GestureAction[] };

function midpoint(a: { x: number; y: number }, b: { x: number; y: number }) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(b.x - a.x, b.y - a.y) };
}

function startPinch(event: GestureEvent, view: GestureView): GestureResult {
  const ids = [...event.pointers.keys()] as [number, number];
  const mid = midpoint(event.pointers.get(ids[0])!, event.pointers.get(ids[1])!);
  return {
    state: { kind: 'pinching', ids, anchorColumn: (view.scrollLeft + mid.x - view.sequenceLeft) / view.zoom,
      startZoom: view.zoom, startDistance: mid.distance, lastMidY: mid.y },
    actions: ids.map(id => ({ type: 'capture', id })),
  };
}

function moveGesture(state: GestureState, event: GestureEvent, view: GestureView): GestureResult {
  if (state.kind === 'pinching') {
    const a = event.pointers.get(state.ids[0]);
    const b = event.pointers.get(state.ids[1]);
    if (!a || !b) return { state: { kind: 'ended' }, actions: [{ type: 'suppressClick' }] };
    const mid = midpoint(a, b);
    const viewport = pinchViewport({ ...state, midpointX: mid.x - view.sequenceLeft,
      distance: mid.distance, minZoom: view.minZoom, maxZoom: view.maxZoom });
    return { state: { ...state, lastMidY: mid.y }, actions: [{ type: 'zoom', ...viewport, dy: mid.y - state.lastMidY }] };
  }
  if ((state.kind !== 'pending' && state.kind !== 'panning') || state.id !== event.id) return { state, actions: [] };
  const dx = event.x - (state.kind === 'pending' ? state.startX : state.lastX);
  const dy = event.y - (state.kind === 'pending' ? state.startY : state.lastY);
  if (state.kind === 'pending' && Math.hypot(dx, dy) < TOUCH_SLOP_PX) return { state, actions: [] };
  const actions: GestureAction[] = state.kind === 'pending' ? [{ type: 'capture', id: event.id }] : [];
  actions.push({ type: 'pan', dx, dy });
  return { state: { kind: 'panning', id: event.id, lastX: event.x, lastY: event.y }, actions };
}

/** Capture-loss cancellation retains still-down pointers so an ended gesture cannot restart before release. */
export function nextGesture(state: GestureState, event: GestureEvent, view: GestureView): GestureResult {
  if (state.kind === 'ended') return { state: event.pointers.size === 0 ? { kind: 'idle' } : state, actions: [] };
  if (event.type === 'cancel' || event.type === 'up' || event.pointers.size > 2) {
    const actions: GestureAction[] = state.kind === 'panning' || state.kind === 'pinching' ? [{ type: 'suppressClick' }] : [];
    return { state: { kind: event.pointers.size === 0 ? 'idle' : 'ended' }, actions };
  }
  if (event.type === 'down' && event.pointers.size === 2) return startPinch(event, view);
  if (event.type === 'down' && state.kind === 'idle') {
    return { state: { kind: 'pending', id: event.id, startX: event.x, startY: event.y }, actions: [] };
  }
  return event.type === 'move' ? moveGesture(state, event, view) : { state, actions: [] };
}

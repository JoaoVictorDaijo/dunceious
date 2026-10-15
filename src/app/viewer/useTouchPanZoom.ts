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

import { useEffect, useRef, type RefObject } from 'react';
import type { VariableSizeList } from 'react-window';
import { MAX_ZOOM, SIDEBAR_WIDTH } from './constants';
import { nextGesture, type GestureAction, type GestureEvent, type GestureState, type TouchArbiter } from './touchGesture';

type TouchPanZoomParams = {
  containerRef: RefObject<HTMLDivElement | null>;
  horizontalScrollRef: RefObject<HTMLDivElement | null>;
  listRef: RefObject<VariableSizeList | null>;
  arbiter: TouchArbiter;
  zoomLevel: number;
  fitZoom: number;
  applyZoom: (zoom: number, left: number) => void;
};

function scrollList(list: VariableSizeList | null, dy: number) {
  const outer = (list as (VariableSizeList & { _outerRef?: HTMLDivElement }) | null)?._outerRef;
  if (outer && dy !== 0) list!.scrollTo(outer.scrollTop - dy);
}

function applyActions(actions: GestureAction[], container: HTMLDivElement, p: TouchPanZoomParams, suppress: () => void) {
  for (const action of actions) {
    if (action.type === 'capture') container.setPointerCapture(action.id);
    if (action.type === 'suppressClick') suppress();
    if (action.type === 'pan') {
      if (p.horizontalScrollRef.current) p.horizontalScrollRef.current.scrollLeft -= action.dx;
      scrollList(p.listRef.current, action.dy);
    }
    if (action.type === 'zoom') {
      p.applyZoom(action.zoom, action.scrollLeft);
      scrollList(p.listRef.current, action.dy);
    }
  }
}

function releaseClickGuard() {
  let until = 0;
  return {
    arm: () => { until = Date.now() + 500; },
    clear: () => { until = 0; },
    pending: () => until !== 0,
    click: (e: MouseEvent) => {
      // Older Safari emits MouseEvent clicks without an input type, so bound that fallback.
      if (until === 0 || Date.now() > until || ('pointerType' in e && e.pointerType !== 'touch')) return;
      until = 0;
      e.preventDefault();
      e.stopImmediatePropagation();
    },
  };
}

function attachTouchController(container: HTMLDivElement, latest: RefObject<TouchPanZoomParams>) {
  const pointers: GestureEvent['pointers'] = new Map();
  const observed = new Set<number>();
  const captured = new Set<number>();
  const arbiter = latest.current.arbiter;
  let state: GestureState = { kind: 'idle' };
  const releaseClick = releaseClickGuard();
  const transition = (event: PointerEvent, type: GestureEvent['type']) => {
    const p = latest.current;
    const result = nextGesture(state, { type, id: event.pointerId, x: event.clientX, y: event.clientY, pointers }, {
      zoom: p.zoomLevel, scrollLeft: p.horizontalScrollRef.current?.scrollLeft ?? 0,
      sequenceLeft: container.getBoundingClientRect().left + SIDEBAR_WIDTH, minZoom: p.fitZoom, maxZoom: MAX_ZOOM,
    });
    state = result.state;
    applyActions(result.actions, container, p, releaseClick.arm);
  };
  const down = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') return;
    e.preventDefault();
    observed.add(e.pointerId);
    if (!arbiter.claim('rows', e.pointerId)) return;
    if (pointers.size === 0) releaseClick.clear();
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    transition(e, 'down');
  };
  const move = (e: PointerEvent) => {
    if (e.pointerType !== 'touch' || !pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    transition(e, 'move');
  };
  const finish = (e: PointerEvent) => {
    if (e.pointerType !== 'touch' || !observed.delete(e.pointerId)) return;
    if (pointers.delete(e.pointerId)) {
      transition(e, e.type === 'pointerup' ? 'up' : 'cancel');
      if (releaseClick.pending()) releaseClick.arm();
    }
    captured.delete(e.pointerId);
    arbiter.release(e.pointerId);
  };
  const got = (e: PointerEvent) => {
    if (e.target === container && pointers.has(e.pointerId)) captured.add(e.pointerId);
  };
  const lost = (e: PointerEvent) => {
    // Implicit capture leaving a feature bubbles here before the container gets capture.
    if (e.target === container && captured.delete(e.pointerId) && pointers.has(e.pointerId)) transition(e, 'cancel');
  };
  const listeners = { pointerdown: down, pointermove: move, pointerup: finish, pointercancel: finish,
    gotpointercapture: got, lostpointercapture: lost };
  for (const [type, listener] of Object.entries(listeners)) container.addEventListener(type, listener as EventListener);
  container.addEventListener('click', releaseClick.click, true);
  // A genuine capture loss may leave the last release outside the rows.
  window.addEventListener('pointerup', finish);
  window.addEventListener('pointercancel', finish);
  return () => {
    for (const [type, listener] of Object.entries(listeners)) container.removeEventListener(type, listener as EventListener);
    container.removeEventListener('click', releaseClick.click, true);
    window.removeEventListener('pointerup', finish);
    window.removeEventListener('pointercancel', finish);
    observed.forEach(id => arbiter.release(id));
  };
}

export function useTouchPanZoom(p: TouchPanZoomParams): void {
  const latest = useRef(p);
  latest.current = p;
  useEffect(() => {
    const container = p.containerRef.current;
    if (container) return attachTouchController(container, latest);
  }, [p.containerRef, p.arbiter]);
}

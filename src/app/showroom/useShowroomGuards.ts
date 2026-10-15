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
import type { ExplainId } from './explanations';

type Explain = (id: ExplainId, anchor?: DOMRect) => void;

const LONG_PRESS_MS = 500;
const SLOP_PX = 6;
/** How long after its release a consumed press may still produce its click. */
const RELEASE_CLICK_MS = 1000;

const CAPTURE = { capture: true } as const;

function listen<E extends Event>(target: EventTarget, type: string, handler: (event: E) => void): () => void {
  target.addEventListener(type, handler as EventListener, CAPTURE);
  return () => target.removeEventListener(type, handler as EventListener, CAPTURE);
}

const pointRect = (x: number, y: number) => new DOMRect(x, y, 0, 0);

/** The keyboard menu key fires `contextmenu` at 0,0; anchor that on the focused element instead. */
function menuAnchor(event: MouseEvent): DOMRect {
  if ((event.clientX !== 0 || event.clientY !== 0) || !(event.target instanceof Element)) return pointRect(event.clientX, event.clientY);
  return event.target.getBoundingClientRect();
}

function stop(event: Event) {
  event.preventDefault();
  event.stopPropagation();
}

/** Text selection and the iOS long-press callout would expose the page instead of the workbench. */
function lockSelection(root: HTMLElement): () => void {
  const previous = root.getAttribute('style');
  root.style.setProperty('-webkit-touch-callout', 'none');
  root.style.setProperty('-webkit-user-select', 'none');
  root.style.userSelect = 'none';
  return () => { if (previous === null) root.removeAttribute('style'); else root.setAttribute('style', previous); };
}

/**
 * Every link to another origin explains instead of leaving. Listening on the
 * document in the capture phase covers portals, and the four event types cover
 * tap, keyboard activation, middle-click, the link menu and dragging a link out.
 */
function guardLinks(explain: Explain): () => void {
  const onLink = (event: Event) => {
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!(link instanceof HTMLAnchorElement)) return;
    let origin = 'null';
    try { origin = new URL(link.href, window.location.href).origin; } catch { /* an unparsable href leaves too */ }
    if (origin === window.location.origin) return;
    stop(event);
    explain('external-link', link.getBoundingClientRect());
  };
  const removers = (['click', 'auxclick', 'contextmenu', 'dragstart'] as const).map(type => listen(document, type, onLink));
  return () => removers.forEach(remove => remove());
}

type Press = { id: number; x: number; y: number; timer: ReturnType<typeof setTimeout> | null; explained: boolean };

/**
 * Right-clicks and long-presses explain the workbench's context menu. iOS fires
 * no `contextmenu` on a long-press, hence the timer. A long-press that fires owns
 * its touch until release: its moves would pan and its release click would run
 * the tapped feature's action over the explanation. A native `contextmenu` of
 * the same press is stopped without a second explanation.
 */
function guardPresses(root: HTMLElement, explain: Explain): () => void {
  const touches = new Set<number>();
  let press: Press | null = null;
  let consumed: number | null = null;
  let release: { x: number; y: number; until: number } | null = null;

  const cancelTimer = () => {
    if (press?.timer) clearTimeout(press.timer);
    if (press) press.timer = null;
  };
  const fire = (current: Press) => {
    current.timer = null;
    if (!current.explained) explain('context-menu', pointRect(current.x, current.y));
    current.explained = true;
    consumed = current.id;
  };
  const onDown = (event: PointerEvent) => {
    if (event.pointerType !== 'touch') return;
    touches.add(event.pointerId);
    if (touches.size > 1) { cancelTimer(); return; }
    const current: Press = { id: event.pointerId, x: event.clientX, y: event.clientY, timer: null, explained: false };
    current.timer = setTimeout(() => fire(current), LONG_PRESS_MS);
    press = current;
  };
  const onMove = (event: PointerEvent) => {
    if (event.pointerId === consumed) { event.stopPropagation(); return; }
    if (press?.timer && event.pointerId === press.id && Math.hypot(event.clientX - press.x, event.clientY - press.y) > SLOP_PX) cancelTimer();
  };
  const onEnd = (event: PointerEvent) => {
    touches.delete(event.pointerId);
    if (press?.id === event.pointerId) { cancelTimer(); press = null; }
    if (consumed === event.pointerId) {
      consumed = null;
      release = { x: event.clientX, y: event.clientY, until: Date.now() + RELEASE_CLICK_MS };
    }
  };
  const onMenu = (event: MouseEvent) => {
    stop(event);
    if (press) {
      if (!press.explained) explain('context-menu', menuAnchor(event));
      press.explained = true;
    } else if (!release || Date.now() > release.until) explain('context-menu', menuAnchor(event));
  };
  const onClick = (event: MouseEvent) => {
    if (!release) return;
    const own = Date.now() <= release.until && Math.hypot(event.clientX - release.x, event.clientY - release.y) <= 2 * SLOP_PX;
    release = null;
    if (own) stop(event);
  };
  const onRotate = () => { cancelTimer(); press = null; };

  const removers = [
    listen(root, 'pointerdown', onDown), listen(document, 'pointermove', onMove),
    listen(document, 'pointerup', onEnd), listen(document, 'pointercancel', onEnd),
    listen(root, 'contextmenu', onMenu), listen(document, 'click', onClick), listen(window, 'orientationchange', onRotate),
  ];
  return () => { cancelTimer(); removers.forEach(remove => remove()); };
}

/** Registers every showroom guard on mount and removes them on unmount. */
export function useShowroomGuards(rootRef: RefObject<HTMLElement | null>, onExplain: Explain): void {
  const explainRef = useRef(onExplain);
  useEffect(() => { explainRef.current = onExplain; }, [onExplain]);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const explain: Explain = (id, anchor) => explainRef.current(id, anchor);
    const cleanups = [lockSelection(root), guardLinks(explain), guardPresses(root, explain)];
    return () => cleanups.forEach(cleanup => cleanup());
  }, [rootRef]);
}

/** Touch selection is not built yet, so the first touch drag in Select mode says how selecting works. */
export function useSelectDragNotice(areaRef: RefObject<HTMLElement | null>, active: boolean, onExplain: Explain): void {
  const shown = useRef(false);
  const explainRef = useRef(onExplain);
  useEffect(() => { explainRef.current = onExplain; }, [onExplain]);
  useEffect(() => {
    const area = areaRef.current;
    if (!area || !active) return;
    let start: { id: number; x: number; y: number } | null = null;
    const onDown = (event: PointerEvent) => { if (event.pointerType === 'touch') start = { id: event.pointerId, x: event.clientX, y: event.clientY }; };
    const onMove = (event: PointerEvent) => {
      if (shown.current || !start || event.pointerId !== start.id) return;
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) <= SLOP_PX) return;
      shown.current = true;
      explainRef.current('select-mode', pointRect(event.clientX, event.clientY));
    };
    const removers = [listen(area, 'pointerdown', onDown), listen(area, 'pointermove', onMove)];
    return () => removers.forEach(remove => remove());
  }, [areaRef, active]);
}

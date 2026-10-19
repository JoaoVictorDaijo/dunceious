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
import { TOUCH_SLOP_PX } from '@/src/app/viewer/touchGesture';
import type { ExplainId } from './explanations';

type Explain = (id: ExplainId, anchor?: DOMRect) => void;

const LONG_PRESS_MS = 500;
/** How long after its release a consumed press may still produce its click; the next press ends the wait. */
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

/** Fields keep the browser's own long-press and menu: selecting, pasting, the keyboard. */
const inField = (target: EventTarget | null) =>
  target instanceof Element && target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') !== null;

/** The viewer pans once a finger moves `TOUCH_SLOP_PX`, so a press that far is a pan, not a long-press. */
const pastSlop = (dx: number, dy: number) => Math.hypot(dx, dy) >= TOUCH_SLOP_PX;

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

/** The workbench's file inputs are told apart by their labels ("Import annotations files", "Load project file", ...). */
const INGEST_BY_LABEL: [RegExp, ExplainId][] = [
  [/annotation/i, 'ingest-annotations'],
  [/aligned/i, 'ingest-alignment'],
  [/project/i, 'ingest-project'],
];

/** An unlabelled input (the drop zones') takes the sequences explanation, the one every drop zone in the showroom opens. */
function ingestIdFor(input: HTMLInputElement): ExplainId {
  const label = input.getAttribute('aria-label') ?? '';
  return INGEST_BY_LABEL.find(([pattern]) => pattern.test(label))?.[1] ?? 'ingest-sequences';
}

/**
 * Backstop behind the showroom's `chooseFile` redirection: any click that would
 * reach a file input — a `<label for>`, or a hidden input a control activates
 * through `.click()`, which dispatches a cancelable click — is cancelled, so no
 * real picker can open. Capture on the document covers the portalled dialogs.
 */
function guardFilePickers(explain: Explain): () => void {
  return listen(document, 'click', (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || target.type !== 'file') return;
    stop(event);
    explain(ingestIdFor(target), target.getBoundingClientRect());
  });
}

type Press = { id: number; x: number; y: number; timer: ReturnType<typeof setTimeout> | null; explained: boolean };

/** The Hub, its toolbar in the top bar and the dialogs portalled over the showroom, where the workbench has no context menu to explain. */
const QUIET_AREAS = '[data-showroom-hub], [data-showroom-portals]';

type Zone = 'viewer' | 'quiet';

/**
 * Right-clicks and long-presses in the viewer explain the workbench's context
 * menu. iOS fires no `contextmenu` on a long-press, hence the timer. A long-press
 * that fires owns its touch until release: its moves would pan and its release
 * click would run the tapped feature's action over the explanation. A native
 * `contextmenu` of the same press is stopped without a second explanation.
 * In the quiet areas the browser's menu is suppressed and nothing else happens,
 * so the press's click still lands; the root's `-webkit-touch-callout` covers iOS.
 */
function guardPresses(root: HTMLElement, workspace: HTMLElement, explain: Explain): () => void {
  const touches = new Set<number>();
  let press: Press | null = null;
  let consumed: number | null = null;
  let release: { x: number; y: number; until: number } | null = null;

  const zoneOf = (target: EventTarget | null): Zone | null => {
    if (!(target instanceof Element) || inField(target)) return null;
    if (target.closest(QUIET_AREAS)) return 'quiet';
    return workspace.contains(target) ? 'viewer' : null;
  };

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
  const onAnyDown = () => { release = null; };
  const onDown = (event: PointerEvent) => {
    if (event.pointerType !== 'touch' || zoneOf(event.target) !== 'viewer') return;
    touches.add(event.pointerId);
    if (touches.size > 1) { cancelTimer(); return; }
    const current: Press = { id: event.pointerId, x: event.clientX, y: event.clientY, timer: null, explained: false };
    current.timer = setTimeout(() => fire(current), LONG_PRESS_MS);
    press = current;
  };
  const onMove = (event: PointerEvent) => {
    if (event.pointerId === consumed) { event.stopPropagation(); return; }
    if (press?.timer && event.pointerId === press.id && pastSlop(event.clientX - press.x, event.clientY - press.y)) cancelTimer();
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
    const zone = zoneOf(event.target);
    if (zone === null) return;
    if (zone === 'quiet') { event.preventDefault(); return; }
    stop(event);
    if (press) {
      if (!press.explained) explain('context-menu', menuAnchor(event));
      press.explained = true;
    } else if (!release || Date.now() > release.until) explain('context-menu', menuAnchor(event));
  };
  const onClick = (event: MouseEvent) => {
    if (!release) return;
    const own = Date.now() <= release.until && Math.hypot(event.clientX - release.x, event.clientY - release.y) <= 2 * TOUCH_SLOP_PX;
    release = null;
    if (own) stop(event);
  };
  const onRotate = () => { cancelTimer(); press = null; };

  const removers = [
    listen(document, 'pointerdown', onAnyDown), listen(root, 'pointerdown', onDown), listen(document, 'pointermove', onMove),
    listen(document, 'pointerup', onEnd), listen(document, 'pointercancel', onEnd),
    listen(root, 'contextmenu', onMenu), listen(document, 'click', onClick), listen(window, 'orientationchange', onRotate),
  ];
  return () => { cancelTimer(); removers.forEach(remove => remove()); };
}

/**
 * Registers every showroom guard on mount and removes them on unmount: no text
 * selection on the root, links and file inputs guarded on the whole document, and context menus
 * and long-presses guarded in the workspace (viewer and Hub) and the portalled
 * dialogs, but not in the chrome around them. `workspaceRef` must stay mounted
 * while the switcher swaps the viewer for the Hub.
 */
export function useShowroomGuards(rootRef: RefObject<HTMLElement | null>, workspaceRef: RefObject<HTMLElement | null>, onExplain: Explain): void {
  const explainRef = useRef(onExplain);
  useEffect(() => { explainRef.current = onExplain; }, [onExplain]);
  useEffect(() => {
    const root = rootRef.current;
    const workspace = workspaceRef.current;
    if (!root || !workspace) return;
    const explain: Explain = (id, anchor) => explainRef.current(id, anchor);
    const cleanups = [lockSelection(root), guardLinks(explain), guardFilePickers(explain), guardPresses(root, workspace, explain)];
    return () => cleanups.forEach(cleanup => cleanup());
  }, [rootRef, workspaceRef]);
}

const PROJECT_KEYS = new Set(['s', 'o']);
const PROJECT_CODES = new Set(['KeyS', 'KeyO']);

/**
 * Ctrl/⌘+S and Ctrl/⌘+O would open the browser's Save Page and Open File dialogs,
 * in portrait too; in the workbench they save and open a project, so they explain
 * that where an explanation can show. Browsers key these shortcuts off the typed
 * letter on any Latin layout, so `code` is consulted only when the layout types
 * something else (Cyrillic, Greek): matching it as well would catch Dvorak's and
 * Colemak's physical S/O keys, blocking Ctrl+R. The capture phase
 * reaches keys that a dialog stops from bubbling, and a held key stays prevented
 * without explaining again.
 */
export function useProjectKeys(canExplain: boolean, onExplain: Explain): void {
  const explainRef = useRef(onExplain);
  const canExplainRef = useRef(canExplain);
  useEffect(() => { explainRef.current = onExplain; canExplainRef.current = canExplain; }, [onExplain, canExplain]);
  useEffect(() => listen<KeyboardEvent>(document, 'keydown', event => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
    const typesLatin = /^[a-z]$/i.test(event.key);
    if (typesLatin ? !PROJECT_KEYS.has(event.key.toLowerCase()) : !PROJECT_CODES.has(event.code)) return;
    event.preventDefault();
    if (!event.repeat && canExplainRef.current) explainRef.current('project');
  }), []);
}

/** A touch drag pans in either mode, so the first touch drag in Select mode says how selecting works in the workbench. */
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
      if (!pastSlop(event.clientX - start.x, event.clientY - start.y)) return;
      shown.current = true;
      explainRef.current('select-mode', pointRect(event.clientX, event.clientY));
    };
    const removers = [listen(area, 'pointerdown', onDown), listen(area, 'pointermove', onMove)];
    return () => removers.forEach(remove => remove());
  }, [areaRef, active]);
}

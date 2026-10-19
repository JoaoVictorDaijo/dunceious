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

import { useCallback, useEffect, useRef, type RefObject } from 'react';

const CONTROL = 'button, a[href], input, label, [role="button"]';
/** A press older than this did not cause the callback now asking for an anchor. */
const PRESS_MS = 1000;

/**
 * Where to anchor an explanation that a reused component asks for through a plain
 * callback, without the event: the control under the latest press, else the
 * point pressed, else the focused control (keyboard activation).
 */
export function usePressAnchor(rootRef: RefObject<HTMLElement | null>): () => DOMRect | undefined {
  const press = useRef<{ x: number; y: number; target: Element | null; at: number } | null>(null);
  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      press.current = { x: event.clientX, y: event.clientY, target: event.target instanceof Element ? event.target : null, at: Date.now() };
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, []);
  return useCallback(() => {
    const latest = press.current;
    if (latest && Date.now() - latest.at <= PRESS_MS) {
      const control = latest.target?.closest(CONTROL);
      return control ? control.getBoundingClientRect() : new DOMRect(latest.x, latest.y, 0, 0);
    }
    const focused = document.activeElement;
    return focused instanceof HTMLElement && focused !== document.body && rootRef.current?.contains(focused) ? focused.getBoundingClientRect() : undefined;
  }, [rootRef]);
}

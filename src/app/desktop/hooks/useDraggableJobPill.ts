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

import { useCallback, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import { clampPosition, movePosition, restorePosition, type FloatingPosition } from '@/src/app/shared/logic/floatingPosition';

// The monitor unmounts the pill; module memory retains its position only for this page load.
let rememberedPosition: FloatingPosition | null = null;
const viewportSize = () => ({ width: window.innerWidth, height: window.innerHeight });

function usePillPosition(ref: RefObject<HTMLDivElement | null>) {
  const [position, setPosition] = useState<FloatingPosition | null>(null);
  const current = useRef(rememberedPosition);
  const update = useCallback((next: FloatingPosition) => {
    current.current = next;
    rememberedPosition = next;
    setPosition(previous => previous?.x === next.x && previous.y === next.y ? previous : next);
  }, []);

  useLayoutEffect(() => {
    const element = ref.current!;
    const measure = () => update(restorePosition(current.current, element.getBoundingClientRect(), viewportSize()));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [ref, update]);

  return { position, current, update };
}

interface PillDrag {
  pointerId: number;
  start: FloatingPosition;
  origin: FloatingPosition;
  moved: boolean;
}

function usePillPointer(ref: RefObject<HTMLDivElement | null>, update: (next: FloatingPosition) => void) {
  const drag = useRef<PillDrag | null>(null);
  const suppressClick = useRef(false);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (!event.isPrimary || event.button !== 0 || drag.current) return;
    const rect = ref.current!.getBoundingClientRect();
    suppressClick.current = false;
    drag.current = {
      pointerId: event.pointerId, start: { x: event.clientX, y: event.clientY },
      origin: { x: rect.left, y: rect.top }, moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const session = drag.current;
    if (!session || session.pointerId !== event.pointerId) return;
    const dx = event.clientX - session.start.x;
    const dy = event.clientY - session.start.y;
    if (!session.moved && Math.hypot(dx, dy) < 5) return;
    session.moved = true;
    suppressClick.current = true;
    setDragging(true);
    event.preventDefault();
    update(clampPosition({ x: session.origin.x + dx, y: session.origin.y + dy }, ref.current!.getBoundingClientRect(), viewportSize()));
  };
  const endDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return {
    dragging, suppressClick,
    handlers: { onPointerDown, onPointerMove, onPointerUp: endDrag, onPointerCancel: endDrag, onLostPointerCapture: endDrag },
  };
}

export function useDraggableJobPill(onOpen: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const { position, current, update } = usePillPosition(ref);
  const { dragging, suppressClick, handlers } = usePillPointer(ref, update);
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ') suppressClick.current = false;
    if (event.altKey || event.ctrlKey || event.metaKey || !current.current) return;
    const next = movePosition(current.current, event.key, event.shiftKey, ref.current!.getBoundingClientRect(), viewportSize());
    if (!next) return;
    event.preventDefault();
    update(next);
  };
  const onClick = () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    onOpen();
  };

  return { ref, position, dragging, handlers: { ...handlers, onKeyDown, onClick } };
}

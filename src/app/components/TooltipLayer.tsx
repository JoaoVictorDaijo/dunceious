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

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const SHOW_DELAY_MS = 380;
/** After a tooltip closes, the next one opens instantly for this long (scanning a toolbar). */
const WARM_WINDOW_MS = 400;
const GAP = 8;
const EDGE = 8;
const TOOLTIP_ID = 'app-tooltip';

interface TipState {
  text: string;
  kbd?: string;
  anchor: DOMRect;
}

/**
 * One app-wide tooltip for every element carrying `data-tip` (and optionally
 * `data-tip-kbd` for a shortcut hint). Delegated listeners replace native
 * `title`, which waits ~1s, cannot be styled, and never shows on keyboard focus.
 * Rendered in a portal so overflow-hidden chrome (the status bar, the sidebar)
 * cannot clip it.
 */
const TooltipLayer: React.FC = () => {
  const [tip, setTip] = useState<TipState | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number; above: boolean } | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let current: HTMLElement | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastHiddenAt = 0;

    const open = (el: HTMLElement) => {
      const text = el.dataset.tip;
      if (!text) return;
      el.setAttribute('aria-describedby', TOOLTIP_ID);
      setTip({ text, kbd: el.dataset.tipKbd, anchor: el.getBoundingClientRect() });
    };

    const close = () => {
      clearTimeout(timer);
      if (current) {
        current.removeAttribute('aria-describedby');
        lastHiddenAt = Date.now();
      }
      current = null;
      setTip(null);
      setPos(null);
    };

    const arm = (el: HTMLElement | null) => {
      if (el === current) return;
      close();
      if (!el) return;
      current = el;
      const warm = Date.now() - lastHiddenAt < WARM_WINDOW_MS;
      timer = setTimeout(() => open(el), warm ? 0 : SHOW_DELAY_MS);
    };

    const tipTarget = (t: EventTarget | null) =>
      t instanceof Element ? t.closest<HTMLElement>('[data-tip]') : null;

    const onOver = (e: PointerEvent) => arm(tipTarget(e.target));
    const onFocus = (e: FocusEvent) => {
      // Only keyboard focus: a mouse click already showed (or dismissed) the tip.
      if (e.target instanceof Element && e.target.matches(':focus-visible')) arm(tipTarget(e.target));
    };
    const onLeaveWindow = (e: PointerEvent) => { if (!e.relatedTarget) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };

    document.addEventListener('pointerover', onOver);
    document.addEventListener('pointerout', onLeaveWindow);
    document.addEventListener('focusin', onFocus);
    document.addEventListener('focusout', close);
    document.addEventListener('pointerdown', close, true);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      close();
      document.removeEventListener('pointerover', onOver);
      document.removeEventListener('pointerout', onLeaveWindow);
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('focusout', close);
      document.removeEventListener('pointerdown', close, true);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, []);

  // Measure after render, then place below the anchor (above when it would leave
  // the viewport), clamped horizontally so edge buttons keep the tip on screen.
  useLayoutEffect(() => {
    if (!tip || !tipRef.current) return;
    const { width, height } = tipRef.current.getBoundingClientRect();
    const a = tip.anchor;
    const above = a.bottom + GAP + height > window.innerHeight - EDGE;
    const top = above ? a.top - GAP - height : a.bottom + GAP;
    const centered = a.left + a.width / 2 - width / 2;
    const left = Math.min(Math.max(EDGE, centered), window.innerWidth - width - EDGE);
    setPos({ left, top, above });
  }, [tip]);

  if (!tip) return null;
  return createPortal(
    <div
      ref={tipRef}
      id={TOOLTIP_ID}
      role="tooltip"
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999 }}
      className={`fixed z-[2000] max-w-[260px] pointer-events-none px-2.5 py-1.5 rounded-lg bg-slate-950/95 border border-slate-700/70 shadow-xl shadow-black/40 text-[11px] leading-snug font-medium text-slate-200 normal-case tracking-normal ${
        pos ? `animate-in fade-in zoom-in-95 duration-150 ${pos.above ? 'slide-in-from-bottom-1' : 'slide-in-from-top-1'}` : 'invisible'
      }`}
    >
      {tip.text}
      {tip.kbd && (
        <kbd className="ml-2 px-1.5 py-px rounded border border-slate-600 bg-slate-800 font-mono text-[10px] text-slate-300">
          {tip.kbd}
        </kbd>
      )}
    </div>,
    document.body,
  );
};

export default TooltipLayer;

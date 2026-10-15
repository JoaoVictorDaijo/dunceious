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

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { EXPLANATIONS, type ExplainId } from './explanations';

const MARGIN = 8;

type Placement = { kind: 'anchored'; top: number; left: number } | { kind: 'sheet' };

/** Below the control if it fits, else above, else a bottom sheet; always fully on screen. */
export function placeCallout(
  anchor: DOMRect | null,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
): Placement {
  if (!anchor || size.width > viewport.width - 2 * MARGIN) return { kind: 'sheet' };
  const below = anchor.bottom + MARGIN;
  const above = anchor.top - MARGIN - size.height;
  let top: number;
  if (below + size.height <= viewport.height - MARGIN) top = below;
  else if (above >= MARGIN) top = above;
  else return { kind: 'sheet' };
  const centred = anchor.left + anchor.width / 2 - size.width / 2;
  return { kind: 'anchored', top, left: Math.min(Math.max(centred, MARGIN), viewport.width - size.width - MARGIN) };
}

/**
 * A guide's note on what a control does in the workbench. The sky outline and
 * label keep it apart from the workbench's own tooltips and dialogs.
 */
export function ExplainCallout({ id, anchor, onClose }: { id: ExplainId; anchor: DOMRect | null; onClose: () => void }) {
  const { title, body } = EXPLANATIONS[id];
  const box = useRef<HTMLDivElement>(null);
  const gotIt = useRef<HTMLButtonElement>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);

  useLayoutEffect(() => {
    const rect = box.current?.getBoundingClientRect();
    setPlacement(placeCallout(anchor, { width: rect?.width ?? 0, height: rect?.height ?? 0 }, { width: window.innerWidth, height: window.innerHeight }));
  }, [anchor, id]);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    gotIt.current?.focus();
    return () => { if (opener?.isConnected) opener.focus(); };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const position = placement?.kind === 'anchored'
    ? { top: placement.top, left: placement.left }
    : placement ? { left: 0, right: 0, bottom: 0 } : { top: 0, left: 0, visibility: 'hidden' as const };
  const shape = placement?.kind === 'sheet'
    ? 'mx-auto max-w-lg rounded-t-2xl border-b-0 px-5 pb-4 pt-4'
    : 'w-[min(20rem,calc(100vw-16px))] rounded-2xl p-4';

  return (
    <div ref={box} role="dialog" aria-modal="false" aria-labelledby="showroom-explain-title" data-showroom-explain={id}
      style={{ position: 'fixed', ...position }}
      className={`z-[200] border border-sky-400/80 bg-slate-900 text-left shadow-[0_0_0_4px_rgba(56,189,248,0.12),0_18px_40px_rgba(2,6,23,0.6)] ${shape}`}>
      <p className="text-[11px] font-semibold text-sky-300">In the workbench</p>
      <h2 id="showroom-explain-title" className="mt-1 text-sm font-semibold text-white">{title}</h2>
      <p className="mt-2 text-[13px] leading-relaxed text-slate-300">{body}</p>
      <div className="mt-3 flex justify-end">
        <button ref={gotIt} type="button" onClick={onClose}
          className="rounded-lg border border-sky-400/60 px-3 py-1.5 text-xs font-semibold text-sky-200 hover:bg-sky-400/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400">
          Got it
        </button>
      </div>
    </div>
  );
}

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

import { memo, useMemo, useRef, type RefObject } from 'react';

export function railThumb(total: number, height: number, offset: number) {
  const available = Math.max(0, height - 12);
  const size = Math.min(available, Math.max(24, total ? height / total * available : available));
  const travel = available - size;
  const maxOffset = Math.max(0, total - height);
  return { size, top: 6 + (maxOffset ? Math.max(0, Math.min(offset, maxOffset)) / maxOffset * travel : 0), travel, maxOffset };
}

function OverviewRail({ indicatorRef, scrollRef, blocks, currentKey, total, offset, height, hits, onJump }: { indicatorRef?: RefObject<HTMLDivElement | null>; scrollRef: RefObject<HTMLDivElement | null>; currentKey?: string; blocks: { tip?: string; key: string; label: string; start: number; size: number }[]; total: number; offset: number; height: number; hits: number[]; onJump: (offset: number, key?: string) => void }) {
  const dragging = useRef<{ y: number; offset: number; pointer: number } | null>(null);
  const available = Math.max(0, height - 12);
  // Multiple matches on one rail pixel are visually indistinguishable.
  const ticks = useMemo(() => [...new Set(hits.map(hit => Math.floor(hit / total * available)))], [hits, total, available]);
  const positions = useMemo(() => blocks.map(block => ({ top: 6 + block.start / total * available, size: Math.max(0, block.size / total * available - 2) })), [blocks, total, available]);
  if (!total) return null;
  const thumb = railThumb(total, height, offset);
  const scrollTo = (value: number, key?: string) => onJump(Math.max(0, Math.min(value, thumb.maxOffset)), key);
  return <div aria-label="Overview rail" className="relative w-[14px] shrink-0 select-none border-l border-slate-200 bg-slate-50" onClick={event => {
    if (event.target !== event.currentTarget) return;
    const y = event.clientY - event.currentTarget.getBoundingClientRect().top;
    const current = scrollRef.current?.scrollTop ?? 0;
    scrollTo(current + (y < railThumb(total, height, current).top ? -height : height));
  }}>
    {blocks.map((block, i) => <button key={block.key} tabIndex={-1} aria-label={`Jump to ${block.label}`} data-tip={block.tip || block.label} aria-current={block.key === currentKey} className={`absolute left-[2px] right-[2px] rounded-sm ${block.key === currentKey ? 'bg-env opacity-100 shadow-[inset_0_0_0_1px_var(--env3)]' : i % 2 ? 'bg-slate-300' : 'bg-slate-200'} hover:bg-slate-400`} style={{ top: positions[i].top, height: positions[i].size }} onClick={() => scrollTo(block.start, block.key)} />)}
    {ticks.map(hit => <span aria-hidden="true" key={hit} className="pointer-events-none absolute left-1/2 right-0 h-[2px] bg-amber-500" style={{ top: hit + 6 }} />)}
    <div ref={indicatorRef} aria-hidden="true" data-scroll-thumb className="hub-scroll-thumb absolute left-0 right-0 rounded border-[1.5px] border-slate-900/45 bg-slate-900/[0.12]" style={{ top: thumb.top, height: thumb.size }} onPointerDown={event => {
      event.preventDefault(); event.stopPropagation();
      dragging.current = { y: event.clientY, offset: scrollRef.current?.scrollTop ?? 0, pointer: event.pointerId };
      event.currentTarget.setPointerCapture?.(event.pointerId);
      event.currentTarget.dataset.dragging = 'true';
    }} onPointerMove={event => {
      const drag = dragging.current;
      if (!drag || drag.pointer !== event.pointerId || !thumb.travel) return;
      scrollTo(drag.offset + (event.clientY - drag.y) / thumb.travel * thumb.maxOffset);
    }} onPointerUp={event => { dragging.current = null; delete event.currentTarget.dataset.dragging; event.currentTarget.releasePointerCapture?.(event.pointerId); }} onPointerCancel={event => { dragging.current = null; delete event.currentTarget.dataset.dragging; }} onLostPointerCapture={event => { dragging.current = null; delete event.currentTarget.dataset.dragging; }} />
  </div>;
}
export default memo(OverviewRail);

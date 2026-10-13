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

import { useMemo, type RefObject } from 'react';

export default function OverviewRail({ indicatorRef, blocks, total, offset, height, hits, onJump }: { indicatorRef?: RefObject<HTMLDivElement | null>; blocks: { key: string; label: string; start: number; size: number }[]; total: number; offset: number; height: number; hits: number[]; onJump: (offset: number) => void }) {
  // Multiple matches on one rail pixel are visually indistinguishable.
  const ticks = useMemo(() => [...new Set(hits.map(hit => Math.floor(hit / total * height)))], [hits, total, height]);
  if (!total) return null;
  return <div aria-label="Overview rail" className="relative w-5 shrink-0 border-l border-slate-200 bg-slate-50">
    {blocks.map((block, i) => <button key={block.key} aria-label={`Jump to ${block.label}`} className={`absolute left-1 right-1 rounded-sm ${i % 2 ? 'bg-slate-300' : 'bg-slate-200'} focus-visible:ring-2 focus-visible:ring-amber-500`} style={{ top: `${block.start / total * 100}%`, height: `${block.size / total * 100}%` }} onClick={() => onJump(block.start)} />)}
    {ticks.map((hit, i) => <span key={i} className="pointer-events-none absolute left-0 right-0 h-px bg-amber-500" style={{ top: `${hit / height * 100}%` }} />)}
    <div ref={indicatorRef} aria-label="Visible area" className="pointer-events-none absolute left-0 right-0 border border-slate-600 bg-slate-600/10" style={{ top: `${offset / total * 100}%`, height: `${Math.min(height, total) / total * 100}%` }} />
  </div>;
}

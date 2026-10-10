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

import React, { useId } from 'react';
import { ALIGNMENT_ENGINES } from '@/src/core/alignment';
import { isAlignmentActive, type RemoteAlignmentState } from '@/src/app/shared/logic/remoteAlignment';
import { useDraggableJobPill } from '@/src/app/desktop/hooks/useDraggableJobPill';
import { alignmentStage, elapsedSeconds, useJobClock } from './AlignmentJobMonitor';

export default function AlignmentJobPill({ state, onOpen }: { state: RemoteAlignmentState; onOpen: () => void }) {
  const active = isAlignmentActive(state);
  const now = useJobClock(active);
  const engine = 'engineId' in state ? ALIGNMENT_ENGINES.find(engine => engine.id === state.engineId)?.label : '';
  const label = state.phase === 'done' ? 'Aligned' : `${engine} · ${alignmentStage(state)}`;
  const descriptionId = useId();
  const { ref, position, dragging, handlers } = useDraggableJobPill(onOpen);

  return (
    <div ref={ref}
      style={position ? { left: position.x, top: position.y } : { bottom: 32, right: 20 }}
      className={`fixed z-40 max-h-[100vh] max-w-[100vw] overflow-hidden rounded-full border bg-slate-900/95 p-1 shadow-2xl backdrop-blur-md ${state.phase === 'failed' ? 'border-rose-500/60 text-rose-300' : 'border-slate-600 text-[var(--env)]'}`}>
      <button type="button" {...handlers} aria-label={`${label} — Open alignment job monitor`} aria-describedby={descriptionId}
        className={`flex max-w-full touch-none select-none items-center gap-2 rounded-full px-4 py-2 text-xs hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--env)] ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}>
        <i aria-hidden="true" className="fas fa-grip-vertical shrink-0 text-slate-500" />
        <i aria-hidden="true" className={`fas shrink-0 ${state.phase === 'done' ? 'fa-check' : state.phase === 'failed' ? 'fa-triangle-exclamation' : 'fa-circle'} ${active ? 'text-[8px] motion-safe:animate-pulse' : ''}`} />
        <span aria-hidden="true" className="truncate">{label}</span>
        <span aria-hidden="true" className="shrink-0">· {elapsedSeconds(state, now)} s</span>
      </button>
      <span id={descriptionId} className="sr-only">Drag or use arrow keys to move; hold Shift for larger steps. Press Enter to open the monitor.</span>
      <span role="status" aria-live="polite" className="sr-only">{label}</span>
    </div>
  );
}

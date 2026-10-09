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

import React from 'react';
import { ALIGNMENT_ENGINES } from '@/src/core/alignment';
import { isAlignmentActive, type RemoteAlignmentState } from '@/src/app/logic/remoteAlignment';
import { alignmentStage, elapsedSeconds, useJobClock } from './AlignmentJobMonitor';

export default function AlignmentJobPill({ state, onOpen }: { state: RemoteAlignmentState; onOpen: () => void }) {
  const active = isAlignmentActive(state);
  const now = useJobClock(active);
  const engine = 'engineId' in state ? ALIGNMENT_ENGINES.find(engine => engine.id === state.engineId)?.label : '';
  return (
    <div role="status" aria-live="polite" className={`fixed bottom-8 right-5 z-40 rounded-full border bg-slate-900/95 p-1 shadow-2xl backdrop-blur-md ${state.phase === 'failed' ? 'border-rose-500/60 text-rose-300' : 'border-slate-600 text-[var(--env)]'}`}>
      <button type="button" onClick={onOpen} className="flex items-center gap-2 rounded-full px-4 py-2 text-xs hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--env)]">
        <i aria-hidden="true" className={`fas ${state.phase === 'done' ? 'fa-check' : state.phase === 'failed' ? 'fa-triangle-exclamation' : 'fa-circle'} ${active ? 'text-[8px] motion-safe:animate-pulse' : ''}`} />
        <span>{state.phase === 'done' ? 'Aligned' : `${engine} · ${alignmentStage(state)}`}</span>
        <span aria-hidden="true">· {elapsedSeconds(state, now)} s</span>
      </button>
    </div>
  );
}

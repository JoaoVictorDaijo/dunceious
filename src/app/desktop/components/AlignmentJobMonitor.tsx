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

import React, { useEffect, useState } from 'react';
import { ALIGNMENT_ENGINES } from '@/src/core/alignment';
import { ALIGNMENT_STEPS, isAlignmentActive, type RemoteAlignmentState, type StepId } from '@/src/app/shared/logic/remoteAlignment';

export const STEP_LABELS: Record<StepId, string> = { validated: 'Validated', submitted: 'Submitted', queued: 'Queued at EBI', running: 'Aligning', fetching: 'Fetching result', applied: 'Applied' };
export function useJobClock(active: boolean): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}
export function alignmentStage(state: RemoteAlignmentState): string {
  switch (state.phase) {
    case 'submitting': return state.jobId ? 'Checking job status' : 'Submitting…';
    case 'queued': return 'Queued at EBI';
    case 'running': return 'Aligning';
    case 'fetching': return 'Fetching result';
    case 'applying': return 'Applying alignment';
    case 'done': return 'Aligned';
    case 'failed': return 'Alignment failed';
    default: return 'Align sequences';
  }
}
export function elapsedSeconds(state: RemoteAlignmentState, now: number): number {
  if (!('steps' in state)) return 0;
  if (state.phase === 'done') return Math.round(state.elapsed / 1000);
  const end = state.phase === 'failed' ? Math.max(state.startedAt, ...Object.values(state.steps).map(step => step.leftAt ?? state.startedAt)) : now;
  return Math.max(0, Math.floor((end - state.startedAt) / 1000));
}

export default function AlignmentJobMonitor({ state, now }: { state: RemoteAlignmentState; now: number }) {
  const [copyMessage, setCopyMessage] = useState('');
  if (!('steps' in state)) return null;
  const engine = ALIGNMENT_ENGINES.find(engine => engine.id === state.engineId)!;
  const icons = { pending: 'fa-circle', active: 'fa-circle-notch', done: 'fa-check', failed: 'fa-xmark', skipped: 'fa-minus' };
  const copyJob = async () => {
    try { await navigator.clipboard.writeText(state.jobId ?? ''); setCopyMessage('Copied'); }
    catch { setCopyMessage('Select the job ID to copy it.'); }
  };
  return (
    <div className="space-y-4">
      <p role="status" className="text-sm font-medium text-slate-200">{alignmentStage(state)}{state.phase === 'running' ? ` (${engine.label})` : ''}</p>
      <ol aria-label="Alignment steps" className="space-y-1">
        {ALIGNMENT_STEPS.map(id => {
          const step = state.steps[id];
          const detail = id === 'validated' ? `${engine.label} · ${state.sequenceCount} sequences · ${Math.ceil(state.bytes / 1000)} KB`
            : id === 'submitted' ? state.jobId : id === 'fetching' ? state.resultType : id === 'applied' && state.alignedLength !== undefined ? `${state.alignedLength} aligned columns` : undefined;
          const duration = step.enteredAt === undefined ? null : Math.max(0, Math.floor(((step.leftAt ?? now) - step.enteredAt) / 1000));
          return (
            <li key={id} data-step={id} data-status={step.status} className={`flex gap-3 rounded-lg px-3 py-2 ${step.status === 'failed' ? 'bg-rose-500/10 text-rose-300' : step.status === 'active' ? 'bg-slate-800 text-[var(--env)]' : 'text-slate-400'}`}>
              <i aria-hidden="true" className={`fas ${icons[step.status]} mt-1 text-xs ${step.status === 'active' ? 'motion-safe:animate-pulse' : ''}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2 text-sm"><span>{STEP_LABELS[id]}</span><span className="text-[10px] capitalize">{step.status === 'skipped' ? 'Skipped' : step.status}</span></div>
                {detail && <p className="mt-1 select-text break-all text-xs font-mono">{detail}</p>}
                {step.enteredAt !== undefined && <p className="mt-1 text-[10px] text-slate-500">{new Date(step.enteredAt).toLocaleTimeString()} · {duration} s</p>}
                {id === 'submitted' && state.jobId && <button type="button" onClick={() => { void copyJob(); }} className="mt-1 text-[10px] underline">Copy job ID</button>}
                {step.status === 'failed' && state.phase === 'failed' && <p role="alert" className="mt-2 whitespace-pre-wrap break-words text-xs">{state.detail}</p>}
              </div>
            </li>
          );
        })}
      </ol>
      {copyMessage && <p className="text-xs text-slate-400">{copyMessage}</p>}
      {state.phase === 'queued' && now - state.since >= 120000 && <p className="text-sm text-amber-200">EBI's queue is busy — you can keep waiting or cancel.</p>}
      {isAlignmentActive(state) && <p className="text-xs text-slate-500">{state.retryCount > 0 ? `Connection hiccup — retrying (${state.retryCount}/5)`
        : state.lastCheckedAt !== undefined ? `Last checked ${Math.max(0, Math.floor((now - state.lastCheckedAt) / 1000))} s ago${state.nextCheckAt !== undefined ? ` · next check in ${Math.max(0, Math.ceil((state.nextCheckAt - now) / 1000))} s` : ' · checking…'}` : 'Waiting for the first status check'}</p>}
      {isAlignmentActive(state) && <p className="text-xs text-slate-500">Cancelling stops waiting here. The job keeps running at EBI.</p>}
    </div>
  );
}

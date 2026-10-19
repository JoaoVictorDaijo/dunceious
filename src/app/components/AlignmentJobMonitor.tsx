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

import React, { useState } from 'react';
import { ALIGNMENT_ENGINES } from '@/src/core/alignment';
import { ALIGNMENT_STEPS, isAlignmentActive, type RemoteAlignmentState, type StepId } from '@/src/app/logic/remoteAlignment';

import JobMonitor from './JobMonitor';
import { useUiEffects } from './uiEffects';
export { useJobClock } from './JobMonitor';

export const STEP_LABELS: Record<StepId, string> = { validated: 'Validated', submitted: 'Submitted', queued: 'Queued at EBI', running: 'Aligning', fetching: 'Fetching result', applied: 'Applied' };
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
  // The job ID goes to the clipboard through the host, not straight to the browser: today a
  // showroom visitor never reaches this monitor because `ShowroomAlign` never leaves
  // `configuring`, but that is a state invariant, not a promise. `copyMessage` below is the
  // channel for both answers — '' when the host declines, the fallback advice when a real
  // write fails.
  const { copyText } = useUiEffects();
  const [copyMessage, setCopyMessage] = useState('');
  if (!('steps' in state)) return null;
  const engine = ALIGNMENT_ENGINES.find(engine => engine.id === state.engineId)!;
  const copyJob = async () => {
    try { setCopyMessage(await copyText(state.jobId ?? '') ? 'Copied' : ''); }
    catch { setCopyMessage('Select the job ID to copy it.'); }
  };
  const steps = ALIGNMENT_STEPS.map(id => {
    const step = state.steps[id];
    const detail = id === 'validated' ? `${engine.label} · ${state.sequenceCount} sequences · ${Math.ceil(state.bytes / 1000)} KB`
      : id === 'submitted' ? state.jobId : id === 'fetching' ? state.resultType : id === 'applied' && state.alignedLength !== undefined ? `${state.alignedLength} aligned columns` : undefined;
    return { ...step, id, label: STEP_LABELS[id], detail,
      extra: id === 'submitted' && state.jobId ? <button type="button" onClick={() => { void copyJob(); }} className="mt-1 text-[10px] underline">Copy job ID</button> : undefined,
      error: step.status === 'failed' && state.phase === 'failed' ? state.detail : undefined };
  });
  return (
    <JobMonitor status={<>{alignmentStage(state)}{state.phase === 'running' ? ` (${engine.label})` : ''}</>}
      steps={steps} stepsLabel="Alignment steps" now={now}>
      {copyMessage && <p className="text-xs text-slate-400">{copyMessage}</p>}
      {state.phase === 'queued' && now - state.since >= 120000 && <p className="text-sm text-amber-200">EBI's queue is busy — you can keep waiting or cancel.</p>}
      {isAlignmentActive(state) && <p className="text-xs text-slate-500">{state.retryCount > 0 ? `Connection hiccup — retrying (${state.retryCount}/5)`
        : state.lastCheckedAt !== undefined ? `Last checked ${Math.max(0, Math.floor((now - state.lastCheckedAt) / 1000))} s ago${state.nextCheckAt !== undefined ? ` · next check in ${Math.max(0, Math.ceil((state.nextCheckAt - now) / 1000))} s` : ' · checking…'}` : 'Waiting for the first status check'}</p>}
      {isAlignmentActive(state) && <p className="text-xs text-slate-500">Cancelling stops waiting here. The job keeps running at EBI.</p>}
    </JobMonitor>
  );
}

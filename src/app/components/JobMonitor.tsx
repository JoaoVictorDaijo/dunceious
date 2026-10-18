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

import { useEffect, useState, type ReactNode } from 'react';
export function useJobClock(active: boolean): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}
export interface JobStep {
  id: string; label: string; status: 'pending' | 'active' | 'done' | 'failed' | 'skipped';
  detail?: ReactNode; enteredAt?: number; leftAt?: number; extra?: ReactNode; error?: string;
}
export default function JobMonitor({ status, steps, stepsLabel, now, children }: {
  status: ReactNode; steps: JobStep[]; stepsLabel: string; now: number; children?: ReactNode;
}) {
  const icons = { pending: 'fa-circle', active: 'fa-circle-notch', done: 'fa-check', failed: 'fa-xmark', skipped: 'fa-minus' };
  return <div className="space-y-4">
    <p role="status" className="text-sm font-medium text-slate-200">{status}</p>
    <ol aria-label={stepsLabel} className="space-y-1">{steps.map(step => <li key={step.id} data-step={step.id} data-status={step.status}
      className={`flex gap-3 rounded-lg px-3 py-2 ${step.status === 'failed' ? 'bg-rose-500/10 text-rose-300' : step.status === 'active' ? 'bg-slate-800 text-[var(--env)]' : 'text-slate-400'}`}>
      <i aria-hidden="true" className={`fas ${icons[step.status]} mt-1 text-xs ${step.status === 'active' ? 'motion-safe:animate-pulse' : ''}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2 text-sm"><span>{step.label}</span><span className="text-[10px] capitalize">{step.status === 'skipped' ? 'Skipped' : step.status}</span></div>
        {step.detail && <p className="mt-1 select-text break-all text-xs font-mono">{step.detail}</p>}
        {step.enteredAt !== undefined && <p className="mt-1 text-[10px] text-slate-500">{new Date(step.enteredAt).toLocaleTimeString()} · {Math.max(0, Math.floor(((step.leftAt ?? now) - step.enteredAt) / 1000))} s</p>}
        {step.extra}
        {step.error && <p role="alert" className="mt-2 whitespace-pre-wrap break-words text-xs">{step.error}</p>}
      </div>
    </li>)}</ol>
    {children}
  </div>;
}

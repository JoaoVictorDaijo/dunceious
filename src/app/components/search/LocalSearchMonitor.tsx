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

import { useEffect, useRef, useState } from 'react';
import type { LocalSearchJob } from '../../hooks/useSearchWorker';
import JobMonitor, { useJobClock } from '../JobMonitor';
import JobPill from '../JobPill';

export default function LocalSearchMonitor({ job, onCancel }: { job: LocalSearchJob; onCancel: () => void }) {
  const [visible, setVisible] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const now = useJobClock(job.phase === 'running');
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setVisible(false); setMinimized(false);
  }, [job.startedAt]);
  useEffect(() => {
    if (job.phase !== 'running') return;
    const timer = setTimeout(() => setVisible(true), Math.max(0, 1000 - (Date.now() - job.startedAt)));
    return () => clearTimeout(timer);
  }, [job.phase, job.startedAt]);
  useEffect(() => {
    if (!visible || minimized) return;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, [visible, minimized]);
  if (!visible || job.phase === 'idle') return null;
  const active = job.phase === 'running';
  const elapsed = Math.max(0, Math.floor(((job.endedAt ?? now) - job.startedAt) / 1000));
  const scoring = job.progress.phase === 'score';
  const status = active ? (scoring ? 'Scoring streams' : 'Local search') : job.phase === 'done' ? 'Search done' : job.phase === 'cancelled' ? 'Search cancelled' : 'Search failed';
  const { streamsDone, streamsTotal } = job.progress;
  if (minimized) return <JobPill label={active ? `${status} · ${streamsDone}/${streamsTotal}` : status} elapsed={elapsed} active={active}
    done={job.phase === 'done'} failed={job.phase === 'failed'} monitorName="search" dataAttribute="data-local-search-pill" onOpen={() => setMinimized(false)} />;
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) setMinimized(true); }}>
    <div ref={dialog} role="dialog" aria-modal="true" aria-label="Local search job monitor" tabIndex={-1}
      onKeyDown={e => {
        if (e.key === 'Escape') { e.preventDefault(); setMinimized(true); }
        if (e.key === 'Tab') {
          const buttons = dialog.current?.querySelectorAll<HTMLButtonElement>('button');
          if (!buttons?.length) return;
          if (e.shiftKey && (document.activeElement === buttons[0] || document.activeElement === dialog.current)) { e.preventDefault(); buttons[buttons.length - 1].focus(); }
          else if (!e.shiftKey && document.activeElement === buttons[buttons.length - 1]) { e.preventDefault(); buttons[0].focus(); }
        }
      }} className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
      <header className="border-b border-slate-700/60 px-6 py-5"><h2 className="text-lg font-semibold text-white">Local search</h2><p className="text-xs text-slate-400">Elapsed: {elapsed} s</p></header>
      <div className="px-6 py-5"><JobMonitor status={active ? (scoring ? 'Scoring streams' : 'Searching') : status} stepsLabel="Search steps" now={now}
        steps={[{ id: 'streams', label: `${streamsDone} of ${streamsTotal} record strands ${scoring ? 'scored' : 'searched'}`, status: active ? 'active' : job.phase === 'failed' ? 'failed' : 'done', error: job.error }]}>
        {active && <progress aria-label={scoring ? 'Record strands scored' : 'Record strands searched'} value={streamsDone} max={Math.max(1, streamsTotal)} className="w-full" />}
      </JobMonitor></div>
      <footer className="flex justify-end gap-3 border-t border-slate-700/50 bg-slate-800/40 px-6 py-4">
        <button type="button" className="mr-auto rounded-lg px-4 py-2 text-sm text-slate-300 hover:bg-slate-800" onClick={() => setMinimized(true)}>Minimize</button>
        <button type="button" className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800" onClick={active ? onCancel : () => setVisible(false)}>{active ? 'Cancel' : 'Close'}</button>
      </footer>
    </div>
  </div>;
}

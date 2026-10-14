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

import type { useHubState } from '@/src/app/hooks/useHubState';
export default function HubTabs({ state, sequences, features, summary }: { state: ReturnType<typeof useHubState>; sequences: number; features: number; summary?: string }) {
  return <div className="flex items-center justify-between border-b border-slate-200"><div role="tablist" aria-label="Hub view" className="flex gap-5 px-5">{(['sequences', 'features'] as const).map(tab => <button role="tab" id={`hub-tab-${tab}`} aria-controls={`hub-panel-${tab}`} tabIndex={state.tab === tab ? 0 : -1} aria-selected={state.tab === tab} key={tab} className={`relative px-2 py-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500 ${state.tab === tab ? 'font-semibold text-slate-900' : 'text-slate-500'}`} onClick={() => state.setTab(tab)} onKeyDown={event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 'sequences' : event.key === 'End' ? 'features' : tab === 'sequences' ? 'features' : 'sequences';
    state.setTab(next);
    document.getElementById(`hub-tab-${next}`)?.focus();
  }}>{tab === 'sequences' ? 'By sequence ' : 'By feature '}<span className={`rounded-full px-1.5 py-0.5 font-mono text-[11px] ${state.tab === tab ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-500'}`}>{tab === 'sequences' ? sequences : features}</span>{state.tab === tab && <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[3px] rounded-t bg-env" />}</button>)}</div><p className="ml-auto pr-5 text-xs text-slate-500">{summary?.split(/([\d,]+ of [\d,]+)/).map((part, index) => index % 2 ? <span key={index}><strong className="font-semibold text-slate-800">{part.split(' of ')[0]}</strong> of {part.split(' of ')[1]}</span> : part)}</p></div>;
}

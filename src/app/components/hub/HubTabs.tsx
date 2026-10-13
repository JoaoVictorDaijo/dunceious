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
export default function HubTabs({ state, sequences, features }: { state: ReturnType<typeof useHubState>; sequences: number; features: number }) {
  return <div role="tablist" aria-label="Hub view" className="flex gap-5 border-b border-slate-200 px-5">{(['sequences', 'features'] as const).map(tab => <button role="tab" aria-selected={state.tab === tab} key={tab} className={`border-b-2 px-2 py-3 text-sm ${state.tab === tab ? 'border-slate-700 font-semibold text-slate-900' : 'border-transparent text-slate-500'}`} onClick={() => state.setTab(tab)} onKeyDown={e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { state.setTab(tab === 'sequences' ? 'features' : 'sequences'); (e.currentTarget.parentElement?.querySelector(`[role="tab"]:not([aria-selected="${state.tab === tab}"])`) as HTMLElement)?.focus(); } }}>{tab === 'sequences' ? `Sequences ${sequences}` : `Features ${features}`}</button>)}</div>;
}

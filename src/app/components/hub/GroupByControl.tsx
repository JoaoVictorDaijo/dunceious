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

import HubMenu from './HubMenu';
import type { SeqRecord } from '@/src/domain/bio/types';
import type { useHubState } from '@/src/app/hooks/useHubState';
import { groupPreview, type GroupField } from '@/src/app/logic/hubModel';
export const GROUP_FIELDS: [GroupField, string][] = [['organism', 'Organism'], ['host', 'Host'], ['location', 'Location'], ['year', 'Collection year'], ['file', 'Imported from']];
export default function GroupByControl({ records, state }: { records: SeqRecord[]; state: ReturnType<typeof useHubState> }) {
  return <div className="relative flex flex-wrap items-center gap-2">
    <div className="flex gap-1 rounded-xl border border-slate-800 bg-slate-900 p-0.5">{[false, true].map(grouped => <button key={String(grouped)} aria-pressed={state.grouped === grouped} className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500 ${state.grouped === grouped ? 'bg-slate-800 text-white' : 'text-slate-400'}`} onClick={() => state.setGrouped(grouped)}><i aria-hidden="true" className={`fas ${grouped ? 'fa-layer-group' : 'fa-list'}`} />{grouped ? 'Grouped' : 'List'}</button>)}</div>
    {state.grouped && <button className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500" aria-haspopup="menu" aria-expanded={state.menu === 'groupBy'} onClick={() => state.setMenu(state.menu === 'groupBy' ? null : 'groupBy')}>by {GROUP_FIELDS.find(([field]) => field === state.groupField)?.[1]} ▾</button>}
    {state.menu === 'groupBy' && <><HubMenu label="Group by" chrome onClose={() => state.setMenu(null)}>
      {GROUP_FIELDS.map(([field, label]) => { const preview = groupPreview(records, field); return <button role="menuitem" disabled={!preview.groups} key={field} className="block w-full rounded-sm px-2 py-2 text-left disabled:opacity-50 hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-env" onClick={() => { state.setGroupField(field); state.setMenu(null); }}>
        {preview.groups ? `${label} · ${preview.groups} groups · ${preview.notSpecified} not specified` : `${label} · No data in these files`}
      </button>; })}
    </HubMenu><p className="p-2 text-slate-400">Missing details can be filled in with Edit details.</p></>}
  </div>;
}

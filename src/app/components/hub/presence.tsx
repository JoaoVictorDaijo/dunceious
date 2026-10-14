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

import type { CSSProperties } from 'react';
import type { CellState, FeatureGroup } from '@/src/app/logic/featureComparison';
import { getFeatureColor } from '@/src/app/viewer/colors';
export const PRESENCE_CLASSES = {
  hidden: 'bg-slate-200', present: 'bg-slate-500', odd: 'border border-amber-700 bg-amber-400',
  duplicate: 'bg-slate-500 ring-2 ring-inset ring-slate-900',
  missing: 'border-2 border-rose-500 bg-white',
  'not-determined': 'bg-slate-200 text-slate-400',
  unannotated: 'border border-slate-300 bg-white', absent: 'bg-slate-100',
};
export const presenceLabel = (state: CellState) => state === 'not-determined' ? 'not determined (partial)' : state === 'odd' ? 'odd length' : state;
export function presenceStyle(state: CellState, color?: string): CSSProperties {
  return { width: 14, height: 14, backgroundColor: state === 'present' || state === 'duplicate' ? color : undefined,
    backgroundImage: state === 'not-determined' ? 'repeating-linear-gradient(45deg,transparent,transparent 2px,currentColor 2px,currentColor 3px)' : undefined };
}
export function PresenceLegend({ groups, featureColors }: { groups: FeatureGroup[]; featureColors?: Record<string, string> }) {
  const states = [...new Set(groups.flatMap(group => group.cells.map(cell => cell.state)))];
  const types = [...new Set(groups.flatMap(group => group.types))];
  const color = types.length === 1 ? getFeatureColor(types[0], featureColors) : undefined;
  return <div role="group" aria-label="Presence legend" className="flex items-center gap-3 whitespace-nowrap text-[10px]">{states.map(state => <span key={state} className="flex items-center gap-1"><span aria-hidden="true" data-presence-state={state} className={`inline-block shrink-0 rounded-[3px] ${PRESENCE_CLASSES[state]}`} style={presenceStyle(state, color)} />{presenceLabel(state)}</span>)}</div>;
}

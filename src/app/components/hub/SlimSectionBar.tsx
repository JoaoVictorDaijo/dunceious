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

import { HubEditCounts } from './HubEditMarks';
import { useEffect, useRef, type ReactNode } from 'react';
import type { BioFeature } from '@/src/domain/bio/types';
import type { SequenceSection } from '@/src/app/logic/hubModel';
import type { FeatureGroup } from '@/src/app/logic/featureComparison';
import { isolateOf } from '@/src/domain/bio/recordStatus';
import { getFeatureColor } from '@/src/app/viewer/colors';
import GenomeStrip from './GenomeStrip';
import { slimBarHeight } from '@/src/app/logic/hubListGeometry';
export { SLIM_BAR_HEIGHT, slimBarHeight } from '@/src/app/logic/hubListGeometry';
import { PRESENCE_CLASSES, presenceLabel, presenceStyle } from './presence';
import type { TrackWindow } from './trackWindow';

export default function SlimSectionBar({ current = false, item, kind, onFold, onPick, featureColors, trackWindow, highlight, pinned }: { current?: boolean; item: SequenceSection | FeatureGroup; kind: 'sequences' | 'features'; onFold: () => void; onPick: (feature: BioFeature) => void; featureColors?: Record<string, string>; trackWindow: TrackWindow; highlight?: BioFeature | null; pinned?: BioFeature | null }) {
  const root = useRef<HTMLDivElement>(null);
  const section = kind === 'sequences' ? item as SequenceSection : null;
  useEffect(() => { if (root.current && section) return trackWindow.register(section.record.id, root.current); }, [section?.record.id, trackWindow]);
  let content: ReactNode;
  if (section) {
    const record = section.record;
    content = <><strong className={`shrink-0 font-mono ${current ? 'text-amber-800' : 'text-slate-900'}`}>{record.accession || record.id}</strong><span className="max-w-[160px] truncate font-semibold">{record.label || isolateOf(record)}</span><div className="min-w-[320px] flex-1"><GenomeStrip pinned={pinned} record={record} large bare featureColors={featureColors} trackWindow={trackWindow} highlight={feature => highlight ? feature === highlight : section.rows.includes(feature)} onPick={onPick} /></div><span hidden data-track-window-label className="shrink-0 font-mono text-slate-600" /><HubEditCounts followed features={record.features} /><span className="ml-auto shrink-0 font-mono">{section.rows.length} annotations</span></>;
  } else {
    const group = item as FeatureGroup;
    const color = group.types.length === 1 ? getFeatureColor(group.types[0], featureColors) : undefined;
    content = <><strong className={`min-w-0 truncate font-mono ${current ? 'text-amber-800' : 'text-slate-900'}`}>{group.identity}</strong>{group.types.map(type => <span key={type} className="shrink-0 rounded-md bg-white px-2 font-mono" style={{ color: getFeatureColor(type, featureColors) }}>{type}</span>)}<HubEditCounts followed features={group.rows.map(row => row.feature)} /><span className="shrink-0 font-mono">in {group.counts.present} of {group.counts.pool}</span><div aria-label="Presence" className="flex min-w-0 flex-1 gap-1 overflow-hidden">{group.cells.map(cell => <span key={cell.recordId} data-tip={`${cell.recordId}: ${presenceLabel(cell.state)}`} className={`shrink-0 rounded-[3px] ${PRESENCE_CLASSES[cell.state]}`} style={presenceStyle(cell.state, color)} />)}</div></>;
  }
  return <div ref={root} style={{ height: slimBarHeight(item, kind, featureColors) }} className={`flex items-center gap-2 overflow-hidden border-b border-slate-300 px-4 text-xs text-slate-600 ${current ? 'hub-surface-current' : 'bg-white'}`}><button aria-label={`Collapse ${section ? section.record.id : (item as FeatureGroup).identity}`} data-tip="Collapse group" onClick={onFold} className="shrink-0 p-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-env"><i aria-hidden="true" className="fas fa-chevron-down" /></button>{content}</div>;
}

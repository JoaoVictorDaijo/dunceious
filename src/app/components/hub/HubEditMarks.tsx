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

import type { BioFeature } from '@/src/domain/bio/types';
import { hubEditSummary } from '@/src/app/logic/hubEdits';

export function HubEditChip({ mark }: { mark?: BioFeature['hubEdit'] }) {
  if (!mark) return null;
  return <span data-edit-chip data-tip={mark === 'edited' ? 'Edited in Dunceious; the file has different values' : 'Added in Dunceious'} className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 text-[10px] ${mark === 'edited' ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}><i aria-hidden="true" className={`fas ${mark === 'edited' ? 'fa-pen' : 'fa-plus'}`} />{mark}</span>;
}
export function HubEditCounts({ features }: { features: BioFeature[] }) {
  const summary = hubEditSummary(features);
  return summary ? <span className="shrink-0 whitespace-nowrap font-mono text-amber-800">{summary}</span> : null;
}

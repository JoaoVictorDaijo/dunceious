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

import { hitCounts, type HitColumn, type HitMode } from '@/src/core/search/hitColumns';
import type { ResidueAlphabet } from '@/src/core/search/query';
import { hitCountsText } from '../../logic/hitAlignmentText';

export function HitBarcode({ columns, strand, alphabet, mode = 'whole' }: {
  columns: HitColumn[]; strand: 1 | -1; alphabet: ResidueAlphabet; mode?: HitMode;
}) {
  const length = Math.max(1, columns.length);
  return <svg role="img" aria-label={hitCountsText(hitCounts(columns), mode)}
    data-hit-barcode="" className="w-full h-3 mt-2" viewBox={`0 0 ${length} 10`} preserveAspectRatio="none">
    <title>{alphabet === 'protein' ? 'N→C' : '5′→3′'} (query orientation)</title>
    <rect width={length} height={6} y={2} fill={strand === 1 ? '#fbbf24' : '#f472b6'} opacity={0.35} />
    {columns.map((c, i) => c.cls === 'insertion'
      ? <path key={i} d={`M${i} 0h1l-.5 5z`} fill="#a78bfa" />
      : c.cls === 'deletion' ? <rect key={i} x={i} y={2} width={1} height={6} fill="#94a3b8" />
      : c.cls === 'mismatch' ? <rect key={i} x={i} width={1} height={10} fill="#f8fafc" />
      : c.cls === 'ambiguity' || c.cls === 'similar' ? <rect key={i} x={i} y={8} width={1} height={2} fill="#cbd5e1" /> : null)}
  </svg>;
}

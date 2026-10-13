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

import type { BioFeature, SeqRecord } from '@/src/domain/bio/types';
import { annotationFeatures } from '@/src/domain/bio/recordStatus';
import { getFeatureColor } from '@/src/app/viewer/colors';
export default function GenomeStrip({ record, highlight, large = false, onPick, featureColors }: { record: SeqRecord; highlight?: (feature: BioFeature) => boolean; large?: boolean; featureColors?: Record<string, string>; onPick?: (feature: BioFeature) => void }) {
  const features = annotationFeatures(record);
  const types = [...new Set(features.map(f => f.type))];
  const height = large ? 6 : 3;
  return <div aria-label={`Genome strip for ${record.id}`} className="relative w-full rounded bg-slate-400/15" style={{ height: Math.max(1, types.length) * height }}>
    {features.flatMap((feature, index) => {
      const parts = feature.segments?.length ? feature.segments : feature.start > feature.end ? [{ start: feature.start, end: record.sequence.length }, { start: 0, end: feature.end }] : [feature];
      return parts.map((part, partIndex) => <button key={`${index}:${partIndex}`} disabled={!onPick} aria-label={`Jump to ${feature.name}`} onClick={() => onPick?.(feature)} className="absolute rounded-sm focus-visible:ring-2 focus-visible:ring-amber-500" style={{ left: `${part.start / record.sequence.length * 100}%`, width: `${(part.end - part.start) / record.sequence.length * 100}%`, top: types.indexOf(feature.type) * height, height: height - 1, backgroundColor: feature.color || getFeatureColor(feature.type, featureColors), opacity: highlight && !highlight(feature) ? .25 : 1 }} />);
    })}
  </div>;
}

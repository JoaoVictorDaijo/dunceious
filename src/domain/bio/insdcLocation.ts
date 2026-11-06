/*
 * Dunceious
 * Copyright (C) 2026 João Victor Daijo and Murilo Cassiano
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

import { featureParts, hasPartialStrands, invalidLocationPart, type FeatureGeometry, type LocationRecord } from './featureParts';

export interface LocationEnds { fivePrimePartial?: boolean; threePrimePartial?: boolean }
export type InsdcLocation =
  | { kind: 'insdc'; text: string }
  | { kind: 'no-insdc-form'; display: string; reason: 'linear-edge-site' | 'invalid-geometry' };

/** INSDC FT 11.4 §3.4.2.1 allows origin sites only on circular molecules. */
export function siteLabel(position: number, record: LocationRecord): string {
  if (position === 0 || position === record.length) {
    if (record.isCircular) return `${record.length}^1`;
    return position === 0 ? 'before base 1' : `after base ${record.length}`;
  }
  return `${position}^${position + 1}`;
}

/** INSDC FT 11.4 §3.4: format stored geometry; retained source text is the caller's choice. */
export function formatInsdcLocation(feature: FeatureGeometry, record: LocationRecord, ends: LocationEnds = {}): InsdcLocation {
  const stored = feature.segments?.length || feature.remoteParts?.length ? feature.segments ?? [] : [feature];
  if (hasPartialStrands(feature) || stored.some(part => invalidLocationPart(part, record))) {
    return { kind: 'no-insdc-form', reason: 'invalid-geometry', display: `${stored.map(part => `${part.start + 1}..${part.end}`).join(',')} (invalid location)` };
  }
  const parts: (ReturnType<typeof featureParts>[number] & { accession?: string })[] = featureParts(feature, record);
  for (const part of [...feature.remoteParts ?? []].sort((a, b) => a.index - b.index)) {
    parts.splice(Math.min(part.index, parts.length), 0, { ...part, strand: part.strand });
  }
  const perPart = featureParts(feature, record).some(part => part.strand !== undefined) || (feature.remoteParts ?? []).some(part => part.strand !== feature.strand);
  const markers = parts.map(() => ({ start: '', end: '' }));
  const evaluation = parts.map((part, index) => ({ index, strand: perPart ? part.strand : feature.strand }));
  if (!perPart && feature.strand === -1) evaluation.reverse();
  const first = evaluation[0];
  const last = evaluation[evaluation.length - 1];
  if (ends.fivePrimePartial && first) markers[first.index][first.strand === -1 ? 'end' : 'start'] = first.strand === -1 ? '>' : '<';
  if (ends.threePrimePartial && last) markers[last.index][last.strand === -1 ? 'start' : 'end'] = last.strand === -1 ? '<' : '>';
  let edge = false;
  const locations = parts.map((part, index) => {
    let text: string;
    if (part.start === part.end) {
      text = siteLabel(part.start, record);
      edge ||= !record.isCircular && (part.start === 0 || part.start === record.length);
    } else {
      text = `${part.accession ? `${part.accession}:` : ''}${part.partialStart ? '<' : markers[index].start}${part.start + 1}..${part.partialEnd ? '>' : markers[index].end}${part.end}`;
    }
    return perPart && part.strand === -1 ? `complement(${text})` : text;
  });
  let text = locations.length > 1 ? `${feature.operator ?? 'join'}(${locations.join(',')})` : locations[0];
  if (!perPart && feature.strand === -1) text = `complement(${text})`;
  return edge ? { kind: 'no-insdc-form', reason: 'linear-edge-site', display: text } : { kind: 'insdc', text };
}

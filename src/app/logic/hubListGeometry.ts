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

import type { SeqRecord } from '@/src/domain/bio/types';
import type { SequenceSection } from './hubModel';
import type { FeatureGroup } from './featureComparison';
import { packTrack, trackMetrics } from './trackLayout';

export const HEADER_GAP = 14;
export const SLIM_BAR_HEIGHT = 44;
const COLLAPSE_FADE = 40;
export type GeometryEntry = { type: string; key: string; sectionKey: string; size: number };
export type JumpLanding = { key: string; offset: number };

export function listBounds(entries: readonly GeometryEntry[], height: number) {
  let total = 0;
  const starts = entries.map(entry => { const start = total; total += entry.size; return start; });
  return { starts, total, maxOffset: Math.max(0, total - height) };
}

export function sectionsAt(entries: readonly GeometryEntry[], starts: readonly number[], sectionKeys: ReadonlySet<string>, height: number, offset: number, jumpLanding: JumpLanding | null) {
  const readingLine = offset + Math.min(280, Math.max(SLIM_BAR_HEIGHT + 96, Math.round(height * 0.3)));
  let barIndex = entries.findIndex(entry => entry.type === 'header');
  let current = entries[barIndex]?.sectionKey ?? null;
  for (let i = 0; i < entries.length && starts[i] <= readingLine; i++) {
    if (starts[i] <= offset && entries[i].type === 'header') barIndex = i;
    current = entries[i].sectionKey;
  }
  const hold = jumpLanding && Math.abs(offset - jumpLanding.offset) <= 2 && sectionKeys.has(jumpLanding.key) ? jumpLanding : null;
  return { barIndex, bar: entries[barIndex]?.sectionKey ?? null, current: hold?.key ?? current, jumpLanding: hold };
}

export function cardBounds(entries: readonly GeometryEntry[], starts: readonly number[], folded: (key: string) => boolean) {
  return entries.flatMap((entry, first) => {
    if (entry.type !== 'header') return [];
    let last = first;
    while (last + 1 < entries.length && !['header', 'divider', 'spacer'].includes(entries[last + 1].type)) last++;
    return [{ key: entry.key, start: starts[first], size: starts[last] + entries[last].size - starts[first], first, last, folded: folded(entry.key) }];
  });
}

// Matching the remaining header surface avoids showing its content twice during collapse.
export function pinnedGeometry(entries: readonly GeometryEntry[], starts: readonly number[], cards: readonly { first: number; start: number; size: number }[], index: number, offset: number, barHeight: number, folded: boolean) {
  const overlayHeight = Math.max(barHeight, starts[index] + (entries[index]?.size ?? 0) - offset);
  const compactProgress = Math.min(1, Math.max(0, (barHeight + COLLAPSE_FADE - overlayHeight) / COLLAPSE_FADE));
  const card = cards.find(card => card.first === index);
  const top = card ? Math.min(0, card.start + card.size - offset - overlayHeight) : 0;
  const visible = Boolean(entries[index]?.type === 'header' && !folded && offset > starts[index] + HEADER_GAP);
  return { overlayHeight, compactProgress, top, visible };
}

export function jumpOffset(entry: GeometryEntry, start: number, headerStart: number, barHeight: number, height: number, maxOffset: number) {
  const position = entry.type === 'header' ? start : start - barHeight - Math.max(0, (height - barHeight - entry.size) / 2);
  return Math.max(headerStart, Math.min(position, maxOffset));
}

// The sequence bar must fit the record's packed lanes between its identity and counts.
export function slimBarHeight(item: SequenceSection | FeatureGroup, kind: 'sequences' | 'features', _featureColors?: Record<string, string>): number {
  if (kind !== 'sequences') return SLIM_BAR_HEIGHT;
  const record: SeqRecord = (item as SequenceSection).record;
  return Math.max(SLIM_BAR_HEIGHT, trackMetrics(packTrack(record, { maxLanes: 4, reverseLanes: 4 }), true).height + 12);
}

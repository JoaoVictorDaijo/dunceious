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

import { describe, it, expect } from 'vitest';
import type { SeqRecord } from '@/src/domain/bio/types';
import { packTrack, trackMetrics, rulerTicks } from '../trackLayout';
import { sequenceSectionHeight } from '@/src/app/components/hub/SequenceSectionHeader';
const record: SeqRecord = { id: 'x', name: 'x', sequence: 'A'.repeat(1000), features: [
  { name: 'source', type: 'source', start: 0, end: 1000, strand: 1 },
  { name: 'f', type: 'gene', start: 100, end: 500, strand: 1 },
  { name: 'r', type: 'CDS', start: 100, end: 500, strand: -1 },
  { name: 'wrap', type: 'gene', start: 900, end: 50, strand: 1 },
] };
describe('strand track packing', () => {
  it('separates strands, excludes source and retains circular parts', () => {
    const result = packTrack(record, { maxLanes: 4, reverseLanes: 4 });
    expect(result.parts.filter(p => p.feature.name === 'wrap').map(p => [p.start, p.end])).toEqual([[0, 50], [900, 1000]]);
    expect(result.parts.filter(p => p.strand === -1).map(p => p.feature.name)).toEqual(['r']);
    expect(result.parts.some(p => p.feature.type === 'source')).toBe(false);
    expect(result.forwardLanes).toBe(1); expect(result.reverseLanes).toBe(1);
  });
  it('bounds crowded lanes and is deterministic', () => {
    const crowded = { ...record, features: Array.from({ length: 15 }, (_, i) => ({ name: String(i), type: 'gene', start: 100 + i, end: 500, strand: i % 2 ? -1 as const : 1 as const })) };
    const result = packTrack(crowded, { maxLanes: 3, reverseLanes: 1 });
    expect(result.forwardLanes).toBe(3); expect(result.reverseLanes).toBe(1);
    expect(result.parts.every(p => p.lane < (p.strand === -1 ? 1 : 3))).toBe(true);
    expect(packTrack(crowded, { maxLanes: 3, reverseLanes: 1 })).toEqual(result);
  });
  it('uses the gap before reusing a lane and respects authoritative part strands', () => {
    const mixed = { ...record, features: [{ name: 'mixed', type: 'gene', start: 0, end: 500, strand: 1 as const, segments: [{ start: 0, end: 100, strand: 1 as const }, { start: 300, end: 500, strand: -1 as const }] }, { name: 'close', type: 'gene', start: 103, end: 200, strand: 1 as const }] };
    const result = packTrack(mixed, { maxLanes: 4, reverseLanes: 4 });
    expect(result.forwardLanes).toBe(2); expect(result.reverseLanes).toBe(1);
  });
  it('keeps section heights deterministic from lane counts and limits rulers to seven ticks', () => {
    const section = { key: 'x', group: null, record, rows: record.features.slice(1), total: 3 };
    expect(trackMetrics(packTrack(record, { maxLanes: 4, reverseLanes: 4 }), true).height).toBe(34);
    expect(sequenceSectionHeight(section, false)).toBe(131);
    for (const length of [10, 999, 30000, 90000000]) expect(rulerTicks(length).length).toBeLessThanOrEqual(7);
    expect(rulerTicks(30000).map(t => t.label)).toEqual(['5 kb', '10 kb', '15 kb', '20 kb', '25 kb']);
  });
});

it('centres sparse mini lanes inside the fixed thirty-pixel box', () => {
  const metrics = trackMetrics({ parts: [], forwardLanes: 1, reverseLanes: 0 }, false);
  const y = metrics.y({ feature: record.features[1], index: 0, start: 0, end: 1, lane: 0, strand: 1 });
  expect(y).toBeCloseTo(12.2); expect(y + metrics.laneHeight).toBeCloseTo(17.8);
  expect(metrics.height).toBe(30);
});


it('uses ten-pixel comfortable lanes and exact section heights while mini tracks stay unchanged', () => {
  const section = { key: 'x', group: null, record, rows: record.features.slice(1), total: 3 };
  const layout = packTrack(record, { maxLanes: 4, reverseLanes: 4 });
  const compact = trackMetrics(layout, true, 'compact');
  const comfortable = trackMetrics(layout, true, 'comfortable');
  expect([compact.laneHeight, compact.gap, compact.height]).toEqual([7, 2, 34]);
  expect([comfortable.laneHeight, comfortable.gap, comfortable.height]).toEqual([10, 3, 42]);
  expect(sequenceSectionHeight(section, false, undefined, 'comfortable')).toBe(139);
  expect(sequenceSectionHeight(section, true, undefined, 'comfortable')).toBe(81);
  expect(trackMetrics(layout, false, 'comfortable')).toMatchObject({ height: 30, laneHeight: 4.2, gap: 1.2 });
});

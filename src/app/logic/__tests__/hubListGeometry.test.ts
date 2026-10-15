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

import { describe, expect, it } from 'vitest';
import { listBounds, sectionsAt, cardBounds, pinnedGeometry, jumpOffset, slimBarHeight, type GeometryEntry } from '../hubListGeometry';
import type { SeqRecord } from '@/src/domain/bio/types';
import type { SequenceSection } from '../hubModel';
import type { FeatureGroup } from '../featureComparison';

function group(key: string, size: number, rows = 20): GeometryEntry[] {
  return [{ type: 'header', key, sectionKey: key, size }, ...Array.from({ length: rows }, (_, i) => ({ type: 'row', key: `${key}:${i}`, sectionKey: key, size: 44 }))];
}
const keys = new Set(['first', 'second', 'third']);

// A top-edge-only selection would miss these transitions while the preceding card remains visible.
describe.each([{ tab: 'sequences', header: 141, folded: 96 }, { tab: 'features', header: 126, folded: 126 }])('$tab current group', ({ header, folded }) => {
  const entries = [...group('first', header), ...group('second', header), ...group('third', header)];
  const { starts } = listBounds(entries, 700);
  const at = (height: number, offset: number) => sectionsAt(entries, starts, keys, height, offset, null);

  it.each([{ height: 200, line: 140 }, { height: 466, line: 140 }, { height: 468, line: 140 }, { height: 469, line: 141 }, { height: 701, line: 210 }, { height: 702, line: 211 }, { height: 931, line: 279 }, { height: 932, line: 280 }, { height: 1200, line: 280 }])('switches at the clamped, rounded reading line for $height px', ({ height, line }) => {
    const next = header + 880;
    expect(at(height, next - line - 1)).toMatchObject({ current: 'first', bar: 'first', barIndex: 0 });
    expect(at(height, next - line)).toMatchObject({ current: 'second', bar: 'first', barIndex: 0 });
    expect(next - 12).toBeGreaterThan(next - line);
    expect(at(height, next + 400)).toMatchObject({ bar: 'second', barIndex: 21 });
  });

  it('counts the divider as part of the following group while excluding it from the preceding card', () => {
    const divided = [...group('first', header), { type: 'divider', key: 'divider', sectionKey: 'second', size: 32 }, ...group('second', header)];
    const bounds = listBounds(divided, 700);
    const divider = header + 880;
    expect(sectionsAt(divided, bounds.starts, keys, 700, divider - 211, null).current).toBe('first');
    expect(sectionsAt(divided, bounds.starts, keys, 700, divider - 210, null)).toMatchObject({ current: 'second', bar: 'first' });
    expect(cardBounds(divided, bounds.starts, () => false)[0]).toMatchObject({ size: header + 880, last: 20 });
  });

  it('keeps a folded rail target current within two pixels and releases it on scrolling or paging', () => {
    const foldedEntries = [...group('first', folded, 0), ...group('second', header)];
    const bounds = listBounds(foldedEntries, 700);
    expect(sectionsAt(foldedEntries, bounds.starts, keys, 700, 0, null).current).toBe('second');
    const hold = { key: 'first', offset: 0 };
    for (const offset of [0, 2]) {
      expect(sectionsAt(foldedEntries, bounds.starts, keys, 700, offset, hold)).toMatchObject({ current: 'first', jumpLanding: hold });
    }
    for (const offset of [3, 560]) {
      expect(sectionsAt(foldedEntries, bounds.starts, keys, 700, offset, hold)).toMatchObject({ current: 'second', jumpLanding: null });
    }
    expect(cardBounds(foldedEntries, bounds.starts, key => key === 'first')[0]).toMatchObject({ folded: true, first: 0, last: 0, size: folded });
    expect(pinnedGeometry(foldedEntries, bounds.starts, [], 0, 15, 44, true).visible).toBe(false);
  });

  it('invalidates a hold when its target disappears without moving the offset', () => {
    const remaining = group('second', header);
    const bounds = listBounds(remaining, 700);
    const hold = { key: 'first', offset: 0 };
    expect(sectionsAt(remaining, bounds.starts, new Set(['second']), 700, 0, hold)).toMatchObject({ current: 'second', jumpLanding: null });
    expect(hold).toEqual({ key: 'first', offset: 0 });
  });

  it.each(['row', 'header', 'rail'])('holds a one-row group after a %s jump until the offset moves', action => {
    const short = [...group('first', header), ...group('second', header, 1), ...group('third', header)];
    const bounds = listBounds(short, 700);
    const start = header + 880;
    const entry = short[action === 'row' ? 22 : 21];
    const offset = action === 'rail' ? start : jumpOffset(entry, bounds.starts[action === 'row' ? 22 : 21], start, 44, 700, bounds.maxOffset);
    expect(offset).toBe(start);
    const hold = { key: 'second', offset };
    expect(sectionsAt(short, bounds.starts, keys, 700, offset, hold).current).toBe('second');
    expect(sectionsAt(short, bounds.starts, keys, 700, offset + 3, hold)).toMatchObject({ current: 'third', jumpLanding: null });
  });

  it('makes the following group current with its header sixty pixels below the top', () => {
    expect(at(700, header + 820)).toMatchObject({ current: 'second', bar: 'first' });
  });
});

describe('pinned geometry', () => {
  const entries = [...group('first', 141, 12), ...group('second', 141, 1)];
  const { starts } = listBounds(entries, 180);
  const cards = cardBounds(entries, starts, () => false);
  const at = (offset: number) => pinnedGeometry(entries, starts, cards, 0, offset, 44, false);

  it.each([{ offset: 0, visible: false }, { offset: 14, visible: false }, { offset: 15, visible: true }])('shows the overlay only after the fourteen-pixel header gap: $offset', ({ offset, visible }) => {
    expect(at(offset).visible).toBe(visible);
  });

  it.each([
    { offset: 15, overlayHeight: 126, compactProgress: 0 },
    { offset: 56, overlayHeight: 85, compactProgress: 0 },
    { offset: 57, overlayHeight: 84, compactProgress: 0 },
    { offset: 77, overlayHeight: 64, compactProgress: 0.5 },
    { offset: 97, overlayHeight: 44, compactProgress: 1 },
    { offset: 141, overlayHeight: 44, compactProgress: 1 },
  ])('cross-fades over forty pixels and floors the overlay at the slim height: $offset', ({ offset, overlayHeight, compactProgress }) => {
    expect(at(offset)).toMatchObject({ overlayHeight, compactProgress, top: 0 });
    expect(1 - at(offset).compactProgress).toBe(1 - compactProgress);
  });

  it('pushes the compact bar off at the card end before the next header becomes visible', () => {
    expect(cards[0]).toMatchObject({ start: 0, size: 669 });
    expect(at(625).top).toBe(0);
    expect(at(626).top).toBe(-1);
    expect(at(650).top).toBe(-25);
    const section = sectionsAt(entries, starts, keys, 180, 670, null);
    expect(section.bar).toBe('second');
    expect(pinnedGeometry(entries, starts, cards, section.barIndex, 670, 44, false).visible).toBe(false);
  });

  it('uses the selected header start and record-specific bar height', () => {
    expect(pinnedGeometry(entries, starts, cards, 13, 700, 80, false)).toMatchObject({ overlayHeight: 110, compactProgress: 0.25, visible: true });
    expect(pinnedGeometry(entries, starts, [], 13, 800, 80, false)).toMatchObject({ overlayHeight: 80, compactProgress: 1, top: 0 });
    expect(pinnedGeometry(entries, starts, [], 1, 200, 44, false).visible).toBe(false);
  });
});

describe('bounds and jumps', () => {
  it('handles empty lists and clamps short lists to a zero maximum offset', () => {
    expect(listBounds([], 700)).toEqual({ starts: [], total: 0, maxOffset: 0 });
    expect(sectionsAt([], [], new Set(), 700, 0, { key: 'gone', offset: 0 })).toEqual({ barIndex: -1, bar: null, current: null, jumpLanding: null });
    expect(listBounds(group('first', 141, 1), 700)).toEqual({ starts: [0, 141], total: 185, maxOffset: 0 });
  });

  it('includes editors, tracks and empty rows but stops cards at spacers and dividers', () => {
    const entries: GeometryEntry[] = [
      ...group('first', 141, 1),
      { type: 'track', key: 'track', sectionKey: 'first', size: 64 },
      { type: 'editor', key: 'editor', sectionKey: 'first', size: 112 },
      { type: 'divider', key: 'divider', sectionKey: 'second', size: 32 },
      ...group('second', 96, 0),
      { type: 'empty', key: 'empty', sectionKey: 'second', size: 60 },
      { type: 'spacer', key: 'end', sectionKey: 'second', size: 544 },
    ];
    const bounds = listBounds(entries, 700);
    expect(bounds).toEqual({ starts: [0, 141, 185, 249, 361, 393, 489, 549], total: 1093, maxOffset: 393 });
    expect(cardBounds(entries, bounds.starts, () => false)).toEqual([
      { key: 'first', start: 0, size: 361, first: 0, last: 3, folded: false },
      { key: 'second', start: 393, size: 156, first: 5, last: 6, folded: false },
    ]);
    expect(sectionsAt(entries, bounds.starts, keys, 700, 800, null)).toMatchObject({ current: 'second', bar: 'second' });
  });

  it('centers rows below the bar and clamps jumps to the header and the end offset', () => {
    const row = group('first', 141, 1)[1];
    expect(jumpOffset(row, 1000, 500, 44, 700, 2000)).toBe(650);
    expect(jumpOffset(row, 641, 500, 44, 700, 2000)).toBe(500);
    expect(jumpOffset(row, 3000, 500, 44, 700, 2000)).toBe(2000);
    expect(jumpOffset(row, 1000, 500, 44, 60, 2000)).toBe(956);
    expect(jumpOffset(group('first', 141)[0], 500, 500, 44, 700, 2000)).toBe(500);
  });

  it('selects the next short section after scrolling and lands the final row below its header', () => {
    const entries = [...group('first', 141, 1), ...group('second', 141, 1), ...group('third', 141, 1), { type: 'spacer', key: 'end', sectionKey: 'third', size: 0 }];
    const bounds = listBounds(entries, 180);
    expect(sectionsAt(entries, bounds.starts, keys, 180, 190, null)).toMatchObject({ current: 'second', bar: 'second' });
    const offset = jumpOffset(entries[5], 511, 370, 44, 180, bounds.maxOffset);
    expect(offset).toBe(375);
    expect(511 - offset).toBeGreaterThanOrEqual(122);
    expect(sectionsAt(entries, bounds.starts, keys, 180, offset, { key: 'third', offset }).current).toBe('third');
  });

  it.each([-3, -2, 0, 2, 3])('validates jump holds on both sides of the landing: %s', delta => {
    const entries = [...group('first', 96, 0), ...group('second', 141)];
    const bounds = listBounds(entries, 700);
    const held = Math.abs(delta) <= 2;
    expect(sectionsAt(entries, bounds.starts, keys, 700, 20 + delta, { key: 'first', offset: 20 })).toMatchObject({ current: held ? 'first' : 'second', jumpLanding: held ? { key: 'first', offset: 20 } : null });
  });
});

describe('slim bar heights', () => {
  it.each([{ forward: 0, reverse: 0, height: 44 }, { forward: 1, reverse: 0, height: 44 }, { forward: 1, reverse: 1, height: 54 }, { forward: 4, reverse: 0, height: 80 }, { forward: 6, reverse: 6, height: 132 }])('fits packed lanes for $forward forward and $reverse reverse features', ({ forward, reverse, height }) => {
    const record: SeqRecord = { id: 'record', name: 'record', sequence: 'A'.repeat(100), features: [
      ...Array.from({ length: forward }, (_, i) => ({ type: 'gene', name: `forward${i}`, start: 10, end: 90, strand: 1 as const })),
      ...Array.from({ length: reverse }, (_, i) => ({ type: 'gene', name: `reverse${i}`, start: 10, end: 90, strand: -1 as const })),
    ] };
    const section: SequenceSection = { key: 'record', record, rows: record.features, total: record.features.length, group: '' };
    expect(slimBarHeight(section, 'sequences')).toBe(height);
    expect(slimBarHeight(section, 'sequences', { gene: '#ff0000' })).toBe(height);
    expect(slimBarHeight({} as FeatureGroup, 'features')).toBe(44);
  });
});

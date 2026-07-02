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
import { parseLocation } from '../locationParser';

// ---------------------------------------------------------------------------
// Simple ranges
// ---------------------------------------------------------------------------

describe('parseLocation – simple range', () => {
  it('converts 1-based inclusive to 0-based half-open [start, end)', () => {
    const r = parseLocation('1..100');
    expect(r.start).toBe(0);
    expect(r.end).toBe(100);
    expect(r.strand).toBe(1);
    expect(r.segments).toHaveLength(1);
    expect(r.segments[0]).toEqual({ start: 0, end: 100 });
  });

  it('handles arbitrary ranges', () => {
    const r = parseLocation('687..3158');
    expect(r.start).toBe(686);
    expect(r.end).toBe(3158);
  });

  it('strips fuzzy < and > indicators', () => {
    const r = parseLocation('<1..>206');
    expect(r.start).toBe(0);
    expect(r.end).toBe(206);
  });
});

// ---------------------------------------------------------------------------
// Single-position and point-between-bases
// ---------------------------------------------------------------------------

describe('parseLocation – single position and site', () => {
  it('parses a single-position location (n)', () => {
    const r = parseLocation('42');
    expect(r.start).toBe(41);
    expect(r.end).toBe(42);
  });

  it('parses a site between bases (n^m)', () => {
    const r = parseLocation('100^101');
    expect(r.start).toBe(99);
    expect(r.end).toBe(101);
  });
});

// ---------------------------------------------------------------------------
// Complement
// ---------------------------------------------------------------------------

describe('parseLocation – complement', () => {
  it('sets strand to -1 for complement()', () => {
    const r = parseLocation('complement(10..20)');
    expect(r.strand).toBe(-1);
    expect(r.start).toBe(9);
    expect(r.end).toBe(20);
  });

  it('complement with fuzzy boundaries', () => {
    const r = parseLocation('complement(<3300..>4037)');
    expect(r.strand).toBe(-1);
    expect(r.start).toBe(3299);
    expect(r.end).toBe(4037);
  });
});

// ---------------------------------------------------------------------------
// Linear join
// ---------------------------------------------------------------------------

describe('parseLocation – linear join', () => {
  it('creates multiple segments for join()', () => {
    const r = parseLocation('join(1..10,21..30)');
    expect(r.segments).toHaveLength(2);
    expect(r.segments[0]).toEqual({ start: 0, end: 10 });
    expect(r.segments[1]).toEqual({ start: 20, end: 30 });
  });

  it('envelope start/end is the overall min/max', () => {
    const r = parseLocation('join(1..10,21..30)');
    expect(r.start).toBe(0);
    expect(r.end).toBe(30);
  });

  it('strand is +1 for a plain join', () => {
    expect(parseLocation('join(1..10,21..30)').strand).toBe(1);
  });

  it('handles three-segment join', () => {
    const r = parseLocation('join(1..5,10..15,20..25)');
    expect(r.segments).toHaveLength(3);
    expect(r.start).toBe(0);
    expect(r.end).toBe(25);
  });

  it('complement join yields strand -1', () => {
    const r = parseLocation('complement(join(10..20,30..40))');
    expect(r.strand).toBe(-1);
    expect(r.segments).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Circular wrap-around join (origin-crossing feature)
// ---------------------------------------------------------------------------

describe('parseLocation – circular wrap-around join', () => {
  it('detects origin-crossing when firstStart > lastEnd', () => {
    // join(2427..3323,1..1758): first segment at high coords, last at low
    const r = parseLocation('join(2427..3323,1..1758)');
    expect(r.start).toBeGreaterThan(r.end);
  });

  it('preserves both segments for circular join', () => {
    const r = parseLocation('join(2427..3323,1..1758)');
    expect(r.segments).toHaveLength(2);
    // Segments should be in file order: high-coord first
    expect(r.segments[0].start).toBe(2426);
    expect(r.segments[0].end).toBe(3323);
    expect(r.segments[1].start).toBe(0);
    expect(r.segments[1].end).toBe(1758);
  });

  it('sets start = first segment start, end = last segment end for wrap', () => {
    const r = parseLocation('join(2427..3323,1..1758)');
    expect(r.start).toBe(2426);
    expect(r.end).toBe(1758);
  });

  it('complement circular join sets strand -1', () => {
    const r = parseLocation('complement(join(5000..6000,1..500))');
    expect(r.strand).toBe(-1);
    expect(r.start).toBeGreaterThan(r.end);
  });

  it('three-segment wrap-around: first > last detects circularity', () => {
    // join(4900..5000,1..100,200..300) where 4900 > 300
    const r = parseLocation('join(4900..5000,1..100,200..300)');
    expect(r.start).toBeGreaterThan(r.end);
    expect(r.segments).toHaveLength(3);
  });
});

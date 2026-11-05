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

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@/src/app/testing/renderHarness';
import { useBasesOpenness } from '../useBasesOpenness';

const DURATION = 240;

function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: reduce && query.includes('reduce') }));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
  stubReducedMotion(false);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

describe('useBasesOpenness', () => {
  it.each([[false, 0], [true, 1]])('starts at the target without animating (target %s)', (target, expected) => {
    const { result } = renderHook(() => useBasesOpenness(target));
    expect(result.current).toBe(expected);
    advance(DURATION);
    expect(result.current).toBe(expected);
  });

  it('eases monotonically to the target over 240 ms', () => {
    const { result, rerender } = renderHook(({ open }) => useBasesOpenness(open), { initialProps: { open: false } });
    rerender({ open: true });
    const seen: number[] = [];
    for (let t = 0; t < DURATION; t += 16) { advance(16); seen.push(result.current); }
    advance(DURATION);
    expect(seen.some(v => v > 0 && v < 1)).toBe(true);
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    expect(result.current).toBe(1);
  });

  it('continues from the current value when retargeted mid-animation', () => {
    const { result, rerender } = renderHook(({ open }) => useBasesOpenness(open), { initialProps: { open: false } });
    rerender({ open: true });
    advance(112);
    const mid = result.current;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    rerender({ open: false });
    // The first frame after the retarget may only move away from `mid` by one frame's worth.
    advance(16);
    expect(result.current).toBeLessThanOrEqual(mid);
    expect(result.current).toBeGreaterThan(mid - 0.3);
    advance(DURATION);
    expect(result.current).toBe(0);
  });

  it('snaps to the target under prefers-reduced-motion', () => {
    stubReducedMotion(true);
    const { result, rerender } = renderHook(({ open }) => useBasesOpenness(open), { initialProps: { open: false } });
    rerender({ open: true });
    expect(result.current).toBe(1);
    rerender({ open: false });
    expect(result.current).toBe(0);
  });

  it('cancels its pending frame on unmount', () => {
    const { rerender, unmount } = renderHook(({ open }) => useBasesOpenness(open), { initialProps: { open: false } });
    rerender({ open: true });
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});

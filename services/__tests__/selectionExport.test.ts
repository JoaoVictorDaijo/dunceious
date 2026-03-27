import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Minimal helper that mirrors the clipping/rebasing logic in App.tsx
// exportSelectionJson, using half-open interval semantics [selStart, selEnd).
// ---------------------------------------------------------------------------

type Interval = { start: number; end: number };

/**
 * Clip `iv` to the selection window [selStart, selEnd) and rebase it to
 * selection-local coordinates.
 * Returns `null` when there is no overlap or the clipped interval is empty.
 */
function clipAndRebase(
  iv: Interval,
  selStart: number,
  selEnd: number
): Interval | null {
  const length = Math.max(0, selEnd - selStart);
  // overlap test (half-open): iv.start < selEnd AND iv.end > selStart
  if (!(iv.start < selEnd && iv.end > selStart)) return null;
  const out: Interval = {
    start: Math.max(0, iv.start - selStart),
    end: Math.min(length, iv.end - selStart),
  };
  // drop zero- or negative-length intervals produced after clipping
  return out.end > out.start ? out : null;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('selection export – interval clipping and rebasing (half-open [start, end))', () => {
  const SEL_START = 10;
  const SEL_END = 20; // selection window is [10, 20)

  it('returns rebased coords for a fully contained interval', () => {
    expect(clipAndRebase({ start: 12, end: 18 }, SEL_START, SEL_END)).toEqual({
      start: 2,
      end: 8,
    });
  });

  it('clips a left-overlapping interval to the selection boundary', () => {
    // interval [5, 12) overlaps with selection [10, 20) → clipped to [10, 12) → rebased [0, 2)
    expect(clipAndRebase({ start: 5, end: 12 }, SEL_START, SEL_END)).toEqual({
      start: 0,
      end: 2,
    });
  });

  it('clips a right-overlapping interval to the selection boundary', () => {
    // interval [18, 25) overlaps with selection [10, 20) → clipped to [18, 20) → rebased [8, 10)
    expect(clipAndRebase({ start: 18, end: 25 }, SEL_START, SEL_END)).toEqual({
      start: 8,
      end: 10,
    });
  });

  it('drops an interval that touches the left boundary but does not overlap', () => {
    // interval [0, 10) ends exactly at selStart → no overlap in half-open model
    expect(clipAndRebase({ start: 0, end: 10 }, SEL_START, SEL_END)).toBeNull();
  });

  it('drops an interval that touches the right boundary but does not overlap', () => {
    // interval [20, 30) starts exactly at selEnd → no overlap in half-open model
    expect(clipAndRebase({ start: 20, end: 30 }, SEL_START, SEL_END)).toBeNull();
  });

  it('drops a zero-length interval that falls inside the selection', () => {
    // zero-length interval [10, 10) has no bases → must be filtered
    expect(clipAndRebase({ start: 10, end: 10 }, SEL_START, SEL_END)).toBeNull();
  });

  it('returns null for an interval wholly outside the selection (left)', () => {
    expect(clipAndRebase({ start: 0, end: 5 }, SEL_START, SEL_END)).toBeNull();
  });

  it('returns null for an interval wholly outside the selection (right)', () => {
    expect(clipAndRebase({ start: 25, end: 30 }, SEL_START, SEL_END)).toBeNull();
  });

  it('handles an interval that spans the entire selection', () => {
    // interval [5, 30) fully covers selection [10, 20) → rebased [0, 10)
    expect(clipAndRebase({ start: 5, end: 30 }, SEL_START, SEL_END)).toEqual({
      start: 0,
      end: 10,
    });
  });

  it('computes correct length guard – selection length is Math.max(0, end - start)', () => {
    // When selEnd <= selStart the selection is degenerate; all intervals are dropped
    expect(clipAndRebase({ start: 10, end: 15 }, 20, 10)).toBeNull();
  });
});

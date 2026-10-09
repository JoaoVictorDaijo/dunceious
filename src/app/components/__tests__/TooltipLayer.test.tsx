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

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@/src/app/testing/renderHarness';
import TooltipLayer from '../TooltipLayer';

function setup() {
  render(
    <>
      <button data-tip="Zoom in" data-tip-kbd="+">plus</button>
      <button data-tip="Zoom out">minus</button>
      <TooltipLayer />
    </>,
  );
  return { plus: screen.getByText('plus'), minus: screen.getByText('minus') };
}

describe('TooltipLayer', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('shows the data-tip text and shortcut after the hover delay and links it to the trigger', () => {
    const { plus } = setup();
    fireEvent.pointerOver(plus);
    expect(screen.queryByRole('tooltip')).toBeNull();
    act(() => { vi.advanceTimersByTime(400); });
    const tip = screen.getByRole('tooltip');
    expect(tip.textContent).toBe('Zoom in+');
    expect(plus.getAttribute('aria-describedby')).toBe(tip.id);
  });

  it('hides on press and unlinks the trigger', () => {
    const { plus } = setup();
    fireEvent.pointerOver(plus);
    act(() => { vi.advanceTimersByTime(400); });
    fireEvent.pointerDown(plus);
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(plus.hasAttribute('aria-describedby')).toBe(false);
  });

  it('opens the next tooltip immediately while the user scans a toolbar', () => {
    const { plus, minus } = setup();
    fireEvent.pointerOver(plus);
    act(() => { vi.advanceTimersByTime(400); });
    fireEvent.pointerOver(minus);
    act(() => { vi.advanceTimersByTime(0); });
    expect(screen.getByRole('tooltip').textContent).toBe('Zoom out');
  });
});

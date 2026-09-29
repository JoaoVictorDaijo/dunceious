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
import { describe, it, expect } from 'vitest';
import { render, installCanvasRecorder, stubResizeObserver } from '../renderHarness';

describe('renderHarness', () => {
  it('records canvas fillText via installCanvasRecorder', () => {
    const recorder = installCanvasRecorder();
    const ctx = document.createElement('canvas').getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillText('X', 1, 2);
    expect(recorder.texts()).toEqual(['X']);
    ctx.fillRect(1, 2, 3, 4);
    expect(recorder.fillRects()).toEqual([[1, 2, 3, 4]]);
  });

  it('renders a React component into the document', () => {
    const { getByText } = render(<div>hello-harness</div>);
    expect(getByText('hello-harness')).toBeTruthy();
  });

  it('provides a no-op ResizeObserver via stubResizeObserver', () => {
    stubResizeObserver();
    const RO = (globalThis as { ResizeObserver?: new (cb: () => void) => unknown }).ResizeObserver!;
    const ro = new RO(() => {}) as { observe: (el: Element) => void };
    expect(() => ro.observe(document.body)).not.toThrow();
  });
});

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
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@/src/app/testing/renderHarness';
import { TOUCH_SLOP_PX } from '@/src/app/viewer/touchGesture';
import { useSelectDragNotice, useShowroomGuards } from '../useShowroomGuards';
import type { ExplainId } from '../explanations';

const onExplain = vi.fn<(id: ExplainId, anchor?: DOMRect) => void>();
const onFeatureClick = vi.fn();
const onFeatureMenu = vi.fn();
const onFeatureMove = vi.fn();

const onChromeClick = vi.fn();

function Guarded() {
  const root = useRef<HTMLDivElement>(null);
  const viewer = useRef<HTMLDivElement>(null);
  useShowroomGuards(root, viewer, onExplain);
  return <div ref={root} data-testid="root">
    <button onClick={onChromeClick}>Chrome</button>
    <input aria-label="Search field" />
    <div ref={viewer}>
      <button onClick={onFeatureClick} onContextMenu={onFeatureMenu} onPointerMove={onFeatureMove}>Feature</button>
      <input aria-label="Go to" />
      <a href="https://www.ebi.ac.uk/about/terms-of-use/">Terms of use</a>
      <a href="/docs">Local page</a>
    </div>
  </div>;
}

const touch = { pointerType: 'touch', pointerId: 7, clientX: 100, clientY: 50 };
const explained = () => onExplain.mock.calls.map(([id]) => id);

beforeEach(() => { vi.useFakeTimers(); onExplain.mockReset(); onFeatureClick.mockReset(); onFeatureMenu.mockReset(); onFeatureMove.mockReset(); onChromeClick.mockReset(); });
afterEach(() => { vi.useRealTimers(); });

describe('useShowroomGuards: context menus', () => {
  it('explains a right-click instead of opening the menu below it', () => {
    render(<Guarded />);
    const event = fireEvent.contextMenu(screen.getByText('Feature'), { clientX: 30, clientY: 40 });
    expect(event).toBe(false);
    expect(onFeatureMenu).not.toHaveBeenCalled();
    expect(explained()).toEqual(['context-menu']);
    expect(onExplain.mock.calls[0][1]).toMatchObject({ x: 30, y: 40 });
  });

  it('turns a 500 ms touch into one explanation that consumes the touch', () => {
    render(<Guarded />);
    const feature = screen.getByText('Feature');
    fireEvent.pointerDown(feature, touch);
    act(() => { vi.advanceTimersByTime(499); });
    expect(onExplain).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(explained()).toEqual(['context-menu']);
    expect(fireEvent.contextMenu(feature, { clientX: 100, clientY: 50 })).toBe(false);
    fireEvent.pointerMove(feature, { ...touch, clientX: 160 });
    fireEvent.pointerUp(feature, touch);
    fireEvent.click(feature, { clientX: 100, clientY: 50 });
    expect(explained()).toEqual(['context-menu']);
    expect(onFeatureMenu).not.toHaveBeenCalled();
    expect(onFeatureMove).not.toHaveBeenCalled();
    expect(onFeatureClick).not.toHaveBeenCalled();
    fireEvent.click(feature, { clientX: 100, clientY: 50 });
    expect(onFeatureClick).toHaveBeenCalledTimes(1);
  });

  it('explains once when the browser opens its own menu before the timer', () => {
    render(<Guarded />);
    const feature = screen.getByText('Feature');
    fireEvent.pointerDown(feature, touch);
    act(() => { vi.advanceTimersByTime(400); });
    fireEvent.contextMenu(feature, { clientX: 100, clientY: 50 });
    act(() => { vi.advanceTimersByTime(200); });
    fireEvent.pointerUp(feature, touch);
    fireEvent.click(feature, { clientX: 100, clientY: 50 });
    expect(explained()).toEqual(['context-menu']);
    expect(onFeatureClick).not.toHaveBeenCalled();
  });

  it.each([
    ["movement reaching the viewer's pan slop", (el: Element) => fireEvent.pointerMove(el, { ...touch, clientX: 100 + TOUCH_SLOP_PX })],
    ['a second finger', (el: Element) => fireEvent.pointerDown(el, { ...touch, pointerId: 8 })],
    ['pointercancel', (el: Element) => fireEvent.pointerCancel(el, touch)],
    ['lifting the finger', (el: Element) => fireEvent.pointerUp(el, touch)],
    ['rotation', () => fireEvent(window, new Event('orientationchange'))],
  ])('cancels the long-press on %s', (_label, interrupt) => {
    render(<Guarded />);
    const feature = screen.getByText('Feature');
    fireEvent.pointerDown(feature, touch);
    fireEvent.pointerMove(feature, { ...touch, clientX: 100 + TOUCH_SLOP_PX - 1 });
    interrupt(feature);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(onExplain).not.toHaveBeenCalled();
  });

  it('leaves mouse presses alone', () => {
    render(<Guarded />);
    fireEvent.pointerDown(screen.getByText('Feature'), { ...touch, pointerType: 'mouse' });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(onExplain).not.toHaveBeenCalled();
  });
});

describe('useShowroomGuards: scope', () => {
  it('lets a later tap through when the long-press produced no click', () => {
    render(<Guarded />);
    const feature = screen.getByText('Feature');
    fireEvent.pointerDown(feature, touch);
    act(() => { vi.advanceTimersByTime(500); });
    fireEvent.pointerUp(feature, touch);
    fireEvent.pointerDown(feature, { ...touch, pointerId: 9 });
    fireEvent.pointerUp(feature, { ...touch, pointerId: 9 });
    fireEvent.click(feature, { clientX: 100, clientY: 50 });
    expect(onFeatureClick).toHaveBeenCalledTimes(1);
  });

  it.each(['Search field', 'Go to'])('leaves a long-press on the %s input to the browser', label => {
    render(<Guarded />);
    const field = screen.getByLabelText(label);
    field.focus();
    fireEvent.pointerDown(field, touch);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(fireEvent.contextMenu(field)).toBe(true);
    expect(onExplain).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(field);
  });

  it('guards presses on the viewer only, not the chrome around it', () => {
    render(<Guarded />);
    const chrome = screen.getByText('Chrome');
    fireEvent.pointerDown(chrome, touch);
    act(() => { vi.advanceTimersByTime(1000); });
    fireEvent.pointerUp(chrome, touch);
    expect(fireEvent.contextMenu(chrome)).toBe(true);
    fireEvent.click(chrome, { clientX: 100, clientY: 50 });
    expect(onExplain).not.toHaveBeenCalled();
    expect(onChromeClick).toHaveBeenCalledTimes(1);
  });
});

describe('useShowroomGuards: links', () => {
  it.each(['click', 'auxclick', 'contextmenu', 'dragstart'])('stops %s on a link to another origin', type => {
    render(<Guarded />);
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: type === 'auxclick' ? 1 : 0 });
    expect(fireEvent(screen.getByText('Terms of use'), event)).toBe(false);
    expect(explained()).toEqual(['external-link']);
  });

  it('stops links outside the showroom root, such as portals', () => {
    render(<Guarded />);
    const outside = document.createElement('a');
    outside.href = 'https://www.ebi.ac.uk/jdispatcher/assets/html/privacy-notice.pdf';
    document.body.append(outside);
    expect(fireEvent.click(outside)).toBe(false);
    outside.remove();
    expect(explained()).toEqual(['external-link']);
  });

  it('lets same-origin links through', () => {
    render(<Guarded />);
    expect(fireEvent.click(screen.getByText('Local page'))).toBe(true);
    expect(onExplain).not.toHaveBeenCalled();
  });
});

describe('useShowroomGuards: lifecycle', () => {
  it('stops text selection on the root and removes everything on unmount', () => {
    const { unmount } = render(<Guarded />);
    expect(screen.getByTestId('root').style.userSelect).toBe('none');
    unmount();
    const link = document.createElement('a');
    link.href = 'https://www.ebi.ac.uk/';
    document.body.append(link);
    expect(fireEvent.click(link)).toBe(true);
    expect(fireEvent.contextMenu(document.body)).toBe(true);
    link.remove();
    expect(onExplain).not.toHaveBeenCalled();
  });
});

function SelectArea({ active }: { active: boolean }) {
  const area = useRef<HTMLDivElement>(null);
  useSelectDragNotice(area, active, onExplain);
  return <div ref={area}>Viewer</div>;
}

describe('useSelectDragNotice', () => {
  it('explains Select mode once, on the first touch drag', () => {
    render(<SelectArea active />);
    const area = screen.getByText('Viewer');
    for (let i = 0; i < 2; i++) {
      fireEvent.pointerDown(area, touch);
      fireEvent.pointerMove(area, { ...touch, clientX: 120 });
      fireEvent.pointerUp(area, touch);
    }
    expect(explained()).toEqual(['select-mode']);
  });

  it('stays quiet in Pan mode and for taps', () => {
    const { rerender } = render(<SelectArea active={false} />);
    const area = screen.getByText('Viewer');
    fireEvent.pointerDown(area, touch);
    fireEvent.pointerMove(area, { ...touch, clientX: 120 });
    rerender(<SelectArea active />);
    fireEvent.pointerDown(area, touch);
    fireEvent.pointerMove(area, { ...touch, clientX: 100 + TOUCH_SLOP_PX - 1 });
    expect(onExplain).not.toHaveBeenCalled();
    fireEvent.pointerMove(area, { ...touch, clientX: 100 + TOUCH_SLOP_PX });
    expect(explained()).toEqual(['select-mode']);
  });
});

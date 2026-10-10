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
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@/src/app/testing/renderHarness';
import { createAlignmentProgress, type RemoteAlignmentState } from '@/src/app/shared/logic/remoteAlignment';

let AlignmentJobPill: typeof import('../AlignmentJobPill').default;
let width: number;
let resize: () => void;
const disconnect = vi.fn();
const capture = vi.fn();
const release = vi.fn();
const state: RemoteAlignmentState = {
  ...createAlignmentProgress('mafft', 2, 100, 0), phase: 'done', jobId: 'job', elapsed: 1000,
};

beforeEach(async () => {
  vi.resetModules();
  AlignmentJobPill = (await import('../AlignmentJobPill')).default;
  width = 200;
  resize = () => {};
  vi.stubGlobal('innerWidth', 1000);
  vi.stubGlobal('innerHeight', 800);
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resize = callback; }
    observe() {}
    disconnect = disconnect;
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return new DOMRect(Number.parseFloat(this.style.left) || 780, Number.parseFloat(this.style.top) || 720, width, 48);
  });
  vi.stubGlobal('PointerEvent', class extends MouseEvent {
    readonly pointerId: number;
    readonly isPrimary: boolean;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.isPrimary = init.isPrimary ?? true;
    }
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function mount() {
  const onOpen = vi.fn();
  const view = render(<AlignmentJobPill state={state} onOpen={onOpen} />);
  const button = screen.getByRole('button') as HTMLButtonElement;
  Object.assign(button, { setPointerCapture: capture, releasePointerCapture: release, hasPointerCapture: () => true });
  return { ...view, button, pill: button.parentElement!, onOpen };
}

function point(button: HTMLElement, phase: 'down' | 'move' | 'up', x: number, y: number, extra: PointerEventInit = {}) {
  const init = { pointerId: 1, isPrimary: true, button: 0, clientX: x, clientY: y, ...extra };
  if (phase === 'down') fireEvent.pointerDown(button, init);
  if (phase === 'move') fireEvent.pointerMove(button, init);
  if (phase === 'up') fireEvent.pointerUp(button, init);
}

function expectPosition(pill: HTMLElement, x: number, y: number) {
  expect(pill.style.left).toBe(`${x}px`);
  expect(pill.style.top).toBe(`${y}px`);
}

it('keeps a small pointer movement as a click without jumping', () => {
  const { button, pill, onOpen } = mount();
  expectPosition(pill, 780, 720);
  point(button, 'down', 800, 740);
  point(button, 'move', 802, 741);
  expectPosition(pill, 780, 720);
  point(button, 'up', 802, 741);
  fireEvent.click(button);
  expect(onOpen).toHaveBeenCalledOnce();
});

it.each(['mouse', 'touch', 'pen'])('drags with %s, captures the pointer and suppresses the following click', pointerType => {
  const { button, pill, onOpen } = mount();
  point(button, 'down', 800, 740, { pointerType });
  expect(capture).toHaveBeenCalledWith(1);
  point(button, 'move', 600, 540, { pointerType });
  expectPosition(pill, 580, 520);
  expect(button.className).toContain('cursor-grabbing');
  point(button, 'up', 600, 540, { pointerType });
  expect(release).toHaveBeenCalledWith(1);
  fireEvent.click(button, { detail: 1 });
  expect(onOpen).not.toHaveBeenCalled();
  point(button, 'down', 600, 540);
  point(button, 'up', 600, 540);
  fireEvent.click(button);
  expect(onOpen).toHaveBeenCalledOnce();
});

it('keeps the entire pill within all viewport edges while dragging', () => {
  const { button, pill } = mount();
  point(button, 'down', 800, 740);
  point(button, 'move', -1000, -1000);
  expectPosition(pill, 0, 0);
  point(button, 'move', 2000, 2000);
  expectPosition(pill, 800, 752);
});

it('ignores secondary buttons and unrelated pointers', () => {
  const { button, pill } = mount();
  point(button, 'down', 800, 740, { button: 2 });
  point(button, 'move', 200, 200);
  expectPosition(pill, 780, 720);
  point(button, 'down', 800, 740);
  point(button, 'down', 900, 700, { pointerId: 2, isPrimary: false });
  point(button, 'move', 300, 300, { pointerId: 2 });
  point(button, 'up', 300, 300, { pointerId: 2 });
  expectPosition(pill, 780, 720);
  point(button, 'move', 600, 540);
  expectPosition(pill, 580, 520);
});

it.each(['pointerCancel', 'lostPointerCapture'] as const)('ends a drag on %s and preserves keyboard activation', event => {
  const { button, pill, onOpen } = mount();
  point(button, 'down', 800, 740);
  point(button, 'move', 600, 540);
  fireEvent[event](button, { pointerId: 1 });
  point(button, 'move', 100, 100);
  expectPosition(pill, 580, 520);
  expect(button.className).not.toContain('cursor-grabbing');
  fireEvent.keyDown(button, { key: 'Enter' });
  fireEvent.click(button, { detail: 0 });
  expect(onOpen).toHaveBeenCalledOnce();
});

it('moves by arrow keys with larger Shift steps and prevents page scrolling', () => {
  const { button, pill, onOpen } = mount();
  button.focus();
  expect(fireEvent.keyDown(button, { key: 'ArrowLeft' })).toBe(false);
  expectPosition(pill, 770, 720);
  fireEvent.keyDown(button, { key: 'ArrowUp', shiftKey: true });
  expectPosition(pill, 770, 670);
  fireEvent.keyDown(button, { key: 'ArrowRight', shiftKey: true });
  expectPosition(pill, 800, 670);
  expect(onOpen).not.toHaveBeenCalled();
  expect(fireEvent.keyDown(button, { key: 'Enter' })).toBe(true);
  fireEvent.click(button, { detail: 0 });
  expect(onOpen).toHaveBeenCalledOnce();
});

it('remembers a moved position across unmounts during the page load', () => {
  const first = mount();
  fireEvent.keyDown(first.button, { key: 'ArrowLeft', shiftKey: true });
  first.unmount();
  expectPosition(mount().pill, 730, 720);
});

it('resets an invalid stored spot to the default corner on remount', () => {
  const first = mount();
  fireEvent.keyDown(first.button, { key: 'ArrowLeft' });
  first.unmount();
  vi.stubGlobal('innerWidth', 600);
  expectPosition(mount().pill, 380, 720);
});

it('keeps the pill visible on viewport resize and content growth', () => {
  const { button, pill, unmount } = mount();
  fireEvent.keyDown(button, { key: 'ArrowLeft' });
  vi.stubGlobal('innerWidth', 600);
  vi.stubGlobal('innerHeight', 400);
  fireEvent(window, new Event('resize'));
  expectPosition(pill, 380, 320);
  width = 350;
  act(() => resize());
  expectPosition(pill, 230, 320);
  unmount();
  expect(disconnect).toHaveBeenCalledOnce();
});

it('describes movement and announces stage changes outside the drag handle', () => {
  const { button, rerender, onOpen } = mount();
  expect(button.getAttribute('aria-label')).toMatch(/open.*monitor/i);
  const description = document.getElementById(button.getAttribute('aria-describedby')!);
  expect(description?.textContent).toMatch(/drag.*arrow.*shift/i);
  const status = screen.getByRole('status');
  expect(status.contains(button)).toBe(false);
  expect(status.getAttribute('aria-live')).toBe('polite');
  expect(status.textContent).toBe('Aligned');
  rerender(<AlignmentJobPill state={{ ...state, phase: 'failed', reason: 'network', detail: 'Offline' }} onOpen={onOpen} />);
  expect(status.textContent).toMatch(/Alignment failed/);
  expect(status.textContent).not.toMatch(/1 s/);
});

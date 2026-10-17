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

import { expect, vi } from 'vitest';
import { act, fireEvent, installCanvasRecorder, render, screen, stubResizeObserver } from '@/src/app/testing/renderHarness';
import Showroom from '../Showroom';

type Listener = (event: { matches: boolean }) => void;

/** A controllable `(orientation: landscape)` query; every other query is false. Returns `rotate`. */
export function stubOrientation(landscape: boolean) {
  const listeners = new Set<Listener>();
  let current = landscape;
  vi.stubGlobal('matchMedia', (query: string) => ({
    media: query,
    get matches() { return query === '(orientation: landscape)' ? current : false; },
    addEventListener: (_type: string, listener: Listener) => listeners.add(listener),
    removeEventListener: (_type: string, listener: Listener) => listeners.delete(listener),
  }));
  return (next: boolean) => { current = next; act(() => listeners.forEach(listener => listener({ matches: next }))); };
}

/** jsdom ignores `inert`, but browsers refuse focus inside it, which is what keeps a portrait dialog from taking focus. */
export function emulateInert() {
  const focus = HTMLElement.prototype.focus;
  vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(function (this: HTMLElement, options?: FocusOptions) {
    if (!this.closest('[inert]')) focus.call(this, options);
  });
}

/**
 * The showroom held sideways at phone size, as the existing showroom tests set it
 * up, with every side effect a visitor must never trigger under a spy.
 */
export function mountShowroom({ onExit = () => {} }: { onExit?: () => void } = {}) {
  const rotate = stubOrientation(true);
  installCanvasRecorder();
  stubResizeObserver();
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(320);
  const writeText = vi.fn(async () => {});
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
  const effects = {
    confirm: vi.spyOn(window, 'confirm'),
    writeText,
    fileClick: vi.spyOn(HTMLInputElement.prototype, 'click'),
    storage: (['getItem', 'setItem', 'removeItem', 'clear'] as const).map(method => vi.spyOn(Storage.prototype, method)),
  };
  const view = render(<Showroom onExit={onExit} />);
  return {
    ...view,
    rotate,
    /** No native dialog, clipboard write, file picker or storage access happened. */
    expectNoSideEffects() {
      expect(effects.confirm).not.toHaveBeenCalled();
      expect(effects.writeText).not.toHaveBeenCalled();
      expect(effects.fileClick).not.toHaveBeenCalled();
      effects.storage.forEach(spy => expect(spy).not.toHaveBeenCalled());
    },
  };
}

export const explanation = (title: string) => screen.getByRole('dialog', { name: title });
export const gotIt = () => fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
export const noExplanation = () => expect(document.querySelector('[data-showroom-explain]')).toBeNull();

/** Taps a control and checks it explains under `title`, then dismisses the explanation. */
export function expectExplains(control: HTMLElement, title: string) {
  fireEvent.click(control);
  expect(explanation(title)).toBeTruthy();
  gotIt();
  noExplanation();
}

export function openHub() {
  fireEvent.click(screen.getByRole('button', { name: 'Annotation Hub' }));
  return screen.getByRole('region', { name: 'Annotation Hub' });
}

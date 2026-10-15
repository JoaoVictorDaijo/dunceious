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
import { act, fireEvent, installCanvasRecorder, render, screen, stubResizeObserver, within } from '@/src/app/testing/renderHarness';
import Showroom from '../Showroom';

type Listener = (event: { matches: boolean }) => void;

/** A controllable `(orientation: landscape)` query; every other query is false. */
function stubOrientation(landscape: boolean) {
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

beforeEach(() => {
  installCanvasRecorder();
  stubResizeObserver();
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(320);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const explanation = (title: string) => screen.getByRole('dialog', { name: title });
const gotIt = () => fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
const openSidebar = () => fireEvent.click(screen.getByRole('button', { name: 'Show sidebar' }));
const goToField = (container: HTMLElement) => container.querySelector('input[placeholder="Go to..."]');

describe('Showroom orientation', () => {
  it('asks for landscape in portrait, and Back leaves', () => {
    stubOrientation(false);
    const onExit = vi.fn();
    render(<Showroom onExit={onExit} />);
    expect(screen.getByText('Turn your phone sideways')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Exit' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('shows the workbench sideways with the marker, Exit and the real viewer', () => {
    stubOrientation(true);
    const onExit = vi.fn();
    const { container } = render(<Showroom onExit={onExit} />);
    expect(screen.queryByText('Turn your phone sideways')).toBeNull();
    expect(screen.getByText('Test drive')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Visual Viewport' }).getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('[data-viewer-record="NC_045512"]')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Exit' }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('rotation keeps the session', () => {
    const rotate = stubOrientation(true);
    const { container } = render(<Showroom onExit={() => {}} />);
    const viewerField = goToField(container);
    openSidebar();
    fireEvent.click(screen.getByRole('button', { name: 'Hide NC_012920 in viewport' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select mode' }));
    rotate(false);
    expect(screen.getByText('Turn your phone sideways')).toBeTruthy();
    rotate(true);
    expect(screen.queryByText('Turn your phone sideways')).toBeNull();
    expect(screen.getByRole('button', { name: 'Show NC_012920 in viewport' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Select mode' }).getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('[data-viewer-record="NC_012920"]')).toBeNull();
    expect(goToField(container)).toBe(viewerField);
  });
});

describe('Showroom chrome', () => {
  beforeEach(() => { stubOrientation(true); });

  it('dismisses the first-visit strip', () => {
    render(<Showroom onExit={() => {}} />);
    expect(screen.getByText('This is a test drive with sample data. Tap anything to see what it does. Nothing is saved.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText(/This is a test drive/)).toBeNull();
  });

  it.each([
    ['Annotation Hub', 'Annotation Hub'],
    ['Project', 'Project'],
    ['Options', 'Options'],
  ])('%s explains', (control, title) => {
    render(<Showroom onExit={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: control }));
    expect(explanation(title)).toBeTruthy();
    gotIt();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps the workbench layer order and disables Conservation with its reason', () => {
    render(<Showroom onExit={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Layers 3/4' }));
    const menu = screen.getByRole('group', { name: 'Layer options' });
    expect(within(menu).getAllByRole('button').map(button => button.textContent)).toEqual(['Annotations', 'Tracks', 'Translation', 'Conservation']);
    const conservation = within(menu).getByRole('button', { name: 'Conservation' });
    expect(conservation.getAttribute('aria-disabled')).toBe('true');
    expect(within(menu).getByText('Conservation needs an alignment: upload a pre-aligned FASTA first')).toBeTruthy();
    fireEvent.click(conservation);
    expect(explanation('Conservation')).toBeTruthy();
    fireEvent.click(within(menu).getByRole('button', { name: 'Annotations' }));
    expect(screen.getByRole('button', { name: 'Layers 2/4' })).toBeTruthy();
  });

  it('keeps the sidebar sections in the workbench order and explains what would load or remove', () => {
    render(<Showroom onExit={() => {}} />);
    openSidebar();
    const sidebar = screen.getByRole('complementary', { name: 'Sidebar' });
    expect(within(sidebar).getAllByRole('heading').map(heading => heading.textContent)).toEqual(['Record Navigator', 'Navigation', 'Ingestion']);
    for (const card of ['Drop input batch', 'Upload pre-aligned FASTA', 'Import annotations', 'Load project JSON']) {
      fireEvent.click(within(sidebar).getByRole('button', { name: new RegExp(card) }));
      expect(explanation(card)).toBeTruthy();
      gotIt();
    }
    fireEvent.click(within(sidebar).getByRole('button', { name: 'Remove NC_045512' }));
    expect(explanation('Remove sequence')).toBeTruthy();
    gotIt();
    fireEvent.click(within(sidebar).getByRole('button', { name: 'Add sequences…' }));
    expect(explanation('Drop input batch')).toBeTruthy();
  });
});

describe('Showroom viewer guards', () => {
  beforeEach(() => { stubOrientation(true); });

  const feature = (container: HTMLElement) => {
    const part = container.querySelector('[data-viewer-record="NC_045512"] [data-annotation-part]');
    if (!part) throw new Error('no annotation rendered');
    return part;
  };

  it('explains a tapped feature instead of opening its details', () => {
    const { container } = render(<Showroom onExit={() => {}} />);
    fireEvent.click(feature(container));
    expect(explanation('Details')).toBeTruthy();
  });

  it('explains a right-click and never renders the viewer menu', () => {
    const { container } = render(<Showroom onExit={() => {}} />);
    fireEvent.contextMenu(feature(container), { clientX: 200, clientY: 120 });
    expect(explanation('Right-click menu')).toBeTruthy();
    expect(screen.queryByText('Annotation Actions')).toBeNull();
  });

  it('long-press consumes the touch', () => {
    const writeText = vi.fn();
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const confirm = vi.spyOn(window, 'confirm');
    vi.useFakeTimers();
    const { container } = render(<Showroom onExit={() => {}} />);
    const part = feature(container);
    const touch = { pointerType: 'touch', pointerId: 3, clientX: 200, clientY: 120 };
    fireEvent.pointerDown(part, touch);
    act(() => { vi.advanceTimersByTime(500); });
    fireEvent.contextMenu(part, { clientX: 200, clientY: 120 });
    fireEvent.pointerUp(part, touch);
    fireEvent.click(part, { clientX: 200, clientY: 120 });
    expect(screen.getAllByRole('dialog').map(dialog => dialog.getAttribute('data-showroom-explain'))).toEqual(['context-menu']);
    expect(screen.queryByText('Annotation Actions')).toBeNull();
    expect(writeText).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
  });
});

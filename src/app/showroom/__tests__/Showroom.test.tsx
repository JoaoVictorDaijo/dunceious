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
import { stubOrientation } from './showroomTestKit';

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
    expect(container.querySelector('[data-viewer-record="NC_001604"]')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Exit' }));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('rotation keeps the session', () => {
    const rotate = stubOrientation(true);
    const { container } = render(<Showroom onExit={() => {}} />);
    const viewerField = goToField(container);
    openSidebar();
    fireEvent.click(screen.getByRole('button', { name: 'Hide NC_003298 in viewport' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select mode' }));
    fireEvent.change(screen.getByPlaceholderText('Enter IUPAC sequence...'), { target: { value: 'TAATACGACTCACTATAG' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    const hits = screen.getAllByRole('button', { name: /^Annotate match/ }).length;
    rotate(false);
    expect(screen.getByText('Turn your phone sideways')).toBeTruthy();
    rotate(true);
    expect(screen.queryByText('Turn your phone sideways')).toBeNull();
    expect(screen.getByRole('button', { name: 'Show NC_003298 in viewport' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Select mode' }).getAttribute('aria-pressed')).toBe('true');
    expect(container.querySelector('[data-viewer-record="NC_003298"]')).toBeNull();
    expect(goToField(container)).toBe(viewerField);
    expect((screen.getByPlaceholderText('Enter IUPAC sequence...') as HTMLInputElement).value).toBe('TAATACGACTCACTATAG');
    expect(screen.getAllByRole('button', { name: /^Annotate match/ })).toHaveLength(hits);
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

  it('Project and options explains', () => {
    render(<Showroom onExit={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Project and options' }));
    expect(explanation('Project and options')).toBeTruthy();
    gotIt();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps the workbench layer order and lets Conservation toggle over the aligned sample', () => {
    render(<Showroom onExit={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Layers 3/4' }));
    const menu = screen.getByRole('group', { name: 'Layer options' });
    expect(within(menu).getAllByRole('button').map(button => button.textContent)).toEqual(['Annotations', 'Tracks', 'Translation', 'Conservation']);
    // The sample opens already aligned, so the layer that needs an alignment is live.
    const conservation = within(menu).getByRole('button', { name: 'Conservation' });
    expect(conservation.getAttribute('aria-disabled')).toBe('false');
    expect(within(menu).queryByText('Conservation needs an alignment: upload a pre-aligned FASTA first')).toBeNull();
    fireEvent.click(conservation);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Layers 4/4' })).toBeTruthy();
    fireEvent.click(within(menu).getByRole('button', { name: 'Annotations' }));
    expect(screen.getByRole('button', { name: 'Layers 3/4' })).toBeTruthy();
  });

  it('explains what would load or remove', () => {
    render(<Showroom onExit={() => {}} />);
    openSidebar();
    const sidebar = screen.getByRole('complementary', { name: 'Sidebar' });
    for (const card of ['Drop input batch', 'Upload pre-aligned FASTA', 'Import annotations', 'Load project JSON']) {
      fireEvent.click(within(sidebar).getByRole('button', { name: new RegExp(card) }));
      expect(explanation(card)).toBeTruthy();
      gotIt();
    }
    fireEvent.click(within(sidebar).getByRole('button', { name: 'Remove NC_001604' }));
    expect(explanation('Remove sequence')).toBeTruthy();
    gotIt();
    fireEvent.click(within(sidebar).getByRole('button', { name: 'Add sequences…' }));
    expect(explanation('Drop input batch')).toBeTruthy();
  });
});

describe('Showroom viewer guards', () => {
  beforeEach(() => { stubOrientation(true); });

  const feature = (container: HTMLElement) => {
    const part = container.querySelector('[data-viewer-record="NC_001604"] [data-annotation-part]');
    if (!part) throw new Error('no annotation rendered');
    return part;
  };

  it('clears a selection locally and offers Compare over the aligned sample', () => {
    render(<Showroom onExit={() => {}} />);
    openSidebar();
    fireEvent.change(screen.getByPlaceholderText('Enter IUPAC sequence...'), { target: { value: 'TAATACGACTCACTATAG' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(screen.getByRole('button', { name: 'Clear selection' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect(screen.queryByRole('button', { name: 'Clear selection' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Compare to reference' })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens the details of a tapped feature', () => {
    const { container } = render(<Showroom onExit={() => {}} />);
    fireEvent.click(feature(container));
    expect(screen.getByRole('heading', { name: 'Annotation Details' })).toBeTruthy();
    expect(container.ownerDocument.querySelector('[data-showroom-explain]')).toBeNull();
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

describe('Showroom review fixes', () => {
  const touch = { pointerType: 'touch', pointerId: 4, clientX: 30, clientY: 20 };

  it('leaves a long-press on the search field and the chrome alone', () => {
    stubOrientation(true);
    vi.useFakeTimers();
    render(<Showroom onExit={() => {}} />);
    openSidebar();
    const field = screen.getByPlaceholderText('Enter IUPAC sequence...');
    field.focus();
    fireEvent.pointerDown(field, touch);
    act(() => { vi.advanceTimersByTime(800); });
    fireEvent.pointerUp(field, touch);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(field);
    const project = screen.getByRole('button', { name: 'Project and options' });
    fireEvent.pointerDown(project, { ...touch, pointerId: 5 });
    act(() => { vi.advanceTimersByTime(800); });
    fireEvent.pointerUp(project, { ...touch, pointerId: 5 });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('moves focus to the new Got it when a second explanation replaces the first', () => {
    stubOrientation(true);
    render(<Showroom onExit={() => {}} />);
    openSidebar();
    fireEvent.click(screen.getByRole('button', { name: 'Project and options' }));
    const remove = screen.getByRole('button', { name: 'Remove NC_001604' });
    remove.focus();
    fireEvent.click(remove);
    const dialog = explanation('Remove sequence');
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Got it' }));
  });

  it('hides the alignment dialog and the explanation in portrait and brings them back sideways', () => {
    const rotate = stubOrientation(true);
    render(<Showroom onExit={() => {}} />);
    openSidebar();
    fireEvent.click(screen.getByRole('button', { name: 'Align sequences' }));
    fireEvent.click(screen.getByRole('button', { name: 'Project and options' }));
    rotate(false);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText('Test drive: nothing will be sent')).toBeNull();
    rotate(true);
    expect(screen.getByRole('dialog', { name: 'Your sequences will leave this browser' })).toBeTruthy();
    expect(explanation('Project and options')).toBeTruthy();
  });

  it('asks for alignment consent again after leaving and coming back', () => {
    stubOrientation(true);
    const first = render(<Showroom onExit={() => {}} />);
    openSidebar();
    fireEvent.click(screen.getByRole('button', { name: 'Align sequences' }));
    const consent = screen.getByRole('dialog', { name: 'Your sequences will leave this browser' });
    fireEvent.click(within(consent).getByRole('checkbox'));
    fireEvent.click(within(consent).getByRole('button', { name: 'Continue' }));
    expect(screen.getByRole('dialog', { name: 'Align with EMBL-EBI' })).toBeTruthy();
    first.unmount();
    render(<Showroom onExit={() => {}} />);
    openSidebar();
    fireEvent.click(screen.getByRole('button', { name: 'Align sequences' }));
    expect(screen.getByRole('dialog', { name: 'Your sequences will leave this browser' })).toBeTruthy();
  });

  it('closes the drawer on Escape and returns focus to its toggle', () => {
    stubOrientation(true);
    render(<Showroom onExit={() => {}} />);
    const toggle = screen.getByRole('button', { name: 'Show sidebar' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Hide sidebar' }).getAttribute('aria-expanded')).toBe('true');
    screen.getByPlaceholderText('Enter IUPAC sequence...').focus();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(screen.queryByRole('complementary', { name: 'Sidebar' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Show sidebar' }));
  });
});

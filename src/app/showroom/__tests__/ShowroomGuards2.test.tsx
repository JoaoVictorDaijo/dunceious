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
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, within } from '@/src/app/testing/renderHarness';
import { emulateInert, explanation, gotIt, mountShowroom, noExplanation, openHub } from './showroomTestKit';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const nav = () => screen.getByRole('navigation', { name: 'Workbench' });
const exportDialog = () => screen.getByRole('dialog', { name: 'Export sequences' });
const back = () => screen.getByRole('button', { name: 'Back' });
const sidebar = () => screen.getByRole('complementary', { name: 'Sidebar' });
const touch = { pointerType: 'touch', pointerId: 7, clientX: 100, clientY: 50 };

function openExport() {
  fireEvent.click(within(nav()).getByRole('button', { name: 'Export…' }));
  return exportDialog();
}

/** A finger held past the 500 ms long-press, then lifted. */
function longPress(target: Element) {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  try {
    fireEvent.pointerDown(target, touch);
    act(() => { vi.advanceTimersByTime(600); });
    fireEvent.pointerUp(target, touch);
  } finally {
    vi.useRealTimers();
  }
}

/** Focusing Back runs every document `focusin` trap; Back must keep the focus. */
function expectBackReachable(onExit: ReturnType<typeof vi.fn>) {
  back().focus();
  expect(document.activeElement).toBe(back());
  fireEvent.click(back());
  expect(onExit).toHaveBeenCalledTimes(1);
  onExit.mockClear();
}

function openEveryDisclosure() {
  document.querySelectorAll('details').forEach(details => {
    details.open = true;
    fireEvent(details, new Event('toggle'));
  });
}

describe('showroom guards beyond the viewer', () => {
  it('long-press and context menu are guarded in the Hub and in Export', () => {
    const view = mountShowroom();
    const hub = openHub();

    const byFeature = within(hub).getByRole('tab', { name: /^By feature/ });
    expect(fireEvent.contextMenu(byFeature, { clientX: 30, clientY: 40 })).toBe(false);
    longPress(byFeature);
    fireEvent.click(byFeature, { clientX: 100, clientY: 50 });
    expect(byFeature.getAttribute('aria-selected')).toBe('true');
    noExplanation();

    const dialog = openExport();
    const genbank = within(dialog).getByRole('radio', { name: 'GenBank' });
    expect(fireEvent.contextMenu(genbank, { clientX: 30, clientY: 40 })).toBe(false);
    longPress(genbank);
    fireEvent.click(genbank, { clientX: 100, clientY: 50 });
    expect(genbank.getAttribute('aria-checked')).toBe('true');
    noExplanation();

    const fileName = within(dialog).getByRole('textbox', { name: 'File name' });
    longPress(fileName);
    expect(fireEvent.contextMenu(fileName)).toBe(true);
    noExplanation();
    view.expectNoSideEffects();
  });

  it('the viewer keeps explaining its menu, and a long-press there consumes its touch', () => {
    const view = mountShowroom();
    const row = view.container.querySelector('[data-viewer-record="NC_045512"]')!;
    expect(fireEvent.contextMenu(row, { clientX: 30, clientY: 40 })).toBe(false);
    expect(explanation('Right-click menu')).toBeTruthy();
    gotIt();

    const onClick = vi.fn();
    row.addEventListener('click', onClick);
    longPress(row);
    expect(explanation('Right-click menu')).toBeTruthy();
    fireEvent.click(row, { clientX: 100, clientY: 50 });
    expect(onClick).not.toHaveBeenCalled();
    view.expectNoSideEffects();
  });

});

describe('showroom project shortcuts', () => {
  it('Ctrl+S and Meta+O explain and are prevented', () => {
    const view = mountShowroom();
    expect(fireEvent.keyDown(document.body, { key: 's', ctrlKey: true })).toBe(false);
    expect(explanation('Project and options')).toBeTruthy();
    gotIt();

    openHub();
    const fileName = within(openExport()).getByRole('textbox', { name: 'File name' });
    fileName.focus();
    expect(fireEvent.keyDown(fileName, { key: 'O', metaKey: true })).toBe(false);
    expect(explanation('Project and options')).toBeTruthy();
    gotIt();
    expect(exportDialog()).toBeTruthy();

    view.unmount();
    expect(fireEvent.keyDown(document.body, { key: 's', ctrlKey: true })).toBe(true);
    view.expectNoSideEffects();
  });

  it('Ctrl+S and Meta+O are prevented in portrait, where no explanation shows', () => {
    const view = mountShowroom();
    view.rotate(false);
    expect(fireEvent.keyDown(document.body, { key: 's', ctrlKey: true })).toBe(false);
    expect(fireEvent.keyDown(back(), { key: 'o', metaKey: true })).toBe(false);
    expect(fireEvent.keyDown(document.body, { key: 'ы', code: 'KeyS', ctrlKey: true })).toBe(false);
    noExplanation();
    view.rotate(true);
    noExplanation();
    view.expectNoSideEffects();
  });

  it("the Hub's toolbar in the top bar is guarded like the Hub, its search field left to the browser", () => {
    const view = mountShowroom();
    openHub();
    const tools = screen.getByLabelText('Workspace tools');
    const exportButton = within(tools).getByRole('button', { name: 'Export…' });
    expect(fireEvent.contextMenu(exportButton, { clientX: 30, clientY: 40 })).toBe(false);
    longPress(exportButton);
    fireEvent.click(exportButton, { clientX: 100, clientY: 50 });
    expect(exportDialog()).toBeTruthy();
    noExplanation();
    fireEvent.click(within(exportDialog()).getByRole('button', { name: 'Close export dialog' }));

    const search = within(tools).getByRole('searchbox', { name: 'Search annotations' });
    longPress(search);
    expect(fireEvent.contextMenu(search)).toBe(true);
    noExplanation();

    fireEvent.click(screen.getByRole('button', { name: 'Visual Viewport' }));
    expect(fireEvent.contextMenu(within(tools).getByRole('button', { name: 'Pan mode' }))).toBe(true);
    noExplanation();
    view.expectNoSideEffects();
  });
});

describe('showroom portrait over open dialogs', () => {
  it('portrait with Export open keeps Back reachable', () => {
    const onExit = vi.fn();
    const view = mountShowroom({ onExit });
    emulateInert();
    openHub();
    const dialog = openExport();
    fireEvent.click(within(dialog).getByRole('radio', { name: 'GenBank' }));

    view.rotate(false);
    expect(dialog.closest('[inert]')).not.toBeNull();
    expectBackReachable(onExit);

    view.rotate(true);
    expect(exportDialog()).toBe(dialog);
    expect(within(dialog).getByRole('radio', { name: 'GenBank' }).getAttribute('aria-checked')).toBe('true');
    view.expectNoSideEffects();
  });

  it('portrait with the shortcuts sheet or the details panel open keeps Back reachable', () => {
    const onExit = vi.fn();
    const view = mountShowroom({ onExit });
    emulateInert();
    const hub = openHub();
    fireEvent.keyDown(hub, { key: '?' });
    const sheet = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });

    view.rotate(false);
    expect(sheet.closest('[inert]')).not.toBeNull();
    expectBackReachable(onExit);
    view.rotate(true);
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBe(sheet);
    fireEvent.click(within(sheet).getByRole('button', { name: 'Close keyboard shortcuts' }));

    fireEvent.click(screen.getAllByRole('button', { name: /^Inspect .* on NC_045512$/ })[0]);
    expect(screen.getByRole('heading', { name: 'Annotation Details' })).toBeTruthy();
    view.rotate(false);
    expectBackReachable(onExit);
    view.rotate(true);
    expect(screen.getByRole('heading', { name: 'Annotation Details' })).toBeTruthy();
    view.expectNoSideEffects();
  });
});

describe('showroom Export focus', () => {
  it('Export explanation owns focus and returns it', () => {
    const view = mountShowroom();
    openHub();
    const dialog = openExport();
    fireEvent.click(within(dialog).getByRole('radio', { name: 'GenBank' }));
    const final = within(dialog).getByRole('button', { name: 'Export 4 sequences' });

    final.focus();
    fireEvent.click(final);
    const ok = screen.getByRole('button', { name: 'Got it' });
    expect(document.activeElement).toBe(ok);
    fireEvent.keyDown(ok, { key: 'Tab' });
    expect(document.activeElement).toBe(ok);
    fireEvent.keyDown(ok, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(ok);
    fireEvent.keyDown(ok, { key: 'Escape' });
    noExplanation();
    expect(document.activeElement).toBe(final);

    fireEvent.click(final);
    gotIt();
    noExplanation();
    expect(document.activeElement).toBe(final);
    expect(exportDialog()).toBe(dialog);
    expect(within(dialog).getByRole('radio', { name: 'GenBank' }).getAttribute('aria-checked')).toBe('true');
    view.expectNoSideEffects();
  });
});

describe('showroom exit', () => {
  it('exit and re-entry leave no trace', () => {
    const onExit = vi.fn();
    const first = mountShowroom({ onExit });
    fireEvent.click(screen.getByRole('button', { name: 'Show sidebar' }));
    fireEvent.change(within(sidebar()).getByPlaceholderText('Enter IUPAC sequence...'), { target: { value: 'ACGAAC' } });
    fireEvent.click(within(sidebar()).getByRole('button', { name: 'Search' }));
    openEveryDisclosure();
    expect(document.querySelectorAll('details[open]').length).toBeGreaterThan(0);

    const hub = openHub();
    fireEvent.change(within(nav()).getByRole('searchbox', { name: 'Search annotations' }), { target: { value: 'ORF1ab' } });
    fireEvent.click(within(hub.querySelector<HTMLElement>('[data-filter-types]')!).getByRole('button', { name: /^CDS/ }));
    const dialog = openExport();
    fireEvent.click(within(dialog).getByRole('radio', { name: 'GenBank' }));
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'File name' }), { target: { value: 'demo' } });
    openEveryDisclosure();

    fireEvent.click(screen.getByRole('button', { name: 'Exit' }));
    expect(onExit).toHaveBeenCalledTimes(1);
    first.unmount();
    first.expectNoSideEffects();

    const second = mountShowroom();
    fireEvent.click(screen.getByRole('button', { name: 'Show sidebar' }));
    expect((within(sidebar()).getByPlaceholderText('Enter IUPAC sequence...') as HTMLInputElement).value).toBe('');
    const again = openHub();
    expect((within(nav()).getByRole('searchbox', { name: 'Search annotations' }) as HTMLInputElement).value).toBe('');
    expect(within(again.querySelector<HTMLElement>('[data-filter-types]')!).getByRole('button', { name: /^CDS/ }).getAttribute('aria-pressed')).toBe('false');
    const fresh = openExport();
    expect(within(fresh).getByRole('radio', { name: 'FASTA' }).getAttribute('aria-checked')).toBe('true');
    expect((within(fresh).getByRole('textbox', { name: 'File name' }) as HTMLInputElement).value).toBe('sequences');
    expect(document.querySelectorAll('details[open]')).toHaveLength(0);
    second.expectNoSideEffects();
  });
});

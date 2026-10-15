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
import Greeter from '../Greeter';
import { COPIED_RESET_MS } from '../useSendLink';

beforeEach(() => {
  window.scrollTo = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  Reflect.deleteProperty(navigator, 'share');
  Reflect.deleteProperty(navigator, 'clipboard');
});

function stubNavigator(key: 'share' | 'clipboard', value: unknown) {
  Object.defineProperty(navigator, key, { value, configurable: true });
}

describe('Greeter hero', () => {
  it('opens the genome on the D614G site', () => {
    render(<Greeter onOpenWorkbench={() => {}} />);
    const lens = screen.getByRole('slider', { name: 'Position in the SARS-CoV-2 genome' });
    expect(lens.getAttribute('aria-valuenow')).toBe('23403');
    expect(lens.getAttribute('aria-valuetext')).toBe('Base 23,403, S, surface glycoprotein, Codon 614, aspartate (D)');
  });

  it('moves the lens from the keyboard', () => {
    render(<Greeter onOpenWorkbench={() => {}} />);
    const lens = screen.getByRole('slider');
    fireEvent.keyDown(lens, { key: 'ArrowRight' });
    expect(lens.getAttribute('aria-valuenow')).toBe('23404');
    fireEvent.keyDown(lens, { key: 'Home' });
    expect(lens.getAttribute('aria-valuetext')).toBe('Base 1, 5′ untranslated region');
    fireEvent.keyDown(lens, { key: 'End' });
    expect(lens.getAttribute('aria-valuenow')).toBe('29903');
  });

  it('jumps between genes, wrapping at both ends', () => {
    render(<Greeter onOpenWorkbench={() => {}} />);
    const lens = screen.getByRole('slider');
    fireEvent.click(screen.getByRole('button', { name: 'Next gene' }));
    expect(lens.getAttribute('aria-valuetext')).toMatch(/^Base 25,394, ORF3a, ORF3a protein, Codon 1, methionine \(M\)$/);
    fireEvent.click(screen.getByRole('button', { name: 'Previous gene' }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous gene' }));
    expect(lens.getAttribute('aria-valuetext')).toMatch(/^Base 267, ORF1ab/);
    fireEvent.click(screen.getByRole('button', { name: 'Previous gene' }));
    expect(lens.getAttribute('aria-valuetext')).toMatch(/^Base 29,559, ORF10/);
  });

  it('moves the lens to where the genome strip is tapped', () => {
    render(<Greeter onOpenWorkbench={() => {}} />);
    const lens = screen.getByRole('slider') as unknown as SVGSVGElement;
    lens.getBoundingClientRect = () => ({ left: 0, top: 0, width: 342, height: 142 } as DOMRect);
    Object.defineProperty(lens, 'viewBox', { value: { baseVal: { width: 342, height: 142 } } });
    fireEvent.pointerDown(lens, { clientX: 171, clientY: 20, pointerId: 1 });
    expect(lens.getAttribute('aria-valuenow')).toBe(String(Math.round(29_903 / 2)));
    fireEvent.pointerDown(lens, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(lens, { clientX: 100 - 342, clientY: 100, pointerId: 1 });
    expect(lens.getAttribute('aria-valuenow')).toBe(String(Math.round(29_903 / 2) + 21));
  });
});

describe('Greeter home', () => {
  it('opens the workbench on request', () => {
    const onOpenWorkbench = vi.fn();
    render(<Greeter onOpenWorkbench={onOpenWorkbench} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open the workbench anyway' }));
    expect(onOpenWorkbench).toHaveBeenCalledTimes(1);
  });

  it('copies the address, then resets the label', async () => {
    vi.useFakeTimers();
    try {
      const writeText = vi.fn().mockResolvedValue(undefined);
      stubNavigator('clipboard', { writeText });
      render(<Greeter onOpenWorkbench={() => {}} />);

      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy' })); });
      expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/`);
      expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy();

      act(() => { vi.advanceTimersByTime(COPIED_RESET_MS); });
      expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('explains how to copy by hand when the clipboard is unavailable', async () => {
    render(<Greeter onOpenWorkbench={() => {}} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy' })); });
    expect(screen.getByText('Couldn’t copy. Press and hold the address to copy it.')).toBeTruthy();
  });

  it('uses the share sheet when the browser has one', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    stubNavigator('share', share);
    render(<Greeter onOpenWorkbench={() => {}} />);
    expect(screen.getByRole('button', { name: 'Share…' })).toBeTruthy();

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Send to my computer' })); });
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: `${window.location.origin}/` }));
  });

  it('falls back to the address card when the browser refuses to share', async () => {
    stubNavigator('share', vi.fn().mockRejectedValue(new DOMException('blocked', 'NotAllowedError')));
    render(<Greeter onOpenWorkbench={() => {}} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Send to my computer' })); });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Copy' }));
  });

  it('stays put when the user dismisses the share sheet', async () => {
    stubNavigator('share', vi.fn().mockRejectedValue(new DOMException('dismissed', 'AbortError')));
    render(<Greeter onOpenWorkbench={() => {}} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Send to my computer' })); });
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it('falls back to the address card without a share sheet', () => {
    render(<Greeter onOpenWorkbench={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Share…' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Send to my computer' }));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Copy' }));
  });

  it('offers the link by email', () => {
    render(<Greeter onOpenWorkbench={() => {}} />);
    const href = screen.getByRole('link', { name: 'Email it to me' }).getAttribute('href')!;
    expect(href.startsWith('mailto:?subject=Dunceious&body=')).toBe(true);
    expect(decodeURIComponent(href)).toContain(`${window.location.origin}/`);
  });
});

describe('Greeter tour', () => {
  it('walks four steps and returns focus to the tour button on close', () => {
    render(<Greeter onOpenWorkbench={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Take the 60-second tour' }));

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Drop a file. That’s the setup.');
    expect(screen.getByRole('button', { name: 'Back' })).toHaveProperty('disabled', true);
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('4 / 4')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Compare sequences.');
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('3 / 4')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Close tour' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Take the 60-second tour' }));
  });

  it('shares from the last step and lands on the address card', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    stubNavigator('share', share);
    render(<Greeter onOpenWorkbench={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Take the 60-second tour' }));
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Send it to my computer' })); });
    expect(share).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Copy' }));
  });

  it('ends on the address card when there is no share sheet', () => {
    render(<Greeter onOpenWorkbench={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Take the 60-second tour' }));
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send it to my computer' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Copy' }));
  });
});

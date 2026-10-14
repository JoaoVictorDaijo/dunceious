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

describe('Greeter home', () => {
  it('names the tapped gene', () => {
    render(<Greeter onOpenWorkbench={() => {}} />);
    const spike = screen.getByRole('button', { name: 'S, surface glycoprotein' });
    expect(spike.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'N, nucleocapsid phosphoprotein' }));
    expect(screen.getByText('N, nucleocapsid phosphoprotein, bases 28,274 to 29,533.')).toBeTruthy();
    expect(spike.getAttribute('aria-pressed')).toBe('false');

    fireEvent.keyDown(screen.getByRole('button', { name: 'E, envelope protein' }), { key: 'Enter' });
    expect(screen.getByText('E, envelope protein, bases 26,245 to 26,472.')).toBeTruthy();
  });

  it('steps through the genes, wrapping at both ends', () => {
    render(<Greeter onOpenWorkbench={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Previous gene' }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous gene' }));
    expect(screen.getByText('ORF10, ORF10 protein, bases 29,558 to 29,674.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next gene' }));
    expect(screen.getByText('ORF1ab, ORF1ab polyprotein, bases 266 to 21,555.')).toBeTruthy();
  });

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

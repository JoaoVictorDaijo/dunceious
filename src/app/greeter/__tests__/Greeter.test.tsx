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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@/src/app/testing/renderHarness';
import Greeter from '../Greeter';

vi.mock('../../showroom/Showroom', async () => {
  const { useState } = await import('react');
  return { default: ({ onExit }: { onExit: () => void }) => {
    const [changed, setChanged] = useState(false);
    return <><p>{changed ? 'Changed sample' : 'Fresh sample'}</p><button onClick={() => setChanged(true)}>Change sample state</button><button onClick={onExit}>Exit</button></>;
  } };
});

beforeEach(() => {
  window.scrollTo = vi.fn();
});

describe('Greeter hero', () => {
  it('opens the genome on the gene 10 frameshift', () => {
    render(<Greeter />);
    const lens = screen.getByRole('slider', { name: 'Position in the phage T7 genome' });
    expect(lens.getAttribute('aria-valuenow')).toBe('23989');
    expect(lens.getAttribute('aria-valuetext')).toBe('Base 23,989, Gene 10B, major head protein, Codon 341, valine (V)');
  });

  it('moves the lens from the keyboard', () => {
    render(<Greeter />);
    const lens = screen.getByRole('slider');
    fireEvent.keyDown(lens, { key: 'ArrowRight' });
    expect(lens.getAttribute('aria-valuenow')).toBe('23990');
    fireEvent.keyDown(lens, { key: 'Home' });
    expect(lens.getAttribute('aria-valuetext')).toBe('Base 1, Left end of the genome');
    fireEvent.keyDown(lens, { key: 'End' });
    expect(lens.getAttribute('aria-valuenow')).toBe('39937');
  });

  it('jumps between genes, wrapping at both ends', () => {
    render(<Greeter />);
    const lens = screen.getByRole('slider');
    fireEvent.click(screen.getByRole('button', { name: 'Next gene' }));
    expect(lens.getAttribute('aria-valuetext')).toMatch(/^Base 24,229, Gene 11, tail protein, Codon 1, methionine \(M\)$/);
    fireEvent.keyDown(lens, { key: 'Home' });
    fireEvent.click(screen.getByRole('button', { name: 'Next gene' }));
    expect(lens.getAttribute('aria-valuetext')).toMatch(/^Base 926, Gene 0\.3,/);
    fireEvent.click(screen.getByRole('button', { name: 'Previous gene' }));
    expect(lens.getAttribute('aria-valuetext')).toMatch(/^Base 39,390, Gene 19\.5,/);
  });

  it('moves the lens to where the genome strip is tapped', () => {
    render(<Greeter />);
    const lens = screen.getByRole('slider') as unknown as SVGSVGElement;
    lens.getBoundingClientRect = () => ({ left: 0, top: 0, width: 342, height: 142 } as DOMRect);
    Object.defineProperty(lens, 'viewBox', { value: { baseVal: { width: 342, height: 142 } } });
    fireEvent.pointerDown(lens, { clientX: 171, clientY: 20, pointerId: 1 });
    expect(lens.getAttribute('aria-valuenow')).toBe(String(Math.round(39_937 / 2)));
    fireEvent.pointerDown(lens, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(lens, { clientX: 100 - 342, clientY: 100, pointerId: 1 });
    expect(lens.getAttribute('aria-valuenow')).toBe(String(Math.round(39_937 / 2) + 21));
  });
});

describe('Greeter home', () => {
  it('says where to find it on a computer', () => {
    render(<Greeter />);
    expect(screen.getByRole('heading', { level: 2, name: 'Best on a computer' })).toBeTruthy();
    expect(screen.getByText('dunceious.pages.dev')).toBeTruthy();
  });

  it('offers a test drive and says where files go', () => {
    render(<Greeter />);
    expect(screen.getByRole('button', { name: 'Test-drive the workbench' })).toBeTruthy();
    expect(screen.queryByText(/anyway/)).toBeNull();
    expect(screen.getByRole('heading', { name: 'Where your files go' })).toBeTruthy();
    expect(screen.queryByText('0 bytes')).toBeNull();
  });

  it('exit returns focus and resets', async () => {
    render(<Greeter />);
    fireEvent.click(screen.getByRole('button', { name: 'Test-drive the workbench' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Change sample state' }));
    fireEvent.click(screen.getByRole('button', { name: 'Exit' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Test-drive the workbench' }));
    fireEvent.click(screen.getByRole('button', { name: 'Test-drive the workbench' }));
    expect(await screen.findByText('Fresh sample')).toBeTruthy();
  });

  it('hides the drag hint once the genome is used', () => {
    render(<Greeter />);
    const hint = screen.getByText('Drag the genome to explore');
    expect(hint.className).toContain('opacity-100');
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowLeft' });
    expect(hint.className).toContain('opacity-0');
  });
});

describe('Greeter tour', () => {
  it('walks four steps and returns focus to the tour button on close', () => {
    render(<Greeter />);
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

  it('ends with Done, back on the home page', () => {
    render(<Greeter />);
    fireEvent.click(screen.getByRole('button', { name: 'Take the 60-second tour' }));
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Take the 60-second tour' }));
  });
});

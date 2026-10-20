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
import { act, fireEvent, render, screen, within, installCanvasRecorder, type CanvasRecorder } from '@/src/app/testing/renderHarness';
import { CLOSE_GUARD_MS, UNLOCK_TAPS } from '@/src/app/logic/easterEgg';
import CentralDogmaEgg from '../CentralDogmaEgg';
import StatusBar from '../StatusBar';

let recorder: CanvasRecorder;
beforeEach(() => { recorder = installCanvasRecorder(); });

describe('CentralDogmaEgg', () => {

  it('draws the transcribed mRNA on the replay canvas', () => {
    render(<CentralDogmaEgg replay onClose={() => {}} />);
    act(() => { vi.advanceTimersByTime(32); });
    expect(recorder.texts()).toContain("5′ mRNA");
  });
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('ignores backdrop clicks right after opening so surplus unlock taps do not close it', () => {
    const onClose = vi.fn();
    render(<CentralDogmaEgg onClose={onClose} />);
    fireEvent.click(screen.getByRole('dialog'));
    act(() => { vi.advanceTimersByTime(CLOSE_GUARD_MS - 1); });
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(1); });
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('still closes at once from the close button', () => {
    const onClose = vi.fn();
    render(<CentralDogmaEgg onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('opens a replay on the finished protein', () => {
    render(<CentralDogmaEgg replay onClose={() => {}} />);
    expect(screen.getByText('DUNCEIOUS expressed')).toBeTruthy();
    expect(screen.getByLabelText('Translated protein').textContent).toMatch(/^D.*U.*N.*C.*E.*I.*O.*U.*S/);
  });

  it('plays the whole story even when the system asks for reduced motion', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), media: query }));
    try {
      render(<CentralDogmaEgg onClose={() => {}} />);
      expect(screen.queryByText('DUNCEIOUS expressed')).toBeNull();
      expect(screen.getByText('DNA')).toBeTruthy();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('plays a replay again on request', () => {
    render(<CentralDogmaEgg replay onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Play animation/ }));
    expect(screen.queryByText('DUNCEIOUS expressed')).toBeNull();
  });

  it('signs the finale with the science credit', () => {
    render(<CentralDogmaEgg replay onClose={() => {}} />);
    const finale = screen.getByText('Made with passion and built for science');
    expect(finale.textContent?.replace(/\s+/g, ' ').trim()).toBe('Made with passion and built for science');
  });

  it('credits both authors on the finished frame without closing when a card is clicked', () => {
    const onClose = vi.fn();
    render(<CentralDogmaEgg replay onClose={onClose} />);
    expect(screen.getByText(/built for science/)).toBeTruthy();
    const dijo = screen.getByRole('link', { name: /JoaoVictorDaijo/ });
    const murilo = screen.getByRole('link', { name: /MuriloACassiano/ });
    expect(dijo.getAttribute('href')).toBe('https://github.com/JoaoVictorDaijo');
    expect(murilo.getAttribute('href')).toBe('https://github.com/MuriloACassiano');

    act(() => { vi.advanceTimersByTime(CLOSE_GUARD_MS); });
    fireEvent.click(dijo);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows no credits while the animation is still playing', () => {
    render(<CentralDogmaEgg onClose={() => {}} />);
    expect(screen.queryByText(/built for science/)).toBeNull();
  });

  it('falls back to a glyph when an avatar fails to load', () => {
    const { container } = render(<CentralDogmaEgg replay onClose={() => {}} />);
    const author = screen.getByRole('link', { name: /JoaoVictorDaijo/ });
    const img = author.querySelector('[data-author-avatar]');
    expect(img).toBeTruthy();
    fireEvent.error(img!);
    expect(author.querySelector('[data-author-avatar]')).toBeNull();
    expect(author.querySelector('[data-author-avatar-fallback]')).toBeTruthy();
    expect(within(screen.getByRole('link', { name: /MuriloACassiano/ })).getByText('MuriloACassiano')).toBeTruthy();
    expect(container.querySelectorAll('[data-author-avatar]')).toHaveLength(1);
  });
});

describe('StatusBar version taps', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('reopens the finished egg on a tap after it has been unlocked', () => {
    render(<StatusBar sessionMoleculeType={null} />);
    const version = screen.getByText(/^Dunceious v/);
    for (let i = 0; i < UNLOCK_TAPS; i++) fireEvent.click(version);
    expect(screen.queryByText('DUNCEIOUS expressed')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(version);
    expect(screen.getByText('DUNCEIOUS expressed')).toBeTruthy();
  });
});

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
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@/src/app/testing/renderHarness';
import ShellRoot from '../ShellRoot';
import { SHELL_OVERRIDE_KEY, type ShellEnv } from '../pickShell';

vi.mock('../../App', () => ({ default: () => <div>workbench</div> }));

function env(overrides: Partial<ShellEnv> = {}): ShellEnv {
  const data = new Map<string, string>();
  return {
    coarsePointer: true,
    screenWidth: 390,
    screenHeight: 844,
    search: '',
    storage: { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); } },
    ...overrides,
  };
}

describe('ShellRoot', () => {
  it('loads the workbench on a desktop', async () => {
    render(<ShellRoot env={env({ coarsePointer: false, screenWidth: 1440, screenHeight: 900 })} />);
    expect(screen.getByRole('status')).toHaveProperty('textContent', 'Loading Dunceious…');
    expect(await screen.findByText('workbench')).toBeTruthy();
  });

  it('loads the greeter on a phone, and the workbench once asked for', async () => {
    window.scrollTo = vi.fn();
    const shellEnv = env();
    render(<ShellRoot env={shellEnv} />);
    expect(await screen.findByRole('heading', { level: 1, name: 'A genome workbench that lives in your browser.' })).toBeTruthy();
    expect(screen.queryByText('workbench')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Open the workbench anyway' }));
    expect(await screen.findByText('workbench')).toBeTruthy();
    expect(shellEnv.storage!.getItem(SHELL_OVERRIDE_KEY)).toBe('desktop');
  });
});

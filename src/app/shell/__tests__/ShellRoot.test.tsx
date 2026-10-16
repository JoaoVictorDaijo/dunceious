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
import { render, screen } from '@/src/app/testing/renderHarness';
import ShellRoot from '../ShellRoot';
import { type ShellEnv } from '../pickShell';

vi.mock('../../App', () => ({ default: () => <div>workbench</div> }));

function env(overrides: Partial<ShellEnv> = {}): ShellEnv {
  return {
    coarsePointer: true,
    screenWidth: 390,
    screenHeight: 844,
    search: '',
    ...overrides,
  };
}

describe('ShellRoot', () => {
  it('loads the workbench on a desktop', async () => {
    render(<ShellRoot env={env({ coarsePointer: false, screenWidth: 1440, screenHeight: 900 })} />);
    expect(screen.getByRole('status')).toHaveProperty('textContent', 'Loading Dunceious…');
    expect(await screen.findByText('workbench')).toBeTruthy();
  });

  it('loads the greeter on a phone without a workbench escape', async () => {
    window.scrollTo = vi.fn();
    render(<ShellRoot env={env()} />);
    expect(await screen.findByRole('heading', { level: 1, name: 'A genome workbench that lives in your browser.' })).toBeTruthy();
    expect(screen.queryByText('workbench')).toBeNull();
    expect(screen.getByRole('button', { name: 'Test-drive the workbench' })).toBeTruthy();
  });
});

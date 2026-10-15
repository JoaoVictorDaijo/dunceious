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

import { describe, expect, it } from 'vitest';
import { SHELL_OVERRIDE_KEY, pickShell, rememberShell, type ShellEnv } from '../pickShell';

function memoryStorage(initial: Record<string, string> = {}): ShellEnv['storage'] {
  const data = new Map(Object.entries(initial));
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); } };
}

const phone: ShellEnv = { coarsePointer: true, screenWidth: 390, screenHeight: 844, search: '', storage: memoryStorage() };

describe('pickShell', () => {
  it('sends a phone to the greeter in either orientation', () => {
    expect(pickShell(phone)).toBe('greeter');
    expect(pickShell({ ...phone, screenWidth: 844, screenHeight: 390 })).toBe('greeter');
  });

  it('keeps a tablet on the workbench', () => {
    expect(pickShell({ ...phone, screenWidth: 768, screenHeight: 1024 })).toBe('desktop');
  });

  it('keeps a small window with a mouse on the workbench', () => {
    expect(pickShell({ ...phone, coarsePointer: false })).toBe('desktop');
  });

  it('honours a remembered choice over detection', () => {
    const storage = memoryStorage();
    rememberShell('desktop', storage);
    expect(storage!.getItem(SHELL_OVERRIDE_KEY)).toBe('desktop');
    expect(pickShell({ ...phone, storage })).toBe('desktop');
  });

  it('lets ?shell= force a shell without remembering it', () => {
    const storage = memoryStorage({ [SHELL_OVERRIDE_KEY]: 'desktop' });
    expect(pickShell({ ...phone, storage, search: '?shell=greeter' })).toBe('greeter');
    expect(pickShell({ ...phone, coarsePointer: false, search: '?shell=greeter' })).toBe('greeter');
    expect(storage!.getItem(SHELL_OVERRIDE_KEY)).toBe('desktop');
  });

  it('ignores unknown values', () => {
    const storage = memoryStorage({ [SHELL_OVERRIDE_KEY]: 'tablet' });
    expect(pickShell({ ...phone, storage, search: '?shell=mobile' })).toBe('greeter');
  });

  it('falls back to detection when storage is missing or throws', () => {
    const throwing = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(pickShell({ ...phone, storage: null })).toBe('greeter');
    expect(pickShell({ ...phone, storage: throwing })).toBe('greeter');
    expect(() => rememberShell('desktop', throwing)).not.toThrow();
  });
});

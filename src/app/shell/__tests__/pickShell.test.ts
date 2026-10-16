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
import { pickShell, type ShellEnv } from '../pickShell';

const phone: ShellEnv = { coarsePointer: true, screenWidth: 390, screenHeight: 844, search: '' };

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
  it('lets ?shell= force either shell', () => {
    expect(pickShell({ ...phone, search: '?shell=desktop' })).toBe('desktop');
    expect(pickShell({ ...phone, coarsePointer: false, search: '?shell=greeter' })).toBe('greeter');
  });
  it('ignores unknown values', () => {
    expect(pickShell({ ...phone, search: '?shell=mobile' })).toBe('greeter');
  });
  it('does not read a storage override', () => {
    const withLegacyStorage = { ...phone, storage: { getItem: () => 'desktop' } };
    expect(pickShell(withLegacyStorage)).toBe('greeter');
  });
});

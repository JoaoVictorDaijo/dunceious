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

import { afterEach, describe, expect, it, vi } from 'vitest';
import { readAlignEmail, writeAlignEmail, readVerifiedAlignEmail } from '../alignEmailPref';

afterEach(() => vi.unstubAllGlobals());
describe('alignment email preference', () => {
  it('is safe without a browser', () => {
    expect(readAlignEmail()).toBe('');
    expect(() => writeAlignEmail('a@b.org')).not.toThrow();
  });
  it('persists only the email under the dedicated key', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('window', { localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } });
    expect(readAlignEmail()).toBe('');
    writeAlignEmail('a@b.org', true);
    expect(readVerifiedAlignEmail()).toBe('a@b.org');
    expect(readAlignEmail()).toBe('a@b.org');
    expect([...values]).toEqual([['dunceious.alignEmail', JSON.stringify({ email: 'a@b.org', verified: true })]]);
  });
  it('tolerates inaccessible browser storage', () => {
    vi.stubGlobal('window', { get localStorage() { throw new Error('blocked'); } });
    expect(readAlignEmail()).toBe('');
    expect(() => writeAlignEmail('a@b.org')).not.toThrow();
  });
});

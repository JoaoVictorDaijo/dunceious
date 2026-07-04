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

import { describe, it, expect, afterEach, vi } from 'vitest';
import { readSkipClearAllConfirmation, writeSkipClearAllConfirmation } from '../clearConfirmationPref';

const KEY = 'dunceious.skipClearAllConfirmation';

function makeStorage(seed?: Record<string, string>) {
  const store = new Map<string, string>(Object.entries(seed ?? {}));
  return {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    store,
  };
}

function stubWindow(storage: ReturnType<typeof makeStorage>) {
  vi.stubGlobal('window', { localStorage: storage });
}

describe('clearConfirmationPref', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads false when the key is unset', () => {
    stubWindow(makeStorage());
    expect(readSkipClearAllConfirmation()).toBe(false);
  });

  it('write(true) persists the sentinel and reads back true', () => {
    const storage = makeStorage();
    stubWindow(storage);
    writeSkipClearAllConfirmation(true);
    expect(storage.getItem(KEY)).toBe('1');
    expect(readSkipClearAllConfirmation()).toBe(true);
  });

  it('write(false) removes the key and reads back false', () => {
    const storage = makeStorage({ [KEY]: '1' });
    stubWindow(storage);
    writeSkipClearAllConfirmation(false);
    expect(storage.getItem(KEY)).toBeNull();
    expect(readSkipClearAllConfirmation()).toBe(false);
  });

  it('treats any non-sentinel value as false, guarding against sentinel drift', () => {
    stubWindow(makeStorage({ [KEY]: 'true' }));
    expect(readSkipClearAllConfirmation()).toBe(false);
  });

  it('is a no-op without a window (SSR/non-DOM)', () => {
    // No window stubbed: helpers must not throw and must report the safe default.
    expect(() => writeSkipClearAllConfirmation(true)).not.toThrow();
    expect(readSkipClearAllConfirmation()).toBe(false);
  });
});

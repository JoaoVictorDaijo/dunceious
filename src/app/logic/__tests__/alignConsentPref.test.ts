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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const acceptedAt = '2026-10-09T12:00:00.000Z';
const key = 'dunceious.alignConsent';
let pref: typeof import('../alignConsentPref');
let values: Map<string, string>;

beforeEach(async () => {
  vi.resetModules();
  pref = await import('../alignConsentPref');
  values = new Map();
  vi.stubGlobal('window', { localStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } });
});
afterEach(() => vi.unstubAllGlobals());

describe('alignment consent preference', () => {
  it('returns null when nothing is stored', () => {
    expect(pref.readAlignConsent()).toBeNull();
  });
  it('reads only the current disclosure version', () => {
    values.set(key, JSON.stringify({ version: 1, acceptedAt }));
    expect(pref.readAlignConsent()).toEqual({ acceptedAt });
    values.set(key, JSON.stringify({ version: 0, acceptedAt }));
    expect(pref.readAlignConsent()).toBeNull();
  });
  it.each(['broken JSON', 'null', '{}', '{"version":1,"acceptedAt":false}', '{"version":1,"acceptedAt":"invalid"}'])('rejects malformed consent: %s', raw => {
    values.set(key, raw);
    expect(pref.readAlignConsent()).toBeNull();
  });
  it('writes and clears a versioned agreement', () => {
    pref.writeAlignConsent(new Date(acceptedAt));
    expect(JSON.parse(values.get(key)!)).toEqual({ version: 1, acceptedAt });
    expect(pref.readAlignConsent()).toEqual({ acceptedAt });
    pref.clearAlignConsent();
    expect(values.has(key)).toBe(false);
    expect(pref.readAlignConsent()).toBeNull();
  });
  it('holds consent in memory when storage access is blocked', () => {
    vi.stubGlobal('window', { get localStorage() { throw new Error('blocked'); } });
    expect(pref.readAlignConsent()).toBeNull();
    expect(() => pref.writeAlignConsent(new Date(acceptedAt))).not.toThrow();
    expect(pref.readAlignConsent()).toEqual({ acceptedAt });
    expect(() => pref.clearAlignConsent()).not.toThrow();
    expect(pref.readAlignConsent()).toBeNull();
  });
  it('uses session consent when only writes fail', () => {
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => { throw new Error('full'); });
    pref.writeAlignConsent(new Date(acceptedAt));
    expect(values.has(key)).toBe(false);
    expect(pref.readAlignConsent()).toEqual({ acceptedAt });
  });
  it('does not resurrect consent when removal fails but reads succeed', () => {
    pref.writeAlignConsent(new Date(acceptedAt));
    vi.spyOn(window.localStorage, 'removeItem').mockImplementation(() => { throw new Error('blocked'); });
    pref.clearAlignConsent();
    expect(values.has(key)).toBe(true);
    expect(pref.readAlignConsent()).toBeNull();
  });
  it('does not carry blocked-storage consent into a new session', async () => {
    vi.stubGlobal('window', { get localStorage() { throw new Error('blocked'); } });
    pref.writeAlignConsent(new Date(acceptedAt));
    vi.resetModules();
    const nextSession = await import('../alignConsentPref');
    expect(nextSession.readAlignConsent()).toBeNull();
  });
});

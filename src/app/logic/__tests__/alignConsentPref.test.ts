/*
 * Dunceious
 * Copyright (C) 2026 João Victor Daijo and Murilo Cassiano
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

describe('alignment consent (this page load only)', () => {
  it('starts without consent', () => {
    expect(pref.readAlignConsent()).toBeNull();
  });
  it('remembers an agreement for the rest of the page load and clears it on revoke', () => {
    pref.writeAlignConsent(new Date(acceptedAt));
    expect(pref.readAlignConsent()).toEqual({ acceptedAt });
    pref.clearAlignConsent();
    expect(pref.readAlignConsent()).toBeNull();
  });
  it('never persists the agreement, so a refresh or reopened page asks again', async () => {
    pref.writeAlignConsent(new Date(acceptedAt));
    expect(values.size).toBe(0);
    vi.resetModules();
    const nextPageLoad = await import('../alignConsentPref');
    expect(nextPageLoad.readAlignConsent()).toBeNull();
  });
  it('ignores and deletes an agreement persisted by an earlier version', async () => {
    values.set(key, JSON.stringify({ version: 1, acceptedAt }));
    vi.resetModules();
    const nextPageLoad = await import('../alignConsentPref');
    expect(nextPageLoad.readAlignConsent()).toBeNull();
    expect(values.has(key)).toBe(false);
  });
  it('loads when storage access is blocked', async () => {
    vi.stubGlobal('window', { get localStorage() { throw new Error('blocked'); } });
    vi.resetModules();
    const blocked = await import('../alignConsentPref');
    expect(blocked.readAlignConsent()).toBeNull();
    blocked.writeAlignConsent(new Date(acceptedAt));
    expect(blocked.readAlignConsent()).toEqual({ acceptedAt });
  });
});

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

// Single source of truth for the "skip Clear-All confirmation" preference so the
// key and its sentinel can't drift between the reader and the two writers.
const KEY = 'dunceious.skipClearAllConfirmation';
const ENABLED = '1';

/**
 * Whether the user has opted out of the Clear-All confirmation prompt (persisted per browser).
 * `localStorage` access is wrapped because it throws (not returns null) when storage is
 * blocked, and this runs during App's first render — an unguarded throw would fail the mount.
 */
export const readSkipClearAllConfirmation = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(KEY) === ENABLED;
  } catch {
    return false;
  }
};

/** Persist the skip-confirmation preference; removing the key restores the prompt. Best-effort. */
export const writeSkipClearAllConfirmation = (value: boolean): void => {
  if (typeof window === 'undefined') return;
  try {
    if (value) window.localStorage.setItem(KEY, ENABLED);
    else window.localStorage.removeItem(KEY);
  } catch {
    /* storage blocked or full — preference is not persisted this session */
  }
};

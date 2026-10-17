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

import { useState, useCallback } from 'react';

export function useSessionOpenState(key: string): [boolean, (open: boolean) => void] {
  const storageKey = `search-section:${key}`;
  const [open, setOpen] = useState(() => {
    try { return sessionStorage.getItem(storageKey) === '1'; } catch { return false; }
  });
  const update = useCallback((next: boolean) => {
    setOpen(next);
    try { sessionStorage.setItem(storageKey, next ? '1' : '0'); } catch { /* Storage can be denied by the browser. */ }
  }, [storageKey]);
  return [open, update];
}

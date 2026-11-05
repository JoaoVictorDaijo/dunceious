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

const STORAGE_KEY = 'dunceious.alignEmail';
function readPreference(): { email: string; verified: boolean } {
  if (typeof window === 'undefined') return { email: '', verified: false };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY) ?? '';
    if (!raw.startsWith('{')) return { email: raw, verified: false };
    const stored = JSON.parse(raw) as { email?: unknown; verified?: unknown };
    return { email: typeof stored.email === 'string' ? stored.email : '', verified: stored.verified === true };
  } catch { return { email: '', verified: false }; }
}
export function readAlignEmail(): string { return readPreference().email; }
export function readVerifiedAlignEmail(): string {
  const preference = readPreference();
  return preference.verified ? preference.email : '';
}
export function writeAlignEmail(email: string, verified = false): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ email, verified })); }
  catch { /* Blocked storage must not prevent a job in this session. */ }
}

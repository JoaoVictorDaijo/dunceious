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

type WindowSpan = { id: string; length: number; start: number; end: number };
export type TrackWindow = ReturnType<typeof createTrackWindow>;
export function createTrackWindow() {
  const roots = new Map<string, Set<HTMLElement>>();
  let current: WindowSpan | null = null;
  const paint = (id: string, root: HTMLElement) => {
    const value = current;
    const visible = value?.id === id;
    const band = root.querySelector<HTMLElement>('[data-track-window]');
    const label = root.querySelector<HTMLElement>('[data-track-window-label]');
    if (band) {
      band.hidden = !visible;
      if (visible && value) { band.style.left = `${value.start / value.length * 100}%`; band.style.width = `${Math.max(0, value.end - value.start) / value.length * 100}%`; }
    }
    if (label) { label.hidden = !visible; if (visible && value) label.textContent = `${(value.start + 1).toLocaleString('en-US')}–${value.end.toLocaleString('en-US')} in view`; }
  };
  return {
    register(id: string, element: HTMLElement) { const set = roots.get(id) ?? new Set(); set.add(element); roots.set(id, set); paint(id, element); return () => { set.delete(element); if (!set.size) roots.delete(id); }; },
    update(value: typeof current) { current = value; roots.forEach((set, id) => set.forEach(root => paint(id, root))); },
  };
}

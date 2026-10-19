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

import { useEffect, useRef, type ReactNode } from 'react';
export default function HubMenu({ label, onClose, children, chrome = false }: { chrome?: boolean; label: string; onClose: () => void; children: ReactNode }) {
  const menu = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus();
    const outside = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node) && event.target !== trigger) close.current(); };
    document.addEventListener('pointerdown', outside);
    return () => { document.removeEventListener('pointerdown', outside); if (document.activeElement === document.body || menu.current?.contains(document.activeElement)) trigger?.focus(); };
  }, []);
  return <div ref={menu} role="menu" aria-label={label} className={`absolute top-full z-40 mt-1 min-w-52 rounded-lg border p-2 text-xs shadow-xl ${chrome ? 'left-0 w-72 border-slate-700 bg-slate-900 text-slate-300' : 'right-0 border-slate-200 bg-white text-slate-700'}`} onKeyDown={event => {
    if (event.key === 'Escape') { event.stopPropagation(); close.current(); }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const choices = Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? []);
      const index = choices.indexOf(document.activeElement as HTMLElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? choices.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length;
      choices[next]?.focus();
    }
  }}>{children}</div>;
}

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

import { useUiEffects } from '@/src/app/components/uiEffects';
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { modifierLabel } from '@/src/app/logic/shortcuts';
const groups = [
  ['Find', [['Search annotations', '/'], ['Next match', 'Enter'], ['Previous match', 'Shift Enter'], ['Clear selection or close menus', 'Esc']]],
  ['Move', [['Next row', 'J'], ['Previous row', 'K'], ['Next sequence', ']'], ['Previous sequence', '[']]],
  ['Act', [['Select row', 'X'], ['Collapse or expand sequence', 'O']]],
  ['Project', [['Save project', `${modifierLabel()} S`], ['Open project', `${modifierLabel()} O`]]],
  ['Help', [['Keyboard shortcuts', '?']]],
] as const;
export default function ShortcutsSheet({ onClose }: { onClose: () => void }) {
  const { portalTarget } = useUiEffects();
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const close = dialog.current?.querySelector<HTMLButtonElement>('button');
    close?.focus();
    const keepFocus = (event: FocusEvent) => { if (!dialog.current?.contains(event.target as Node)) close?.focus(); };
    document.addEventListener('focusin', keepFocus);
    return () => { document.removeEventListener('focusin', keepFocus); opener?.focus(); };
  }, []);
  return createPortal(<div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/60 p-4">
    <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="hub-shortcuts-title" className="max-h-[calc(100dvh-32px)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 text-slate-200 shadow-2xl" onKeyDown={event => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key === 'Tab') { event.preventDefault(); dialog.current?.querySelector<HTMLButtonElement>('button')?.focus(); }
    }}>
      <header className="flex items-center justify-between border-b border-slate-800 px-5 py-4"><h2 id="hub-shortcuts-title" className="font-semibold"><i aria-hidden="true" className="fas fa-keyboard mr-2 text-env" />Keyboard shortcuts</h2><button aria-label="Close keyboard shortcuts" data-tip="Close keyboard shortcuts" data-tip-kbd="Esc" onClick={onClose} className="h-8 w-8 rounded-lg hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500"><i className="fas fa-xmark" aria-hidden="true" /></button></header>
      <div className="grid gap-6 px-5 py-5 sm:grid-cols-2">{groups.map(([label, items]) => <section key={label}><h3 className="mb-3 text-xs font-semibold text-slate-400">{label}</h3><ul className="stack-y-2">{items.map(([action, key]) => <li key={action} className="flex items-center justify-between gap-3 text-xs"><span>{action}</span><kbd className="whitespace-nowrap rounded-sm border border-slate-700 bg-slate-950 px-1.5 py-1 font-mono text-[10px]">{key}</kbd></li>)}</ul></section>)}</div>
    </div>
  </div>, portalTarget ?? (document.querySelector('.app-root') ?? document.body));
}

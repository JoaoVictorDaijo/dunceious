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

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import HubMenu from './hub/HubMenu';
import { modifierLabel } from '@/src/app/logic/shortcuts';

type ProjectMenuProps = {
  /** Returns the saved file name, or null when saving was cancelled. */
  onSaveProject: () => string | null;
  onOpenProject: (event: ChangeEvent<HTMLInputElement>) => void;
  onClearWorkspace: () => void;
  sequenceCount: number;
  locked?: boolean;
};

const plural = (count: number, word: string) => `${count.toLocaleString('en-US')} ${word}${count === 1 ? '' : 's'}`;
const SAVED_NOTICE_MS = 3000;

/** App-level project actions; lives in the top bar so it is in the same place in both modes. */
export default function ProjectMenu({ onSaveProject, onOpenProject, onClearWorkspace, sequenceCount, locked = false }: ProjectMenuProps) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const empty = sequenceCount === 0;
  const modifier = modifierLabel();
  const save = () => { const fileName = onSaveProject(); if (fileName) setSaved(fileName); };
  const openPicker = () => { if (!locked) picker.current?.click(); };
  // The document listener outlives renders, so it reads the latest handlers through a ref.
  const shortcuts = useRef({ save, openPicker });
  shortcuts.current = { save, openPicker };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.repeat) return;
      const key = event.key.toLowerCase();
      if (key !== 's' && key !== 'o') return;
      event.preventDefault();
      setOpen(false);
      if (key === 's') shortcuts.current.save(); else shortcuts.current.openPicker();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    if (!saved) return;
    const timer = window.setTimeout(() => setSaved(null), SAVED_NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [saved]);
  const items = [
    { label: 'Save project', description: 'Everything, to reopen later', icon: 'fa-floppy-disk', disabled: false, run: save, keys: `${modifier} S` },
    { label: 'Open project…', description: 'Replaces the current workspace', icon: 'fa-folder-open', disabled: locked, run: openPicker, keys: `${modifier} O` },
    { label: 'Clear workspace…', description: empty ? 'Nothing to clear' : `Asks first, then removes ${plural(sequenceCount, 'sequence')}`, icon: 'fa-trash-can', disabled: empty || locked, run: onClearWorkspace, danger: true },
  ];
  return <div className="relative shrink-0">
    <button aria-label="Project" data-tip={open ? undefined : 'Project: save, open or clear the workspace'} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}
      className={`flex h-10 items-center gap-2 rounded-xl border px-3 text-xs font-semibold transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-env/60 ${open ? 'border-env/40 bg-env/10 text-env' : 'border-slate-700 text-slate-200 hover:bg-slate-800 hover:text-white'}`}>
      <i aria-hidden="true" className="fas fa-folder" />Project<i aria-hidden="true" className="fas fa-chevron-down text-[9px] opacity-70" />
    </button>
    <input ref={picker} aria-label="Open project file" hidden type="file" accept=".json" disabled={locked} onChange={onOpenProject} />
    <span role="status" aria-live="polite" className="pointer-events-none absolute right-0 top-full mt-2 whitespace-nowrap">
      {saved && <span className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 shadow-xl animate-in fade-in duration-200 motion-reduce:animate-none"><i aria-hidden="true" className="fas fa-circle-check text-emerald-400" />Saved as <span className="font-mono">{saved}</span></span>}
    </span>
    {open && <span className="absolute right-0 top-full mt-1 w-80 [&>div]:w-full"><HubMenu chrome label="Project" onClose={() => setOpen(false)}>
      <p className="px-2 pb-2 pt-1 font-mono text-[11px] text-slate-400">{empty ? 'The workspace is empty' : `${plural(sequenceCount, 'sequence')} in this workspace`}</p>
      {items.map(item => <div key={item.label}>
        {item.danger && <div role="separator" className="my-1 border-t border-slate-700" />}
        <button role="menuitem" aria-label={item.label} aria-keyshortcuts={item.keys?.replace('⌘', 'Meta').replace('Ctrl', 'Control').replace(' ', '+')} disabled={item.disabled} className="flex w-full items-center gap-2.5 rounded-lg p-2 text-left hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent" onClick={() => {
          if (item.disabled) return;
          setOpen(false);
          item.run();
        }}>
          <span aria-hidden="true" className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg ${item.danger ? 'bg-rose-500/10 text-rose-400' : 'bg-slate-800 text-env'}`}><i className={`fas ${item.icon}`} /></span>
          <span className="min-w-0 flex-1"><span className={`block font-semibold ${item.danger ? 'text-rose-400' : 'text-slate-100'}`}>{item.label}</span><span className="block text-[11px] text-slate-400">{item.description}</span></span>
          {item.keys && <kbd aria-hidden="true" className="shrink-0 rounded border border-slate-700 px-1.5 font-mono text-[10px] text-slate-400">{item.keys}</kbd>}
        </button>
      </div>)}
    </HubMenu></span>}
  </div>;
}

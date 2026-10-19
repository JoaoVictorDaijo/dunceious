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

import { modifierLabel } from '@/src/app/logic/shortcuts';

const plural = (count: number, word: string) => `${count.toLocaleString('en-US')} ${word}${count === 1 ? '' : 's'}`;
export default function ProjectActionsSection({ sequenceCount, locked, onSave: save, onOpen: openPicker, onClearWorkspace, onAction }: {
  sequenceCount: number; locked: boolean; onSave: () => void; onOpen: () => void;
  onClearWorkspace: () => void; onAction: () => void;
}) {
  const empty = sequenceCount === 0;
  const modifier = modifierLabel();
  const items = [
    { label: 'Save project', description: 'Everything, to reopen later', icon: 'fa-floppy-disk', disabled: false, run: save, keys: `${modifier} S` },
    { label: 'Open project…', description: 'Replaces the current workspace', icon: 'fa-folder-open', disabled: locked, run: openPicker, keys: `${modifier} O` },
    { label: 'Clear workspace…', description: empty ? 'Nothing to clear' : `Asks first, then removes ${plural(sequenceCount, 'sequence')}`, icon: 'fa-trash-can', disabled: empty || locked, run: onClearWorkspace, danger: true },
  ];
  return <section role="group" aria-label="Project" className="p-3 border-b border-slate-800">
    <h2 className="px-2 text-[10px] font-bold uppercase tracking-widest text-env">Project</h2>
      <p className="px-2 pb-2 pt-1 font-mono text-[11px] text-slate-400">{empty ? 'The workspace is empty' : `${plural(sequenceCount, 'sequence')} in this workspace`}</p>
      {items.map(item => <div key={item.label}>
        {item.danger && <div role="separator" className="my-1 border-t border-slate-700" />}
        <button aria-label={item.label} aria-keyshortcuts={item.keys?.replace('⌘', 'Meta').replace('Ctrl', 'Control').replace(' ', '+')} disabled={item.disabled} className="flex w-full items-center gap-2.5 rounded-lg p-2 text-left hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent" onClick={() => {
          if (item.disabled) return;
          onAction();
          item.run();
        }}>
          <span aria-hidden="true" className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg ${item.danger ? 'bg-rose-500/10 text-rose-400' : 'bg-slate-800 text-env'}`}><i className={`fas ${item.icon}`} /></span>
          <span className="min-w-0 flex-1"><span className={`block font-semibold ${item.danger ? 'text-rose-400' : 'text-slate-100'}`}>{item.label}</span><span className="block text-[11px] text-slate-400">{item.description}</span></span>
          {item.keys && <kbd aria-hidden="true" className="shrink-0 rounded border border-slate-700 px-1.5 font-mono text-[10px] text-slate-400">{item.keys}</kbd>}
        </button>
      </div>)}
  </section>;
}

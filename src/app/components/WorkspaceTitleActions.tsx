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

import { useState } from 'react';
import HubMenu from './hub/HubMenu';

type WorkspaceTitleActionsProps = {
  onAddSequences?: () => void;
  addLocked?: boolean;
  onExportProjectJson?: () => void;
  onClearAll?: () => void;
  locked?: boolean;
  empty: boolean;
};

export default function WorkspaceTitleActions({ onAddSequences, addLocked = false, onExportProjectJson, onClearAll, locked = false, empty }: WorkspaceTitleActionsProps) {
  const [actionsOpen, setActionsOpen] = useState(false);
  return <span className="inline-flex shrink-0 items-center gap-1">
    {onAddSequences && <button aria-label="Add sequences…" data-tip={addLocked ? 'Unavailable while an alignment job runs' : 'Add GenBank or FASTA files (or drop them on the hub)'} disabled={addLocked} onClick={onAddSequences} className="ml-1 inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md border border-slate-800 text-slate-300 hover:border-env hover:text-white disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-env"><i aria-hidden="true" className="fas fa-plus text-[10px]" /></button>}<span className="relative inline-flex shrink-0 font-sans">
        <button aria-label="Workspace actions" data-tip="Workspace: save or clear" aria-haspopup="menu" aria-expanded={actionsOpen} onClick={() => setActionsOpen(!actionsOpen)} className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-md border border-slate-800 text-slate-300 hover:border-env hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-env"><i aria-hidden="true" className="fas fa-ellipsis text-[10px]" /></button>
        {actionsOpen && <span className="absolute right-0 top-full w-72 max-w-[100cqw] [&>div]:min-w-0 [&>div]:w-full"><HubMenu chrome label="Workspace actions" onClose={() => setActionsOpen(false)}>
          <button role="menuitem" className="block w-full rounded-md p-2 text-left hover:bg-slate-800" onClick={() => { setActionsOpen(false); onExportProjectJson?.(); }}>Save project</button>
          <div role="separator" className="my-1 border-t border-slate-700" />
          <button role="menuitem" disabled={empty || locked} className="block w-full rounded-md p-2 text-left text-rose-400 hover:bg-slate-800 disabled:opacity-40" onClick={() => { if (empty || locked) return; setActionsOpen(false); onClearAll?.(); }}>Clear workspace…</button>
        </HubMenu></span>}
      </span>
  </span>;
}

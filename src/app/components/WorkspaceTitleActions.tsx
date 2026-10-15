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

type WorkspaceTitleActionsProps = {
  onAddSequences?: () => void;
  addLocked?: boolean;
};

// Project-wide actions (save, open, clear) live in the top bar's Project menu; the list title only adds sequences.
export default function WorkspaceTitleActions({ onAddSequences, addLocked = false }: WorkspaceTitleActionsProps) {
  return <span className="inline-flex shrink-0 items-center gap-1">
    {onAddSequences && <button aria-label="Add sequences…" data-tip={addLocked ? 'Unavailable while an alignment job runs' : 'Add GenBank or FASTA files (or drop them on the hub)'} disabled={addLocked} onClick={onAddSequences} className="ml-1 inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md border border-slate-800 text-slate-300 hover:border-env hover:text-white disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-env"><i aria-hidden="true" className="fas fa-plus text-[10px]" /></button>}
  </span>;
}

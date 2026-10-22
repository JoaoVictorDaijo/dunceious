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

interface HubEmptyStateProps {
  kind: 'workspace' | 'filtered' | 'hidden';
  locked?: boolean;
  onImport: () => void;
  onClearFilters: () => void;
  onShowAll: () => void;
}

export default function HubEmptyState({ kind, locked, onImport, onClearFilters, onShowAll }: HubEmptyStateProps) {
  return <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-10 text-center text-sm text-slate-500">
    {kind === 'workspace' ? <>
      <span aria-hidden="true" className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-700"><i className="fas fa-file-import text-lg" /></span>
      <h2 className="text-[15px] font-semibold text-slate-800">No sequences yet</h2>
      <p className="mt-2 max-w-md">Drop GenBank or FASTA files anywhere on this panel, or import them.</p>
      <button disabled={locked} onClick={onImport} className="mt-4 rounded-lg bg-env px-4 py-2 font-semibold text-slate-950 disabled:cursor-default disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-env">Import sequences…</button>
      <p className="mt-3 max-w-md text-xs">Annotations, pre-aligned FASTA and projects are in the Import menu <i aria-hidden="true" className="fas fa-file-import ml-1" /></p>
    </> : <>
      <p>{kind === 'hidden' ? 'All sequences are hidden in the hub' : 'No annotations match these filters'}</p>
      <button onClick={kind === 'hidden' ? onShowAll : onClearFilters} className="mt-2 rounded-sm px-2 py-1 text-amber-700 underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-env">{kind === 'hidden' ? 'Show all' : 'Clear filters'}</button>
    </>}
  </div>;
}

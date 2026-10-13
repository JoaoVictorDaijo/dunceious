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

import { useRef, type ChangeEvent } from 'react';
import type { useHubState } from '@/src/app/hooks/useHubState';
import HubMenu from './HubMenu';
export interface MoreMenuProps {
  state: ReturnType<typeof useHubState>; locked?: boolean; empty?: boolean;
  onSave: () => void; onClear: () => void;
  onFileUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onAlignmentUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onAnnotationUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onProjectUpload: (event: ChangeEvent<HTMLInputElement>) => void;
}
export default function MoreMenu({ state, locked, empty, onSave, onClear, onFileUpload, onAlignmentUpload, onAnnotationUpload, onProjectUpload }: MoreMenuProps) {
  const sequence = useRef<HTMLInputElement>(null), alignment = useRef<HTMLInputElement>(null), annotation = useRef<HTMLInputElement>(null), project = useRef<HTMLInputElement>(null);
  return <div className="relative">
    <button aria-label="More workspace actions" aria-haspopup="menu" aria-expanded={state.menu === 'more'} onClick={() => state.setMenu(state.menu === 'more' ? null : 'more')} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">⋯</button>
    <input ref={sequence} aria-label="Import sequences files" hidden type="file" accept=".gb,.genbank,.fasta,.fa" multiple onChange={onFileUpload} />
    <input ref={alignment} aria-label="Import pre-aligned FASTA file" hidden type="file" accept=".fasta,.fa" onChange={onAlignmentUpload} />
    <input ref={annotation} aria-label="Import annotations files" hidden type="file" accept=".bed,.gff,.gff3,.bedgraph" multiple onChange={onAnnotationUpload} />
    <input ref={project} aria-label="Load project file" hidden type="file" accept=".json" onChange={onProjectUpload} />
    {state.menu === 'more' && <HubMenu label="Workspace actions" onClose={() => state.setMenu(null)}>
      <button role="menuitem" className="block w-full p-2 text-left" onClick={() => { state.setMenu(null); onSave(); }}>Save project…</button>
      {([['Sequences…', sequence, onFileUpload, false], ['Pre-aligned FASTA…', alignment, onAlignmentUpload, empty], ['Annotations…', annotation, onAnnotationUpload, empty], ['Load project…', project, onProjectUpload, false]] as const).map(([label, input, _handler, unavailable]) => <button role="menuitem" disabled={locked || unavailable} className="block w-full p-2 text-left disabled:opacity-40" key={label} onClick={() => { state.setMenu(null); input.current?.click(); }}>{label}</button>)}
      <button role="menuitem" disabled={locked || empty} className="mt-2 block w-full border-t border-slate-200 p-2 text-left text-rose-700 disabled:opacity-40" onClick={() => { if (!locked) { state.setMenu(null); onClear(); } }}>Clear workspace…</button>
    </HubMenu>}
  </div>;
}

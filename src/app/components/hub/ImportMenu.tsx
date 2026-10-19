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
import { useRef, type ChangeEvent, type RefObject } from 'react';
import type { useHubState } from '@/src/app/hooks/useHubState';
import HubMenu from './HubMenu';
export interface ImportMenuProps {
  sequenceInputRef?: RefObject<HTMLInputElement | null>;
  onImportSequences?: () => void;
  state: ReturnType<typeof useHubState>; locked?: boolean; empty?: boolean;
  onFileUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onAlignmentUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onAnnotationUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onProjectUpload: (event: ChangeEvent<HTMLInputElement>) => void;
}
export default function ImportMenu({ state, locked, empty, onFileUpload, onAlignmentUpload, onAnnotationUpload, onProjectUpload, sequenceInputRef, onImportSequences }: ImportMenuProps) {
  const { chooseFile } = useUiEffects();
  const localSequence = useRef<HTMLInputElement>(null);
  const sequence = sequenceInputRef ?? localSequence;
  const alignment = useRef<HTMLInputElement>(null), annotation = useRef<HTMLInputElement>(null), project = useRef<HTMLInputElement>(null);
  return <div className="relative shrink-0">
    <button aria-label="Import" data-tip="Import files" aria-haspopup="menu" aria-expanded={state.menu === 'more'} onClick={() => state.setMenu(state.menu === 'more' ? null : 'more')} className="flex h-10 items-center gap-2 rounded-l-xl border border-slate-800 bg-slate-950 px-3 text-xs font-semibold text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500"><i className="fas fa-file-import" aria-hidden="true" /><span className="[[data-hub-tools=icon]_&]:hidden [[data-hub-tools=narrow]_&]:hidden">Import</span></button>
    <input ref={sequence} aria-label="Import sequences files" hidden type="file" accept=".gb,.genbank,.fasta,.fa" multiple onChange={onFileUpload} />
    <input ref={alignment} aria-label="Import pre-aligned FASTA file" hidden type="file" accept=".fasta,.fa" onChange={onAlignmentUpload} />
    <input ref={annotation} aria-label="Import annotations files" hidden type="file" accept=".bed,.gff,.gff3,.bedgraph" multiple onChange={onAnnotationUpload} />
    <input ref={project} aria-label="Load project file" hidden type="file" accept=".json" onChange={onProjectUpload} />
    {state.menu === 'more' && <HubMenu label="Import" onClose={() => state.setMenu(null)}>
      {([
        ['Sequences', 'GenBank, GenPept or FASTA files', 'fa-dna', sequence, false, 'sequences'],
        ['Annotations', empty ? 'Load sequences first' : 'GFF3, BED or bedGraph onto loaded sequences', 'fa-tag', annotation, empty, 'annotations'],
        ['Alignment', empty ? 'Load sequences first' : 'A pre-aligned FASTA of the loaded sequences', 'fa-align-left', alignment, empty, 'alignment'],
        ['Dunceious project', 'Replaces the current workspace', 'fa-folder-open', project, false, 'project'],
      ] as const).map(([label, description, icon, input, unavailable, kind]) => <div key={label}>
        {input === project && <div role="separator" className="my-1 border-t border-slate-200" />}
        <button role="menuitem" aria-label={label} disabled={locked || unavailable} className="flex w-full items-center gap-2.5 rounded-lg p-2 text-left hover:bg-slate-100 disabled:opacity-40" onClick={() => {
          if (locked || unavailable) return;
          state.setMenu(null);
          chooseFile(kind, () => {
            if (input === sequence && onImportSequences) onImportSequences();
            else input.current?.click();
          });
        }}>
          <span aria-hidden="true" className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700"><i className={`fas ${icon}`} /></span>
          <span><span className="block font-bold">{label}</span><span className="block whitespace-nowrap text-[11px] text-slate-500">{description}</span></span>
        </button>
      </div>)}
      <p className="px-2 pb-1 pt-2 text-[11px] text-slate-500">Or drop files anywhere on the hub.</p>
    </HubMenu>}
  </div>;
}

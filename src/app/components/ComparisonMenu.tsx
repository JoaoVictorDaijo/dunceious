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

import React, { useEffect, useId, useRef, useState } from 'react';
import type { SeqRecord } from '@/src/domain/bio/types';
import type { AlignmentComparisonSettings, ComparisonHighlight } from '@/src/app/logic/alignmentComparison';
import { compareToReference } from '@/src/domain/bio/referenceComparison';
import { getNucleotideColor } from '@/src/app/viewer/colors';

// The spike protein's D614G window, plus a deletion and an N so the preview shows every case a row can.
const PREVIEW_REFERENCE = 'CAGGATGTTAAC';
const PREVIEW_SAMPLE = 'C-GGGTGTTNAC';

/** A two-row sample drawn with the viewer's rules, so each option shows what it will do. */
const ComparisonPreview: React.FC<{ settings: AlignmentComparisonSettings }> = ({ settings }) => {
  const differences = settings.highlight === 'disagreements';
  const cell = (char: string, column: number, compared: boolean) => {
    const relation = compareToReference(char, PREVIEW_REFERENCE[column], 'nucleotide');
    const highlighted = !compared || settings.highlight === 'none'
      || (differences ? relation === 'substitution' || relation === 'gap' : relation === 'identical');
    const dot = compared && differences && settings.matchDots && relation === 'identical';
    const style: React.CSSProperties = char === '-'
      ? (compared && differences ? { background: '#475569', color: '#fff' } : { background: '#1e293b', color: '#64748b' })
      : highlighted ? { background: getNucleotideColor(char), color: '#fff' }
      : dot ? { color: '#94a3b8' }
      : { background: '#334155', color: '#94a3b8' };
    return <span key={column} style={style} className="flex h-4 w-4 items-center justify-center rounded-[2px] font-mono text-[10px] font-bold">{dot ? '·' : char}</span>;
  };
  return (
    <div aria-hidden="true" className="rounded-lg bg-slate-900 px-2.5 py-2 space-y-1">
      {[PREVIEW_REFERENCE, PREVIEW_SAMPLE].map((row, index) => (
        <div key={row} className="flex items-center gap-2">
          <span className={`w-14 shrink-0 text-[10px] font-bold ${index === 0 ? 'text-env' : 'text-slate-400'}`}>{index === 0 ? 'Reference' : 'Sample'}</span>
          <div className="flex gap-px">{[...row].map((char, column) => cell(char, column, index === 1))}</div>
        </div>
      ))}
    </div>
  );
};

const HIGHLIGHTS: { value: ComparisonHighlight; label: string; tip: string }[] = [
  { value: 'none', label: 'Off', tip: 'Every residue in its own colour' },
  { value: 'disagreements', label: 'Differences', tip: 'Colour only the residues that differ from the reference' },
  { value: 'agreements', label: 'Identity', tip: 'Colour only the residues identical to the reference' },
];

export interface ComparisonMenuProps {
  settings: AlignmentComparisonSettings;
  onChange: (settings: AlignmentComparisonSettings) => void;
  /** The record actually compared against, after falling back from a missing choice. */
  reference: SeqRecord | null;
  candidates: SeqRecord[];
  /** Why comparison is unavailable; undefined while an alignment is loaded. */
  disabledReason?: string;
}

interface ComparisonPanelProps {
  settings: AlignmentComparisonSettings;
  update: (patch: Partial<AlignmentComparisonSettings>) => void;
  reference: SeqRecord | null;
  candidates: SeqRecord[];
  onClose: () => void;
}

const ComparisonPanel: React.FC<ComparisonPanelProps> = ({ settings, update, reference, candidates, onClose }) => {
  const referenceSelectId = useId();
  return (
    <div
      role="group"
      aria-label="Reference comparison"
      onKeyDown={event => { if (event.key === 'Escape') onClose(); }}
      className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-slate-800 bg-slate-950 p-3 shadow-xl text-xs text-slate-200 space-y-3"
    >
      <ComparisonPreview settings={settings} />
      <div>
        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Highlight</p>
        <div role="radiogroup" aria-label="Highlight" className="flex gap-1 rounded-lg bg-slate-900 p-1">
          {HIGHLIGHTS.map(option => (
            <button
              key={option.value}
              role="radio"
              aria-checked={settings.highlight === option.value}
              data-tip={option.tip}
              onClick={() => update({ highlight: option.value })}
              className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-env/60 ${
                settings.highlight === option.value ? 'bg-env-strong text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label htmlFor={referenceSelectId} className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Reference</label>
        <select
          id={referenceSelectId}
          value={reference?.id ?? ''}
          onChange={event => update({ referenceId: event.target.value })}
          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-env/60"
        >
          {candidates.map(record => (
            <option key={record.id} value={record.id}>{record.name || record.id}{record.visible === false ? ' (hidden)' : ''}</option>
          ))}
        </select>
      </div>
      <label className={`flex items-center gap-2 ${settings.highlight === 'disagreements' ? '' : 'opacity-50'}`}>
        <input
          type="checkbox"
          className="accent-[var(--env)]"
          checked={settings.matchDots}
          disabled={settings.highlight !== 'disagreements'}
          onChange={event => update({ matchDots: event.target.checked })}
        />
        Show identical residues as dots
      </label>
      <p className="text-[11px] leading-snug text-slate-400">
        Ambiguity codes (N, R, X…) are never counted as identical or different, so they stay as muted letters.
        Gaps are always drawn as gaps.
      </p>
    </div>
  );
};

/** Toolbar control for comparing every aligned row against one reference sequence. */
const ComparisonMenu: React.FC<ComparisonMenuProps> = ({ settings, onChange, reference, candidates, disabledReason }) => {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const active = !disabledReason && settings.highlight !== 'none' && reference;

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  useEffect(() => { if (disabledReason) setOpen(false); }, [disabledReason]);

  const update = (patch: Partial<AlignmentComparisonSettings>) => onChange({ ...settings, ...patch });

  return (
    <div ref={root} data-comparison-menu="" className="relative shrink-0">
      <button
        aria-label="Compare to reference"
        aria-expanded={open}
        aria-disabled={disabledReason ? true : undefined}
        data-tip={disabledReason ?? (active ? `Comparing every row against ${reference.name}` : 'Compare every aligned row against a reference sequence')}
        onClick={() => { if (!disabledReason) setOpen(value => !value); }}
        className={`h-10 flex max-w-[14rem] items-center gap-2 rounded-xl border px-3 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-env/60 ${
          disabledReason
            ? 'border-slate-800 bg-slate-950 text-slate-500 cursor-not-allowed'
            : active
              ? 'border-env/50 bg-env/10 text-env'
              : 'border-slate-800 bg-slate-950 text-slate-200 hover:bg-slate-800/60'
        }`}
      >
        <i className="fas fa-code-compare" aria-hidden="true"></i>
        <span className="truncate">{active ? `vs ${reference.name}` : 'Compare'}</span>
      </button>
      {open && (
        <ComparisonPanel settings={settings} update={update} reference={reference} candidates={candidates}
          onClose={() => { setOpen(false); root.current?.querySelector('button')?.focus(); }} />
      )}
    </div>
  );
};

export default ComparisonMenu;

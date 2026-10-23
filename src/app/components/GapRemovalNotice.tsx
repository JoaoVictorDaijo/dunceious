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

import React, { useEffect, useRef } from 'react';
import type { GapNotice } from '@/src/app/hooks/useBioWorker';

export const NCBI_FASTA_GUIDANCE = 'https://www.ncbi.nlm.nih.gov/genbank/fastaformat/';

export interface GapRemovalNoticeProps {
  notices: GapNotice[];
  onClose: () => void;
}

/** Tells the user which records loaded as sequences lost '-' gap characters. */
const GapRemovalNotice: React.FC<GapRemovalNoticeProps> = ({ notices, onClose }) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const dismissRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dismissRef.current?.focus();
    return () => previous?.focus();
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
    if (event.key !== 'Tab') return;
    const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>('a[href], button') ?? [])];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm motion-safe:animate-in motion-safe:fade-in">
      <div ref={dialogRef} role="alertdialog" aria-modal="true" aria-labelledby="gap-notice-title" aria-describedby="gap-notice-rule"
        onKeyDown={handleKeyDown}
        className="bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden border border-amber-500/30">
        <div className="bg-gradient-to-r from-amber-500/10 to-transparent px-8 py-6 border-b border-amber-500/20 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-400 flex-shrink-0">
            <i aria-hidden="true" className="fas fa-triangle-exclamation text-lg"></i>
          </div>
          <h2 id="gap-notice-title" className="text-lg font-bold uppercase tracking-tight text-white">Alignment gaps removed</h2>
        </div>

        <div className="px-8 py-6 space-y-4 overflow-y-auto text-sm">
          <p id="gap-notice-rule" className="text-slate-300">
            Gap characters (-) were removed. Positions refer to the ungapped sequence (<a href={NCBI_FASTA_GUIDANCE} target="_blank" rel="noreferrer" className="text-amber-300 underline">NCBI FASTA guidance</a>).
          </p>
          {notices.map(notice => (
            <section key={notice.fileName} aria-label={notice.fileName}>
              <h3 className="font-bold text-slate-100 break-all">{notice.fileName}</h3>
              <ul className="mt-1 space-y-0.5 text-slate-300">
                {notice.records.map(record => (
                  <li key={record.id} className="flex justify-between gap-4">
                    <span className="font-mono break-all">{record.id}</span>
                    <span className="text-slate-400 whitespace-nowrap">{record.removed} gap {record.removed === 1 ? 'character' : 'characters'}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <p className="text-xs text-slate-400">Gaps are shown only in an alignment. To view them, import this file as an alignment.</p>
        </div>

        <div className="bg-slate-800/50 px-8 py-4 border-t border-slate-700/50 flex justify-end">
          <button ref={dismissRef} onClick={onClose}
            className="px-6 py-2 rounded-lg text-sm font-bold uppercase text-white bg-amber-500/20 border border-amber-500/50 hover:bg-amber-500/30 transition-all">
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};

export default GapRemovalNotice;

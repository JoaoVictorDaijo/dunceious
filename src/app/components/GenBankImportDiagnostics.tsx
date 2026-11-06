/*
 * Dunceious
 * Copyright (C) 2026 João Victor Daijo and Murilo Cassiano
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

import { useEffect, useRef, useState } from 'react';
import { importDetails, type ImportDiagnosticFile } from '@/src/app/logic/genbankImport';

export function GenBankRefusalDialog({ files, onClose }: { files: ImportDiagnosticFile[]; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    close.current?.focus();
    return () => previous?.focus();
  }, []);
  return <div className="fixed inset-0 z-[210] flex items-center justify-center bg-slate-950/80 p-6">
    <div ref={dialog} role="alertdialog" aria-modal="true" aria-labelledby="genbank-refusal-title" className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl border border-rose-500/40 bg-slate-900 p-6 text-slate-200" onKeyDown={event => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
      if (event.key === 'Tab') {
        const buttons = dialog.current?.querySelectorAll('button');
        if (!buttons?.length) return;
        if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons[buttons.length - 1].focus(); }
        else if (!event.shiftKey && document.activeElement === buttons[buttons.length - 1]) { event.preventDefault(); buttons[0].focus(); }
      }
    }}>
      <h2 id="genbank-refusal-title" className="mb-4 text-lg font-bold text-rose-300">Can't open this GenBank file</h2>
      {files.map((file, index) => <section key={index} className="mb-4">
        <h3 className="font-bold">{file.filename} wasn't loaded</h3>
        <ul className="list-disc space-y-2 pl-5">{file.findings.slice(0, 20).map((f, i) => <li key={i}>Record {f.record.index} ({f.record.name}){f.feature ? ` · ${f.feature.key} ${f.feature.name}` : ''}{f.line ? ` · line ${f.line}` : ''}: {f.message}</li>)}</ul>
        {file.findings.length > 20 && <p>and {file.findings.length - 20} more</p>}
      </section>)}
      <div className="flex justify-end gap-4"><button onClick={() => void navigator.clipboard.writeText(importDetails(files))}>Copy details</button><button ref={close} onClick={onClose}>Close</button></div>
    </div>
  </div>;
}

export function GenBankImportNotes({ files, onClear }: { files: ImportDiagnosticFile[]; onClear: () => void }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const count = files.reduce((n, file) => n + file.findings.length, 0);
  if (!count) return null;
  return <div className="relative normal-case tracking-normal">
    <button className="rounded-full bg-amber-500/20 px-3 py-1 text-amber-300" aria-expanded={open} onClick={() => setOpen(!open)}>{count} import notes</button>
    {open && <div role="region" aria-label="Import notes" className="absolute bottom-full right-0 z-[100] mb-2 max-h-[60vh] w-96 overflow-auto rounded-xl border border-amber-500/30 bg-slate-900 p-4 text-slate-200 shadow-xl">
      {files.map((file, i) => <section key={i}><h3>{file.filename}</h3>{[...new Set(file.findings.map(f => f.code))].map(code => {
        const group = file.findings.filter(f => f.code === code);
        const key = `${i}:${code}`;
        return <div key={code}><h4>{code}: {group.length}</h4><ul>{(expanded.has(key) ? group : group.slice(0, 5)).map((f, index) => <li key={index}>{f.record.name} {f.feature?.name}: {f.message}</li>)}</ul>{group.length > 5 && !expanded.has(key) && <button onClick={() => setExpanded(new Set([...expanded, key]))}>Show all {group.length}</button>}</div>;
      })}</section>)}
      <div className="mt-3 flex gap-4"><button onClick={() => void navigator.clipboard.writeText(importDetails(files))}>Copy details</button><button onClick={onClear}>Clear notes</button><button onClick={() => setOpen(false)}>Close</button></div>
    </div>}
  </div>;
}

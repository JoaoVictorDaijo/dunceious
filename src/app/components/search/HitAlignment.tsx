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
import { useSessionOpenState } from '../../hooks/useSessionOpenState';
import SectionTitle from '../SectionTitle';

export function HitAlignment({ text, storageKey }: { text: string; storageKey: string }) {
  const [open, setOpen] = useSessionOpenState(`alignment:${storageKey}`);
  const [copyStatus, setCopyStatus] = useState('');
  return <details data-hit-alignment="" open={open} onToggle={e => setOpen(e.currentTarget.open)}
    onClick={e => e.stopPropagation()} className="group mt-3 text-slate-400">
    <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
      <SectionTitle icon="fa-align-left" trailing={<i aria-hidden="true" className="fas fa-chevron-up text-[10px] transition-transform group-open:rotate-180 motion-reduce:transition-none" />}>Alignment</SectionTitle>
    </summary>
    <button type="button" className="text-xs text-env px-2 py-1" onClick={async () => {
      try { await navigator.clipboard.writeText(text); setCopyStatus('Copied'); }
      catch { setCopyStatus('Copy failed'); }
    }}>Copy</button><span role="status" className="text-xs">{copyStatus}</span>
    <pre className="overflow-x-auto text-[10px] font-mono p-2 bg-slate-950 rounded">{text}</pre>
  </details>;
}

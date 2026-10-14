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

import { useEffect, useRef, useState } from 'react';

export default function UndoToast({ onUndo, onPause, locked }: { onUndo: () => void; onPause?: (paused: boolean) => void; locked?: boolean }) {
  const [message, setMessage] = useState('');
  const hovered = useRef(false);
  const focused = useRef(false);
  useEffect(() => {
    const timer = setTimeout(() => setMessage('Annotation deleted'), 0);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => () => onPause?.(false), [onPause]);
  return <div onMouseEnter={() => { hovered.current = true; onPause?.(true); }} onMouseLeave={() => { hovered.current = false; onPause?.(focused.current); }} onFocus={() => { focused.current = true; onPause?.(true); }} onBlur={event => {
    if (event.currentTarget.contains(event.relatedTarget as Node)) return;
    focused.current = false; onPause?.(hovered.current);
  }} className="absolute bottom-5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-5 rounded-lg bg-slate-900 px-5 py-3 text-sm text-white shadow-lg"><span role="status" aria-live="polite">{message}</span><button disabled={locked} className="font-semibold text-amber-300 underline focus-visible:ring-2 focus-visible:ring-amber-500 disabled:opacity-40" onClick={onUndo}>Undo</button></div>;
}

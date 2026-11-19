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


import { useLayoutEffect, useRef, useState } from 'react';

export function TranslationExtras({ extra, offset, autoFocus = false }: { extra: string; offset: number; autoFocus?: boolean }) {
  const [expanded, setExpanded] = useState(autoFocus);
  const heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => { if (expanded) heading.current?.focus(); }, [expanded]);
  return <section>
    <button type="button" className="text-xs underline" onClick={() => { setExpanded(true); heading.current?.focus(); }}>
      Show all {extra.length} extra stored translation positions
    </button>
    {expanded && <>
      <h3 ref={heading} tabIndex={-1} className="font-semibold">Extra stored translation positions</h3>
      <div role="region" aria-label="Complete extra stored translation positions" tabIndex={0}
        className="max-h-48 overflow-auto font-mono text-xs focus-visible:outline focus-visible:outline-2"
        onKeyDown={event => {
          const element = event.currentTarget;
          const steps: Record<string, number> = { ArrowDown: 24, ArrowUp: -24, PageDown: element.clientHeight, PageUp: -element.clientHeight };
          if (event.key === 'End') element.scrollTop = element.scrollHeight;
          else if (event.key === 'Home') element.scrollTop = 0;
          else if (steps[event.key] !== undefined) element.scrollTop += steps[event.key];
          else return;
          event.preventDefault();
        }}>
        <ol start={offset + 1}>{[...extra].map((residue, i) => <li key={i}>{offset + i + 1}: {residue}</li>)}</ol>
      </div>
    </>}
  </section>;
}

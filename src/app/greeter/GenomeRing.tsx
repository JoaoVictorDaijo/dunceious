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

import { useState, type KeyboardEvent } from 'react';
import { GENE_COLORS, GENES, GENOME_LENGTH, INITIAL_GENE, ringBand } from './greeterContent';

const fmt = (n: number) => n.toLocaleString('en-US');

// Drawn to scale, ORF10 is under 4 px wide; each band gets a hit area that
// reaches well past the ring so short genes stay tappable.
const HIT_INNER_R = 96;
const HIT_OUTER_R = 178;

export default function GenomeRing() {
  const [selected, setSelected] = useState(INITIAL_GENE);
  const gene = GENES[selected];
  const step = (delta: number) => setSelected((i) => (i + delta + GENES.length) % GENES.length);

  const onKey = (i: number) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setSelected(i);
    }
  };

  return (
    <figure className="m-0 flex flex-col items-center gap-1.5">
      <svg viewBox="-180 -180 360 360" className="w-[300px] max-w-full" role="group" aria-labelledby="genome-ring-title">
        <title id="genome-ring-title">SARS-CoV-2 genome as a ring of its genes</title>
        <circle cx={0} cy={0} r={150} fill="none" stroke="#1e293b" strokeWidth={2} />
        {GENES.map((g, i) => {
          const active = i === selected;
          return (
            <path
              key={g.name}
              d={ringBand(g.start, g.end, active ? 112 : 120, active ? 158 : 146)}
              fill={active ? '#f59e0b' : GENE_COLORS[i % GENE_COLORS.length]}
              aria-hidden="true"
              className="pointer-events-none"
            />
          );
        })}
        {GENES.map((g, i) => (
          <path
            key={g.name}
            d={ringBand(g.start, g.end, HIT_INNER_R, HIT_OUTER_R)}
            fill="transparent"
            stroke="transparent"
            strokeWidth={10}
            role="button"
            tabIndex={0}
            aria-label={`${g.name}, ${g.product}`}
            aria-pressed={i === selected}
            onClick={() => setSelected(i)}
            onKeyDown={onKey(i)}
            className="cursor-pointer outline-none focus-visible:[stroke-width:2] focus-visible:[stroke:white]"
          />
        ))}
        <g aria-hidden="true" className="pointer-events-none">
          <text x={0} y={-8} textAnchor="middle" className="fill-amber-300 font-mono text-[30px] font-extrabold">{gene.name}</text>
          <text x={0} y={20} textAnchor="middle" className="fill-slate-300 text-sm font-medium">{gene.product}</text>
          <text x={0} y={42} textAnchor="middle" className="fill-slate-400 font-mono text-xs font-medium">
            {fmt(gene.start)}–{fmt(gene.end)}
          </text>
        </g>
      </svg>
      <p className="sr-only" aria-live="polite">
        {gene.name}, {gene.product}, bases {fmt(gene.start)} to {fmt(gene.end)}.
      </p>
      <figcaption className="flex items-center gap-1 text-[13px] text-slate-400">
        <button type="button" onClick={() => step(-1)} aria-label="Previous gene" className="flex h-11 w-11 items-center justify-center text-slate-300">
          <i className="fa-solid fa-chevron-left" aria-hidden="true" />
        </button>
        <span>Tap a gene · SARS-CoV-2, {fmt(GENOME_LENGTH)} bp</span>
        <button type="button" onClick={() => step(1)} aria-label="Next gene" className="flex h-11 w-11 items-center justify-center text-slate-300">
          <i className="fa-solid fa-chevron-right" aria-hidden="true" />
        </button>
      </figcaption>
    </figure>
  );
}

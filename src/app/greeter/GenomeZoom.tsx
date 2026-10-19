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

import { type KeyboardEvent, type PointerEvent, type ReactElement } from 'react';
import { BASE_COLORS, GENES, GENOME_LENGTH } from './greeterContent';
import {
  AMINO_ACID_NAMES, BASE_SPAN, REGION_SPAN, baseAt, codonAt, geneAt, regionName, windowAround,
} from './genomeZoom';
import { useLens } from './useLens';

// Geometry in SVG units; the drawing is 342 units wide so the region strip is one unit per base.
const W = REGION_SPAN;
const GENOME = { top: 14, bottom: 32 };
const REGION = { top: 46, bottom: 80 };
const BASES = { top: 94, cell: 22 };
const AA = { top: 120, height: 20 };
const H = 142;
const CELL = W / BASE_SPAN;
const LENS = '#38bdf8';
const GENE_FILL = '#475569';
const CURRENT_GENE_FILL = '#cbd5e1';
const fmt = (n: number) => n.toLocaleString('en-US');

/** A forward-strand gene drawn the way the workbench draws an annotation: a bar with a pointed 3′ end. */
function arrow(x: number, y: number, w: number, h: number) {
  const tip = Math.min(4, w / 2);
  return `M${x} ${y}h${w - tip}l${tip} ${h / 2}l${-tip} ${h / 2}h${tip - w}z`;
}

function Funnel({ from, to, y0, y1 }: { from: [number, number]; to: [number, number]; y0: number; y1: number }) {
  return (
    <path
      d={`M${from[0]} ${y0}L${to[0]} ${y1}H${to[1]}L${from[1]} ${y0}Z`}
      fill={LENS}
      fillOpacity={0.08}
      stroke={LENS}
      strokeOpacity={0.35}
      strokeWidth={0.75}
    />
  );
}

/** The narrowest whole-genome gene arrow, in SVG units, that fits a two-character gene number. */
const LABEL_MIN_WIDTH = 14;

function GenomeTrack({ region, current }: { region: [number, number]; current?: string }) {
  const sx = W / GENOME_LENGTH;
  const lensX = (region[0] - 1) * sx;
  const lensW = Math.max(6, REGION_SPAN * sx);
  return (
    <g>
      <text x={0} y={9} className="fill-slate-400 text-[9px]">1</text>
      <text x={W} y={9} textAnchor="end" className="fill-slate-400 text-[9px]">{fmt(GENOME_LENGTH)}</text>
      <line x1={0} x2={W} y1={23} y2={23} stroke="#334155" strokeWidth={1} />
      {GENES.map((g) => (
        <path key={g.name} d={arrow((g.start - 1) * sx, 18, (g.end - g.start + 1) * sx, 10)} fill={g.name === current ? CURRENT_GENE_FILL : GENE_FILL} />
      ))}
      {GENES.filter((g) => (g.end - g.start + 1) * sx >= LABEL_MIN_WIDTH).map((g) => (
        <text key={g.name} x={(g.start + g.end) / 2 * sx} y={25.5} textAnchor="middle" className="pointer-events-none fill-slate-950 text-[7px] font-bold">{g.name}</text>
      ))}
      <rect x={Math.min(lensX, W - lensW)} y={GENOME.top} width={lensW} height={GENOME.bottom - GENOME.top} rx={1.5} fill={LENS} fillOpacity={0.2} stroke={LENS} strokeWidth={1.5} />
    </g>
  );
}

function RegionTrack({ region, bases, current }: { region: [number, number]; bases: [number, number]; current?: string }) {
  const genes = GENES.filter((g) => g.end >= region[0] && g.start <= region[1]);
  const cells: ReactElement[] = [];
  for (let p = region[0]; p <= region[1]; p++) {
    cells.push(<rect key={p} x={p - region[0]} y={REGION.top + 12} width={1.02} height={18} fill={BASE_COLORS[baseAt(p)]} />);
  }
  return (
    <g>
      {genes.map((g) => {
        const x0 = Math.max(g.start, region[0]) - region[0];
        const x1 = Math.min(g.end, region[1]) - region[0] + 1;
        return (
          <g key={g.name}>
            <path d={arrow(x0, REGION.top, x1 - x0, 10)} fill={g.name === current ? CURRENT_GENE_FILL : GENE_FILL} />
            {x1 - x0 > 40 && (
              <text x={(x0 + x1) / 2} y={REGION.top + 7.5} textAnchor="middle" className="pointer-events-none fill-slate-950 text-[7px] font-bold">{g.name}</text>
            )}
          </g>
        );
      })}
      {cells}
      <rect x={bases[0] - region[0]} y={REGION.top + 9} width={BASE_SPAN} height={24} fill="none" stroke={LENS} strokeWidth={1.5} rx={1} />
    </g>
  );
}

/** Columns grouped by the codon they belong to, clipped to the visible bases. */
function codonRuns(bases: [number, number]) {
  const runs: { key: string; from: number; to: number; residue: string; centre: boolean }[] = [];
  const centre = codonAt(bases[0] + Math.floor(BASE_SPAN / 2));
  for (let p = bases[0]; p <= bases[1]; p++) {
    const c = codonAt(p);
    if (!c) continue;
    const key = `${c.gene.name}:${c.number}`;
    const last = runs[runs.length - 1];
    if (last?.key === key && last.to === p - 1) last.to = p;
    else runs.push({ key, from: p, to: p, residue: c.residue, centre: !!centre && key === `${centre.gene.name}:${centre.number}` });
  }
  return runs;
}

function BaseTrack({ bases }: { bases: [number, number] }) {
  const centre = bases[0] + Math.floor(BASE_SPAN / 2);
  const columns = Array.from({ length: BASE_SPAN }, (_, i) => bases[0] + i);
  return (
    <g>
      {columns.map((p, i) => (
        <g key={p}>
          <rect x={i * CELL} y={BASES.top} width={CELL + 0.2} height={BASES.cell} fill={BASE_COLORS[baseAt(p)]} />
          <text x={(i + 0.5) * CELL} y={BASES.top + 15.5} textAnchor="middle" className="fill-slate-950 font-mono text-[13px] font-bold">{baseAt(p)}</text>
        </g>
      ))}
      <rect x={(centre - bases[0]) * CELL} y={BASES.top - 1.5} width={CELL} height={BASES.cell + 3} fill="none" stroke="#f8fafc" strokeWidth={1.5} rx={1.5} />
      {codonRuns(bases).map((r) => (
        <g key={r.key}>
          <rect x={(r.from - bases[0]) * CELL + 1} y={AA.top} width={(r.to - r.from + 1) * CELL - 2} height={AA.height} rx={2} fill="#1e293b" stroke={r.centre ? LENS : '#475569'} strokeWidth={r.centre ? 1.5 : 0.75} />
          {r.to - r.from === 2 && (
            <text x={((r.from + r.to) / 2 - bases[0] + 0.5) * CELL} y={AA.top + 14.5} textAnchor="middle" className="fill-amber-300 font-mono text-[13px] font-extrabold">{r.residue}</text>
          )}
        </g>
      ))}
    </g>
  );
}

function describe(pos: number): { title: string; product?: string; codonLine?: string } {
  const codon = codonAt(pos);
  if (codon) {
    const name = AMINO_ACID_NAMES[codon.residue] ?? 'unknown residue';
    return { title: `Gene ${codon.gene.name}`, product: codon.gene.product, codonLine: `Codon ${fmt(codon.number)}, ${name} (${codon.residue})` };
  }
  const gene = geneAt(pos);
  return gene ? { title: `Gene ${gene.name}`, product: gene.product } : { title: regionName(pos) };
}

export default function GenomeZoom() {
  const lens = useLens();
  const region = windowAround(lens.center, REGION_SPAN);
  const bases = windowAround(lens.center, BASE_SPAN);
  const info = describe(lens.center);
  const valueText = `Base ${fmt(lens.center)}, ${info.title}${info.product ? `, ${info.product}` : ''}${info.codonLine ? `, ${info.codonLine}` : ''}`;

  return (
    <figure className="m-0 flex flex-col gap-3">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full cursor-grab touch-pan-y select-none rounded outline-none focus-visible:ring-2 focus-visible:ring-sky-400 active:cursor-grabbing"
        role="slider"
        tabIndex={0}
        aria-label="Position in the phage T7 genome"
        aria-valuemin={1}
        aria-valuemax={GENOME_LENGTH}
        aria-valuenow={lens.center}
        aria-valuetext={valueText}
        onPointerDown={(e: PointerEvent<SVGSVGElement>) => lens.onPointerDown(e, { genomeBottom: GENOME.bottom + 6, regionBottom: REGION.bottom + 6 })}
        onPointerMove={lens.onPointerMove}
        onPointerUp={lens.onPointerUp}
        onPointerCancel={lens.onPointerUp}
        onKeyDown={(e: KeyboardEvent) => lens.onKeyDown(e)}
      >
        <GenomeTrack region={region} current={geneAt(lens.center)?.name} />
        <Funnel from={[(region[0] - 1) * W / GENOME_LENGTH, Math.max((region[1]) * W / GENOME_LENGTH, (region[0] - 1) * W / GENOME_LENGTH + 6)]} to={[0, W]} y0={GENOME.bottom} y1={REGION.top} />
        <RegionTrack region={region} bases={bases} current={geneAt(lens.center)?.name} />
        <Funnel from={[bases[0] - region[0], bases[1] - region[0] + 1]} to={[0, W]} y0={REGION.top + 33} y1={BASES.top - 1.5} />
        <BaseTrack bases={bases} />
      </svg>
      <p className={`m-0 -mt-1 text-center text-[13px] text-slate-400 transition-opacity duration-500 motion-reduce:transition-none ${lens.touched ? 'opacity-0' : 'opacity-100'}`} aria-hidden="true">
        Drag the genome to explore
      </p>
      <figcaption className="flex items-start gap-1">
        <button type="button" onClick={lens.previousGene} aria-label="Previous gene" className="flex h-11 w-9 shrink-0 items-center justify-center text-slate-400">
          <i className="fa-solid fa-chevron-left" aria-hidden="true" />
        </button>
        <div className="relative min-h-[76px] flex-1" aria-hidden="true">
          <p className="m-0 text-[17px] leading-snug">
            <span className="font-bold text-slate-100">{info.title}</span>
            {info.product && <span className="text-slate-400"> {info.product}</span>}
          </p>
          <p className="m-0 text-sm leading-relaxed text-slate-300">Base {fmt(lens.center)} of {fmt(GENOME_LENGTH)}</p>
          {info.codonLine && <p className="m-0 text-sm leading-relaxed text-slate-300">{info.codonLine}</p>}
        </div>
        <button type="button" onClick={lens.nextGene} aria-label="Next gene" className="flex h-11 w-9 shrink-0 items-center justify-center text-slate-400">
          <i className="fa-solid fa-chevron-right" aria-hidden="true" />
        </button>
      </figcaption>
    </figure>
  );
}

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

import {
  BASE_COLORS, D614G_INDEX, D614G_LINEAGES, D614G_WINDOW, GENOME_LENGTH,
  ORF1AB_RESIDUES, ORF1AB_START, TRS_HITS, TRS_MOTIF, seededNoise,
} from './greeterContent';

const caption = 'text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400';

function DropScene() {
  return (
    <div className="flex h-[220px] w-[280px] flex-col items-center justify-center gap-3.5 rounded-[20px] border-2 border-dashed border-sky-400">
      <div className="-rotate-[4deg] rounded-xl border border-[#263450] bg-slate-950 px-4 py-3 font-mono text-sm font-bold shadow-[0_10px_24px_rgba(0,0,0,0.4)]">
        sars-cov-2.gb
      </div>
      <div className="text-sm text-slate-400">GenBank · FASTA · GFF3 · BED · project</div>
    </div>
  );
}

// Decorative mismatch density, hotter over the accessory genes as on the real overview.
const DENSITY = (() => {
  const rnd = seededNoise(3);
  return Array.from({ length: 50 }, (_, i) => {
    const t = rnd() * (i > 35 && i < 43 ? 1 : 0.5);
    return t > 0.6 ? '#be123c' : t > 0.35 ? '#c2410c' : t > 0.15 ? '#4d7c0f' : '#14532d';
  });
})();

function ZoomScene() {
  return (
    <div className="flex w-[300px] max-w-full flex-col gap-3.5">
      <div className="flex flex-col gap-1">
        <span className={caption}>Whole genome</span>
        <div className="flex h-[22px] overflow-hidden rounded">
          {DENSITY.map((c, i) => <span key={i} className="flex-1" style={{ background: c }} />)}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <span className={caption}>Every base</span>
        <div className="flex">
          {[...ORF1AB_START].map((b, i) => (
            <span key={i} className="flex-1 text-center font-mono text-[13px] font-bold leading-6 text-slate-950" style={{ background: BASE_COLORS[b] }}>{b}</span>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <span className={caption}>Amino acids · F1</span>
        <div className="flex">
          {[...ORF1AB_RESIDUES].map((a, i) => (
            <span key={i} className="flex-1 border border-white bg-slate-800 text-center font-mono text-sm font-extrabold leading-[26px] text-amber-300">{a}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function SearchScene() {
  return (
    <div className="flex w-[300px] max-w-full flex-col gap-[18px]">
      <div className="flex h-12 items-center rounded-xl border border-sky-700 bg-slate-950 px-3.5 font-mono text-lg font-bold tracking-[0.08em]">
        {TRS_MOTIF}
      </div>
      <div className="relative h-[26px] rounded-md bg-slate-800">
        {TRS_HITS.map((p) => (
          <span key={p} className="absolute -bottom-1 -top-1 w-1 rounded-sm bg-amber-400" style={{ left: `${(p / GENOME_LENGTH) * 100}%` }} />
        ))}
      </div>
      <div className="text-sm text-slate-300">{TRS_HITS.length} hits · one before almost every gene</div>
    </div>
  );
}

function CompareScene() {
  const rows = ['Wuhan-Hu-1', ...D614G_LINEAGES];
  return (
    <div className="flex w-[300px] max-w-full flex-col gap-1.5">
      {rows.map((name, r) => (
        <div key={name} className="flex items-center gap-2">
          <span className="w-[70px] shrink-0 whitespace-nowrap text-[11px] font-semibold text-slate-300">{name}</span>
          <div className="flex flex-1">
            {[...D614G_WINDOW].map((c, i) => {
              const ref = r === 0;
              const change = !ref && i === D614G_INDEX;
              return (
                <span
                  key={i}
                  className={`flex-1 text-center font-mono text-xs font-bold leading-[22px] ${ref || change ? 'text-slate-950' : 'text-slate-500'}`}
                  style={{ background: ref ? BASE_COLORS[c] : change ? '#facc15' : 'transparent' }}
                >
                  {ref ? c : change ? 'G' : '·'}
                </span>
              );
            })}
          </div>
        </div>
      ))}
      <div className="pt-2 text-sm text-slate-300">D614G, the spike change that took over in 2020.</div>
    </div>
  );
}

export const TOUR_SCENES = [DropScene, ZoomScene, SearchScene, CompareScene] as const;

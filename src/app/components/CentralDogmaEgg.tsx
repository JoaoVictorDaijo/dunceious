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

import React, { useEffect, useRef, useState } from 'react';
import { getAminoAcidColor, getNucleotideColor } from '@/src/app/viewer/colors';
import { MONO_STACK } from '@/src/app/viewer/constants';
import { CLOSE_GUARD_MS, CODING_STRAND, CODONS, templateStrand, transcribe } from '@/src/app/logic/easterEgg';

/** Act timings in ms: spin, unzip, transcribe, then translate. */
const UNZIP_AT = 1600;
const UNZIP_MS = 1100;
const TRANSCRIBE_AT = UNZIP_AT + UNZIP_MS;
const BASE_MS = 70;
const TRANSLATE_AT = TRANSCRIBE_AT + CODING_STRAND.length * BASE_MS + 250;
const CODON_MS = 240;
const FINALE_AT = TRANSLATE_AT + CODONS.length * CODON_MS + 300;
const FINAL_FRAME = FINALE_AT + 1;

const TEMPLATE = templateStrand(CODING_STRAND);
const MRNA = transcribe(CODING_STRAND);

const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.pow(1 - x, 3));

function drawFrame(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  ctx.clearRect(0, 0, w, h);
  const n = CODING_STRAND.length;
  const step = Math.min(34, (w - 40) / n);
  const left = (w - step * n) / 2;
  const cy = h * 0.36;
  const amp = 38;
  const unzip = ease((t - UNZIP_AT) / UNZIP_MS);
  const sep = unzip * 52;
  // Unzipped strands relax to flat lines so the bases read like a sequence track.
  const twist = 1 - unzip;
  const spin = t * 0.0017;

  const strandY = (u: number, which: 1 | -1) => {
    const ph = u * 0.62 + spin;
    return cy + which * (amp * Math.sin(ph) * twist - sep);
  };
  const depth = (u: number) => Math.cos(u * 0.62 + spin);

  // Backbones, sampled finely so they curve; depth fades the far side.
  for (const which of [1, -1] as const) {
    for (let u = -0.5; u < n - 0.5; u += 0.25) {
      const d = which === 1 ? depth(u) : -depth(u);
      ctx.strokeStyle = which === 1 ? '#cbd5e1' : '#64748b';
      ctx.globalAlpha = twist > 0.01 ? 0.35 + 0.65 * ((d + 1) / 2) : 0.9;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(left + (u + 0.5) * step, strandY(u, which));
      ctx.lineTo(left + (u + 0.75) * step, strandY(u + 0.25, which));
      ctx.stroke();
    }
  }

  // Base pairs: a rung while zipped, two facing stubs once unzipped.
  ctx.font = `600 10px ${MONO_STACK}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < n; i++) {
    const x = left + (i + 0.5) * step;
    const y1 = strandY(i, 1);
    const y2 = strandY(i, -1);
    const front = (depth(i) + 1) / 2;
    const gap = 6 * unzip;
    const mid = (y1 + y2) / 2;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.45 + 0.55 * Math.max(front, unzip);
    ctx.strokeStyle = getNucleotideColor(CODING_STRAND[i]);
    ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, unzip > 0 ? y1 + Math.min(14, (mid - y1)) : mid - gap); ctx.stroke();
    ctx.strokeStyle = getNucleotideColor(TEMPLATE[i]);
    ctx.beginPath(); ctx.moveTo(x, y2); ctx.lineTo(x, unzip > 0 ? y2 - Math.min(14, (y2 - mid)) : mid + gap); ctx.stroke();
    if (unzip > 0.6) {
      ctx.globalAlpha = (unzip - 0.6) / 0.4;
      ctx.fillStyle = '#e2e8f0';
      ctx.fillText(CODING_STRAND[i], x, y1 - 11);
      ctx.fillText(TEMPLATE[i], x, y2 + 11);
    }
  }

  // Transcription: an RNA polymerase glow walks the template, laying down mRNA.
  const rnaY = cy + amp * 0 + sep + 48;
  const made = Math.max(0, Math.min(n, Math.floor((t - TRANSCRIBE_AT) / BASE_MS)));
  if (t > TRANSCRIBE_AT) {
    for (let i = 0; i < made; i++) {
      const x = left + (i + 0.5) * step;
      const codon = Math.floor(i / 3);
      const reading = t > TRANSLATE_AT && Math.floor((t - TRANSLATE_AT) / CODON_MS) === codon;
      ctx.globalAlpha = 1;
      ctx.fillStyle = getNucleotideColor(MRNA[i]);
      ctx.globalAlpha = reading ? 1 : 0.85;
      roundRect(ctx, x - step / 2 + 2, rnaY - 11, step - 4, 22, 5);
      ctx.fill();
      ctx.fillStyle = '#020617';
      ctx.font = `700 11px ${MONO_STACK}`;
      ctx.fillText(MRNA[i], x, rnaY + 0.5);
    }
    if (made < n) {
      const x = left + (made + 0.5) * step;
      const g = ctx.createRadialGradient(x, rnaY - 20, 2, x, rnaY - 20, 40);
      g.addColorStop(0, 'rgba(56,189,248,0.55)');
      g.addColorStop(1, 'rgba(56,189,248,0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, rnaY - 20, 40, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#94a3b8';
    ctx.font = `500 10px ${MONO_STACK}`;
    ctx.textAlign = 'right';
    ctx.fillText("5′ mRNA", left - 10, rnaY);
    ctx.textAlign = 'center';
  }

  // Codon brackets under the mRNA once the ribosome starts reading.
  if (t > TRANSLATE_AT) {
    const read = Math.min(CODONS.length, Math.floor((t - TRANSLATE_AT) / CODON_MS) + 1);
    ctx.lineWidth = 1.5;
    for (let c = 0; c < read; c++) {
      const x0 = left + c * 3 * step + 3;
      const x1 = left + (c + 1) * 3 * step - 3;
      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = CODONS[c].note ? '#f59e0b' : '#475569';
      ctx.beginPath();
      ctx.moveTo(x0, rnaY + 16); ctx.lineTo(x0, rnaY + 20); ctx.lineTo(x1, rnaY + 20); ctx.lineTo(x1, rnaY + 16);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const AUTHORS = ['JoaoVictorDaijo', 'MuriloACassiano'] as const;

const AuthorCard: React.FC<{ login: string }> = ({ login }) => {
  const [avatarFailed, setAvatarFailed] = useState(false);
  return (
    <a
      href={`https://github.com/${login}`}
      target="_blank"
      rel="noreferrer"
      // The backdrop closes on click; following a profile link must not.
      onClick={e => e.stopPropagation()}
      className="group flex items-center gap-3 pl-2.5 pr-4 py-2 rounded-2xl border border-slate-800 bg-slate-900/70 hover:border-sky-500/50 hover:bg-slate-900 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60"
    >
      {avatarFailed ? (
        <span className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-400" aria-hidden="true">
          <i className="fab fa-github text-lg"></i>
        </span>
      ) : (
        // Offline or blocked? The glyph above takes over rather than a broken image.
        <img
          src={`https://github.com/${login}.png?size=80`}
          alt=""
          width={40}
          height={40}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setAvatarFailed(true)}
          className="w-10 h-10 rounded-full bg-slate-800 ring-1 ring-slate-700 group-hover:ring-sky-500/60 transition-shadow"
        />
      )}
      <span className="flex flex-col items-start text-left">
        <span className="text-sm font-bold text-slate-100">{login}</span>
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500 group-hover:text-sky-400 transition-colors">
          <i className="fab fa-github mr-1.5"></i>GitHub
        </span>
      </span>
    </a>
  );
};

interface CentralDogmaEggProps {
  onClose: () => void;
  /** Open on the finished picture instead of playing the whole animation. */
  replay?: boolean;
}

/**
 * The version-tap easter egg: a double helix unzips, is transcribed into mRNA,
 * and the ribosome reads codons that spell the app's name — two of them only
 * because the cell recodes a stop codon.
 */
const CentralDogmaEgg: React.FC<CentralDogmaEggProps> = ({ onClose, replay = false }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [elapsed, setElapsed] = useState(replay ? FINAL_FRAME : 0);
  const [backdropArmed, setBackdropArmed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setBackdropArmed(true), CLOSE_GUARD_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const still = replay || (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
    let frame = 0;
    const start = performance.now();
    const render = (now: number) => {
      const dpr = window.devicePixelRatio || 1;
      const { width, height } = canvas.getBoundingClientRect();
      if (canvas.width !== Math.round(width * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Replays and reduced motion land on the finished picture with a still helix.
      const t = still ? FINAL_FRAME : now - start;
      drawFrame(ctx, width, height, t);
      setElapsed(t);
      if (!still) frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [replay]);

  const shown = elapsed < TRANSLATE_AT ? 0 : Math.min(CODONS.length, Math.floor((elapsed - TRANSLATE_AT) / CODON_MS) + 1);
  const caption =
    elapsed < UNZIP_AT ? 'DNA' : elapsed < TRANSCRIBE_AT ? 'Unzipping…' : elapsed < TRANSLATE_AT ? 'Transcription: DNA → mRNA' : 'Translation: mRNA → protein';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="DUNCEIOUS gene expression easter egg"
      onClick={() => { if (backdropArmed) onClose(); }}
      className="fixed inset-0 z-[300] bg-slate-950/95 backdrop-blur-md flex flex-col items-center overflow-y-auto p-6 animate-in fade-in duration-500 select-none"
    >
      <button
        ref={closeRef}
        onClick={onClose}
        aria-label="Close"
        data-tip="Close"
        data-tip-kbd="Esc"
        className="absolute top-6 right-6 w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/60"
      >
        <i className="fas fa-xmark"></i>
      </button>

      <p className="mt-auto text-[10px] font-bold uppercase tracking-[0.4em] text-sky-400/80 mb-2 transition-opacity" aria-live="polite">{caption}</p>
      <canvas ref={canvasRef} className="w-full max-w-[1000px] h-[260px]" aria-hidden="true" />

      <div className="flex gap-2 mt-2 min-h-[92px]" aria-label="Translated protein">
        {CODONS.slice(0, shown).map((c, i) => (
          <div
            key={i}
            data-tip={c.note}
            onClick={e => e.stopPropagation()}
            className={`w-14 flex flex-col items-center gap-1 py-2 rounded-xl border animate-in fade-in zoom-in-75 slide-in-from-bottom-2 duration-300 ${
              c.note ? 'border-amber-500/60 bg-amber-500/10' : 'border-slate-800 bg-slate-900/80'
            }`}
          >
            <span className="text-3xl font-black italic leading-none" style={{ color: c.note ? '#fbbf24' : getAminoAcidColor(c.aa) }}>{c.aa}</span>
            <span className="font-mono text-[10px] text-slate-500">{transcribe(c.dna)}</span>
          </div>
        ))}
      </div>

      {/* Space is reserved up front so the strands don't jump when the finale lands. */}
      <div className="mt-6 mb-auto min-h-[200px] text-center max-w-xl">
      {elapsed >= FINALE_AT && (
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-700">
          <h2 className="text-2xl font-black uppercase italic tracking-tight text-white">DUNCEIOUS expressed</h2>
          <p
            className="mt-3 text-sm text-slate-400 animate-in fade-in duration-700 fill-mode-backwards"
            style={{ animationDelay: '400ms' }}
          >
            Made with passion and built for science
          </p>
          <div
            className="mt-4 flex flex-wrap justify-center gap-3 animate-in fade-in slide-in-from-bottom-2 duration-700 fill-mode-backwards"
            style={{ animationDelay: '700ms' }}
          >
            {AUTHORS.map(login => <AuthorCard key={login} login={login} />)}
          </div>
          <p className="mt-6 text-[10px] font-bold uppercase tracking-[0.3em] text-slate-600">Geniality is overpriced · click anywhere to close</p>
        </div>
      )}
      </div>
    </div>
  );
};

export default CentralDogmaEgg;

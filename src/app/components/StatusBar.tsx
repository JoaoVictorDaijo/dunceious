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

import React, { useEffect, useRef, useState } from "react";
import type { ThemeKey } from "@/src/app/logic/theme";
import { TAP_WINDOW_MS, tapOutcome } from "@/src/app/logic/easterEgg";
import CentralDogmaEgg from "./CentralDogmaEgg";

interface StatusBarProps {
  sessionMoleculeType: "nucleotide" | "protein" | null;
  themeKey: ThemeKey;
}

const Divider: React.FC = () => <span aria-hidden="true" className="w-px h-3 bg-slate-700/70" />;

const linkClass =
  "flex items-center gap-1.5 rounded transition-colors hover:text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/60";

/**
 * Footer status bar shown at the bottom of the app. The session pill takes the
 * environment accent, so it re-tints with the header when the workspace changes.
 */
const StatusBar: React.FC<StatusBarProps> = ({ sessionMoleculeType, themeKey }) => {
  const taps = useRef({ count: 0, last: 0 });
  const [unlocked, setUnlocked] = useState(false);
  const [egg, setEgg] = useState<"closed" | "play" | "replay">("closed");
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(timer);
  }, [toast]);

  const onVersionTap = () => {
    const now = Date.now();
    const t = taps.current;
    t.count = now - t.last > TAP_WINDOW_MS ? 1 : t.count + 1;
    t.last = now;
    const outcome = tapOutcome(t.count, unlocked);
    if (outcome.kind === "countdown") {
      setToast({ id: now, text: `${outcome.remaining} ${outcome.remaining === 1 ? "tap" : "taps"} away from unzipping the helix` });
    } else if (outcome.kind === "unlock") {
      t.count = 0;
      setToast(null);
      setUnlocked(true);
      setEgg("play");
    } else if (outcome.kind === "replay") {
      setEgg("replay");
    }
  };

  return (
  <>
  {toast && (
    <div
      key={toast.id}
      role="status"
      className="fixed bottom-12 left-6 z-[200] px-3.5 py-2 rounded-xl bg-slate-800/95 border border-slate-700 shadow-xl text-[11px] font-medium text-slate-200 animate-in fade-in slide-in-from-bottom-2 duration-200"
    >
      <i className="fas fa-dna mr-2 text-sky-400"></i>{toast.text}
    </div>
  )}
  {egg !== "closed" && <CentralDogmaEgg replay={egg === "replay"} onClose={() => setEgg("closed")} />}
  <div data-theme={themeKey} className="app-status relative bg-slate-950 border-t border-slate-800/80 overflow-hidden">
    <div className="hf-env" aria-hidden="true" />
    <div className="status-copy relative z-[1] px-6 py-2 flex justify-between items-center text-[9px] font-bold uppercase tracking-[0.16em] text-slate-400">
      <div className="flex gap-4 items-center">
        {/* Tap seven times, as with Android's build number. */}
        <button
          onClick={onVersionTap}
          className="uppercase text-slate-300 hover:text-white rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/60"
          data-tip="Dunceious build version"
        >
          Dunceious v{__APP_VERSION__}
        </button>
        <Divider />
        <a
          href="https://www.gnu.org/licenses/agpl-3.0.html"
          target="_blank"
          rel="noreferrer"
          className={linkClass}
          data-tip="Free software under the GNU AGPL v3 or later (opens gnu.org)"
        >
          <i className="fas fa-certificate"></i> AGPL v3 or later
        </a>
        <Divider />
        <a
          href="https://github.com/JoaoVictorDaijo/dunceious"
          target="_blank"
          rel="noreferrer"
          className={linkClass}
          data-tip="Browse the source code on GitHub"
        >
          <i className="fab fa-github"></i> Source Code
        </a>
      </div>
      <div className="flex gap-4 items-center">
        {sessionMoleculeType && (
          <>
            <span
              className="flex items-center gap-2 px-2.5 py-0.5 rounded-full border animate-in fade-in duration-500"
              style={{
                color: "var(--env)",
                borderColor: "color-mix(in srgb, var(--env) 30%, transparent)",
                backgroundColor: "color-mix(in srgb, var(--env) 8%, transparent)",
              }}
              data-tip={sessionMoleculeType === "protein"
                ? "Peptide session: residues are amino acids; translation is off"
                : "Nucleotide session: DNA/RNA bases with optional translation"}
            >
              <span className="relative flex w-1.5 h-1.5" aria-hidden="true">
                <span className="absolute inset-0 rounded-full opacity-60 animate-ping motion-reduce:animate-none" style={{ backgroundColor: "var(--env)" }} />
                <span className="relative w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "var(--env)" }} />
              </span>
              <i className={`fas ${sessionMoleculeType === "protein" ? "fa-circle-nodes" : "fa-dna"}`}></i>
              {sessionMoleculeType === "protein" ? "Peptide Session" : "Nucleotide Session"}
            </span>
            <Divider />
          </>
        )}
        <span className="text-slate-400">Built for Science</span>
        <Divider />
        <span className="text-slate-400">© 2026 João Victor Daijo &amp; Murilo Cassiano</span>
      </div>
    </div>
  </div>
  </>
  );
};

export default StatusBar;

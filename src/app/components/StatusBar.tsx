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

import React from "react";

interface StatusBarProps {
  sessionMoleculeType: "nucleotide" | "protein" | null;
}

/**
 * Footer status bar shown at the bottom of the app.
 */
const StatusBar: React.FC<StatusBarProps> = ({ sessionMoleculeType }) => (
  <div className="bg-slate-950 border-t border-slate-800 px-6 py-2 flex justify-between items-center text-[9px] font-black uppercase tracking-widest text-slate-600">
    <div className="flex gap-4">
      <span>Dunceious v{__APP_VERSION__}</span>
      <span className="text-slate-800">|</span>
      <a
        href="https://www.gnu.org/licenses/agpl-3.0.html"
        target="_blank"
        rel="noreferrer"
        className="hover:text-sky-500 transition-colors"
      >
        <i className="fas fa-certificate mr-1"></i> AGPL v3 or later
      </a>
      <span className="text-slate-800">|</span>
      <a
        href="https://github.com/JoaoVictorDaijo/dunceious"
        target="_blank"
        rel="noreferrer"
        className="hover:text-emerald-500 transition-colors"
      >
        <i className="fab fa-github mr-1"></i> Source Code
      </a>
    </div>
    <div className="flex gap-4 items-center">
      {sessionMoleculeType && (
        <>
          <span
            className={`flex items-center gap-1.5 transition-colors ${sessionMoleculeType === "protein" ? "text-violet-400" : "text-sky-400"}`}
          >
            <i
              className={`fas ${sessionMoleculeType === "protein" ? "fa-circle-nodes" : "fa-dna"}`}
            ></i>
            {sessionMoleculeType === "protein"
              ? "Peptide Session"
              : "Nucleotide Session"}
          </span>
          <span className="text-slate-800">|</span>
        </>
      )}
      <span>Built for Science</span>
      <span className="text-slate-800">|</span>
      <span>© 2026</span>
    </div>
  </div>
);

export default StatusBar;

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

/** Portrait covers the workbench with this prompt; the session underneath keeps running. */
export function RotatePrompt({ onBack }: { onBack: () => void }) {
  return (
    <div className="fixed inset-0 z-[150] flex flex-col items-center justify-center gap-6 bg-slate-950 px-8 text-center">
      <svg viewBox="0 0 120 120" className="h-32 w-32" aria-hidden="true">
        <path d="M 26 34 A 44 44 0 0 1 86 26" fill="none" stroke="var(--env)" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M 78 19 L 87 26 L 77 31" fill="none" stroke="var(--env)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <g className="showroom-turn">
          <rect x="44" y="34" width="32" height="58" rx="6" fill="#151e34" stroke="#cbd5e1" strokeWidth="2.5" />
          <line x1="55" y1="40" x2="65" y2="40" stroke="#64748b" strokeWidth="2" strokeLinecap="round" />
          <rect x="49" y="45" width="22" height="40" rx="2" fill="var(--env)" opacity="0.18" />
        </g>
      </svg>
      <p className="text-lg font-semibold text-white">Turn your phone sideways</p>
      <button type="button" onClick={onBack}
        className="rounded-lg px-3 py-2 text-sm font-semibold text-[var(--env)] underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--env)]">
        Back
      </button>
    </div>
  );
}

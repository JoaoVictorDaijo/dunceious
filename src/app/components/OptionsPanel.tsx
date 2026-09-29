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

import React, { useEffect, useRef, useState } from 'react';
import { getFeatureColor } from '@/src/app/viewer/colors';
import { THEMES, type ThemeKey } from '@/src/app/logic/theme';

const FEATURE_TYPES = [
  'gene', 'CDS', 'mRNA', 'tRNA', 'rRNA', 'exon',
  'intron', 'promoter', 'regulatory', 'misc_feature', 'primer', 'origin',
];

export interface OptionsPanelProps {
  featureColors: Record<string, string>;
  onSetFeatureColors: (colors: Record<string, string>) => void;
  skipClearAllConfirmation: boolean;
  onSetSkipClearAllConfirmation: (value: boolean) => void;
  themeKey: ThemeKey;
  onSetThemeKey: (key: ThemeKey) => void;
}

// Thin classic cog, stroke-based on purpose: a refined settings glyph rather than a filled control.
const CogIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}
    strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true"
  >
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

/**
 * Global options popover, opened from a gear in the top nav. Houses preferences
 * that apply across both workspace modes — the feature-colour map (which paints
 * the viewport and the hub alike) and workspace preferences.
 */
const OptionsPanel: React.FC<OptionsPanelProps> = ({
  featureColors,
  onSetFeatureColors,
  skipClearAllConfirmation,
  onSetSkipClearAllConfirmation,
  themeKey,
  onSetThemeKey,
}) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const themeRadioRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // WAI-ARIA radiogroup keyboard model: arrows/Home/End move focus AND selection,
  // wrapping at the ends. Paired with roving tabindex (only the checked radio is
  // tabbable) so the group is a single tab stop, as role="radiogroup" advertises.
  const handleThemeKeyNav = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = THEMES.length - 1;
    let next: number;
    switch (e.key) {
      case 'ArrowRight': case 'ArrowDown': next = index === last ? 0 : index + 1; break;
      case 'ArrowLeft': case 'ArrowUp': next = index === 0 ? last : index - 1; break;
      case 'Home': next = 0; break;
      case 'End': next = last; break;
      default: return;
    }
    // Stop as well as prevent: the viewer's global window keydown handler
    // (useViewport) claims these same Arrow/Home/End keys to pan the genome, and
    // it doesn't check defaultPrevented — so without stopPropagation a theme
    // keystroke would also scroll the viewport behind the popover.
    e.preventDefault();
    e.stopPropagation();
    onSetThemeKey(THEMES[next].key);
    themeRadioRefs.current[next]?.focus();
  };

  // Restore focus to the gear when closing via keyboard/close-button so the tab
  // order continues from the trigger; click-away closes without stealing focus.
  const closeAndRestoreFocus = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const onPointerDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeAndRestoreFocus(); };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={wrapRef}>
      <button
        ref={triggerRef}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Options"
        title="Options"
        className={`w-10 h-10 flex items-center justify-center rounded-xl border transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60 ${
          open
            ? 'bg-amber-500/10 border-amber-500/40 text-amber-400'
            : 'bg-slate-800/50 border-slate-700/30 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
        }`}
      >
        <CogIcon className="w-[18px] h-[18px]" />
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Options"
          tabIndex={-1}
          className="absolute right-0 top-full mt-3 w-80 bg-slate-900/95 backdrop-blur-md border border-slate-700/60 rounded-2xl shadow-2xl z-[60] overflow-hidden focus:outline-none animate-in fade-in slide-in-from-top-2 duration-200"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
            <span className="flex items-center gap-2.5 text-[11px] font-black uppercase tracking-[0.2em] text-slate-200">
              <CogIcon className="w-4 h-4 text-amber-400" /> Options
            </span>
            <button
              onClick={closeAndRestoreFocus}
              aria-label="Close options"
              className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/60"
            >
              <i className="fas fa-xmark text-sm"></i>
            </button>
          </div>

          {/* Feature colours — global: these paint the viewport tracks and the hub rows alike */}
          <div className="px-5 py-4 border-b border-slate-800">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[9px] font-black uppercase tracking-widest text-amber-500">Feature Colors</span>
              <span className="text-[7px] font-black uppercase tracking-wider text-amber-400/80 bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-0.5">
                Global
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {FEATURE_TYPES.map(type => (
                <label
                  key={type}
                  className="flex items-center justify-between bg-black/20 px-2.5 py-1.5 rounded-lg border border-slate-800/50 cursor-pointer"
                >
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">{type}</span>
                  <input
                    type="color"
                    value={featureColors[type] || getFeatureColor(type)}
                    onChange={e => onSetFeatureColors({ ...featureColors, [type]: e.target.value })}
                    className="w-6 h-6 rounded border-none bg-transparent cursor-pointer"
                    aria-label={`${type} color`}
                  />
                </label>
              ))}
            </div>
            <button
              onClick={() => onSetFeatureColors({})}
              className="w-full mt-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-[8px] font-black uppercase tracking-widest text-slate-400 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/60"
            >
              Reset to Defaults
            </button>
          </div>

          {/* Theme — the chrome accent style (per browser) */}
          <div className="px-5 py-4 border-b border-slate-800">
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 block mb-3">Theme</span>
            <div role="radiogroup" aria-label="Chrome theme" className="grid grid-cols-2 gap-2">
              {THEMES.map((t, i) => (
                <button
                  key={t.key}
                  ref={el => { themeRadioRefs.current[i] = el; }}
                  role="radio"
                  aria-checked={themeKey === t.key}
                  tabIndex={themeKey === t.key ? 0 : -1}
                  onClick={() => onSetThemeKey(t.key)}
                  onKeyDown={e => handleThemeKeyNav(e, i)}
                  className={`text-left px-3 py-2 rounded-lg border text-[10px] font-bold uppercase tracking-tight transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60 ${
                    themeKey === t.key
                      ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
                      : 'bg-black/20 border-slate-800/50 text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Workspace preferences */}
          <div className="px-5 py-4">
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 block mb-3">Workspace</span>
            <div className="flex items-center justify-between gap-4">
              <div>
                <span className="text-[11px] font-bold text-slate-300 block">Skip Clear-All confirmation</span>
                <span className="text-[9px] text-slate-400 block mt-0.5">Wipe the workspace without the type-to-confirm prompt.</span>
              </div>
              <button
                role="switch"
                aria-checked={skipClearAllConfirmation}
                aria-label="Skip Clear-All confirmation"
                onClick={() => onSetSkipClearAllConfirmation(!skipClearAllConfirmation)}
                className={`shrink-0 w-11 h-6 rounded-full relative transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60 ${
                  skipClearAllConfirmation ? 'bg-amber-500/30' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full transition-transform ${
                    skipClearAllConfirmation ? 'translate-x-5 bg-amber-400' : 'bg-slate-400'
                  }`}
                ></span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OptionsPanel;

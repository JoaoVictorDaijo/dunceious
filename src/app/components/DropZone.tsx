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
import { carriesFiles } from '@/src/app/hooks/useFileDragActive';

type Accent = 'sky' | 'emerald' | 'amber';

/** Tailwind needs literal class names, and the drag states read the accent as an RGB triple. */
const ACCENTS: Record<Accent, { rgb: string; border: string; icon: string }> = {
  sky: { rgb: '14 165 233', border: 'hover:border-sky-500/50', icon: 'group-hover:text-sky-500' },
  emerald: { rgb: '16 185 129', border: 'hover:border-emerald-500/50', icon: 'group-hover:text-emerald-500' },
  amber: { rgb: '245 158 11', border: 'hover:border-amber-500/50', icon: 'group-hover:text-amber-500' },
};

interface DropZoneProps {
  accent: Accent;
  icon: string;
  title: string;
  hint: string;
  accept: string;
  multiple?: boolean;
  tip: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Files are being dragged somewhere over the window. */
  armed?: boolean;
  /** Locked by a running job: the input refuses files. */
  disabled?: boolean;
  /** Nothing to apply the file to yet (no records loaded). */
  unavailable?: boolean;
  /** The first, larger card of the section. */
  primary?: boolean;
  className?: string;
}

/**
 * An ingestion card. The transparent file input over it takes both clicks and
 * native drops; this component only adds the drag feedback, so dropping goes
 * through the same onChange path as picking.
 */
export default function DropZone({
  accent, icon, title, hint, accept, multiple, tip, onChange,
  armed = false, disabled = false, unavailable = false, primary = false, className = '',
}: DropZoneProps) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const live = !disabled && !unavailable;
  const colors = ACCENTS[accent];

  useEffect(() => {
    if (!armed) {
      depth.current = 0;
      setOver(false);
    }
  }, [armed]);

  const enter = (e: React.DragEvent) => {
    if (!live || !carriesFiles(e)) return;
    depth.current += 1;
    setOver(true);
  };
  const leave = (e: React.DragEvent) => {
    if (!live || !carriesFiles(e)) return;
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setOver(false);
  };
  const drop = () => {
    depth.current = 0;
    setOver(false);
  };

  const state = !live ? 'idle' : over ? 'over' : armed ? 'armed' : 'idle';

  return (
    <div
      data-drop={state}
      data-tip={tip}
      onDragEnter={enter}
      onDragLeave={leave}
      onDrop={drop}
      style={{ '--drop-rgb': colors.rgb, ...(disabled ? { opacity: 0.35 } : {}) } as React.CSSProperties}
      className={`drop-zone bg-slate-900/40 rounded-3xl ${primary ? 'p-8' : 'p-6'} border-2 border-slate-800 border-dashed ${colors.border} relative cursor-pointer text-center group ${unavailable ? 'opacity-30 pointer-events-none' : ''} ${className}`}
    >
      <input type="file" multiple={multiple} accept={accept} className="absolute inset-0 opacity-0 cursor-pointer" disabled={disabled} onChange={onChange} />
      <i className={`drop-zone-icon fas ${icon} text-slate-700 ${colors.icon} block ${primary ? 'mb-4 text-4xl' : 'mb-3 text-3xl'}`}></i>
      <p className={`${primary ? 'text-[10px]' : 'text-[9px]'} font-bold text-slate-400 uppercase group-hover:text-slate-300 tracking-tight`}>{title}</p>
      {state === 'over' ? (
        <p className="drop-zone-release text-[8px] font-bold uppercase mt-1" aria-live="polite">Release to load</p>
      ) : (
        <p className={primary ? 'text-[8px] font-medium text-slate-500 group-hover:text-slate-400 mt-1' : 'text-[8px] font-bold text-slate-500 uppercase mt-1'}>{hint}</p>
      )}
    </div>
  );
}

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


import React, { useEffect, useLayoutEffect, useId, useRef, useState } from 'react';
import type { SelectionArea, SeqRecord } from '@/src/domain/bio/types';
import ComparisonMenu, { type ComparisonMenuProps } from '@/src/app/components/ComparisonMenu';
import { chooseViewerToolbarStep, VIEWER_TOOLBAR_STEPS, type ViewerToolbarStep } from '@/src/app/logic/viewerToolbarFit';

interface Props {
  minimap: React.ReactNode;
  records?: SeqRecord[];
  activeSelection: SelectionArea | null;
  alignmentLength: number;
  comparisonMenu: Omit<ComparisonMenuProps, 'compact' | 'arrive'> | null;
  onClearSelection: () => void;
  onExportFasta: (mode?: 'original' | 'aligned') => void;
  gotoPos: string;
  setGotoPos: (value: string) => void;
  handleGoto: (position: number) => void;
  handleCenterOnSelection: () => void;
  handleZoomToSelection: () => void;
  handleFit: () => void;
  handleZoom: (direction: number) => void;
}
// Recessed fields separate navigation from raised actions; emerald marks export.
const segTrack = "flex items-stretch gap-[3px] bg-[#12203c] rounded-lg p-[3px]";
const trackShadow = { boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.45), inset 0 -1px 0 rgba(255,255,255,0.05), 0 0 0 1px rgba(0,0,0,0.2)' };
const segBtn = "px-2 py-1 rounded-md text-[10px] leading-4 font-bold uppercase bg-[#2b3f66] text-[#c3cfe8] border border-white/10 hover:bg-[#35497a] hover:text-env transition-colors";
const segIcon = "w-6 h-6 rounded-md flex items-center justify-center bg-[#2b3f66] text-[#c3cfe8] border border-white/10 hover:bg-[#35497a] hover:text-env transition-colors";
const segExport = "w-6 h-6 rounded-md flex items-center justify-center bg-[#2b3f66] text-emerald-400 border border-white/10 hover:bg-[#35497a] hover:text-emerald-300 transition-colors";
const raisedShadow = { boxShadow: '0 1px 1.5px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.08)' };
const segField = "bg-[#0f1c37] border border-white/[0.07] rounded-md";
const fieldShadow = { boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.4)' };

function SelectionExportMenu({ disabled, reason, onExport }: {
  disabled: boolean; reason?: string; onExport: Props['onExportFasta'];
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const lastOnOpen = useRef(false);
  const menuId = useId();
  const close = () => { setOpen(false); trigger.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    const choices = menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
    (lastOnOpen.current ? choices?.[choices.length - 1] : choices?.[0])?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const choose = (mode: 'aligned' | 'original') => { close(); onExport(mode); };
  return <div ref={root} className="relative" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
  }}>
    <button ref={trigger} type="button" className={segExport} style={raisedShadow}
      aria-label="Export selection as FASTA" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined}
      onClick={() => { lastOnOpen.current = false; setOpen(!open); }}
      onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault(); event.stopPropagation(); lastOnOpen.current = event.key === 'ArrowUp'; setOpen(true);
        }
      }}><i aria-hidden="true" className="fas fa-download text-[8px]" /></button>
    {open && <div ref={menu} id={menuId} role="menu" aria-label="Export selection as FASTA"
      className="absolute right-0 z-40 bg-slate-900 p-3 rounded-lg text-xs whitespace-nowrap flex flex-col gap-2"
      onKeyDown={event => {
        if (event.key === 'Escape' || event.key === 'Tab') {
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); }
          close();
        }
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault(); event.stopPropagation();
          const choices = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
          const index = choices.indexOf(document.activeElement as HTMLButtonElement);
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? choices.length - 1
            : (index + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length;
          choices[next]?.focus();
        }
      }}>
      <button type="button" role="menuitem" tabIndex={-1} disabled={disabled} data-tip={reason}
        onClick={() => choose('aligned')}>Aligned, with gaps</button>
      <button type="button" role="menuitem" tabIndex={-1}
        onClick={() => choose('original')}>Sequences only, no gaps</button>
    </div>}
  </div>;
}

function ToolbarControls({ records = [], activeSelection, alignmentLength, comparisonMenu, onClearSelection, onExportFasta,
  gotoPos, setGotoPos, handleGoto, handleCenterOnSelection, handleZoomToSelection, handleFit, handleZoom, step, measuring = false, variant = '', arrive }: Props & { step: ViewerToolbarStep; measuring?: boolean; variant?: string; arrive: boolean }) {
  const aligned = records.filter(record => record.visible !== false && record.alignedSequence !== undefined);
  const unaligned = records.filter(record => record.visible !== false && record.alignedSequence === undefined);
  const outside = Boolean(activeSelection && Math.min(activeSelection.start, activeSelection.end) >= (aligned[0]?.alignedSequence?.length ?? 0));
  return (
  <div data-toolbar-measure={measuring ? variant : undefined} className={`flex items-center gap-2 ${step.wrap && !measuring ? 'flex-wrap w-full' : 'w-max shrink-0'}`}>
    <div className={`flex items-center ${segField}`} style={fieldShadow}>
      <div className="relative flex items-center">
        <i className="fas fa-location-arrow absolute left-2 text-[10px] text-[#7c8bb0]"></i>
        <input
          type="text"
          placeholder="Go to..."
          aria-label="Go to position"
          data-tip="Type a base position and press Enter"
          className="w-24 bg-transparent pl-5 pr-2 py-1 text-[11px] font-bold text-[#e8edf7] placeholder:text-[#7c8bb0] outline-hidden focus:ring-1 focus:ring-env rounded-sm"
          value={gotoPos}
          onChange={e => setGotoPos(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              handleGoto(parseInt(gotoPos.replace(/,/g, '')));
              setGotoPos('');
            }
          }}
        />
      </div>
    </div>
    {activeSelection && (
      <>
        <div className={`${step.readout ? 'hidden md:flex' : 'hidden'} items-center gap-2 px-3 py-1.5 ${segField} border-l-2 border-l-sky-400 text-[10px] font-bold text-[#e8edf7] uppercase tracking-tight`} style={fieldShadow}>
          <i className="fas fa-vector-square text-[10px] text-sky-400/70"></i>
          <span>{activeSelection.start.toLocaleString()} - {activeSelection.end.toLocaleString()}</span>
          <span className="text-[#8ea2c9]">|</span>
          {/* For circular wrap-around selections (start > end), compute length
              as (seqLength - start) + end to avoid a negative/wrong value. */}
          <span className="text-[#8ea2c9]">{(activeSelection.start <= activeSelection.end
            ? activeSelection.end - activeSelection.start
            : (alignmentLength - activeSelection.start) + activeSelection.end
          ).toLocaleString()} bp</span>
        </div>
        <div className={segTrack} style={trackShadow}>
          <button onClick={handleCenterOnSelection} aria-label="Center" className={step.iconActions ? segIcon : segBtn} style={raisedShadow} data-tip="Scroll the selection to the middle of the view" data-tip-kbd="C">{step.iconActions ? <i aria-hidden="true" className="fas fa-crosshairs" /> : 'Center'}</button>
          <button onClick={() => handleZoomToSelection()} aria-label="Zoom Sel" className={step.iconActions ? segIcon : segBtn} style={raisedShadow} data-tip="Zoom until the selection fills the view">{step.iconActions ? <i aria-hidden="true" className="fas fa-magnifying-glass-plus" /> : 'Zoom Sel'}</button>
        </div>
        <SelectionExportMenu disabled={!aligned.length || outside}
          reason={!aligned.length ? 'No row is aligned' : outside ? 'The selection is outside the alignment' : undefined}
          onExport={onExportFasta} />
        <button onClick={onClearSelection} className={segIcon} style={raisedShadow} aria-label="Clear selection" data-tip="Clear the current selection"><i aria-hidden="true" className="fas fa-xmark text-rose-400" /></button>
      </>
    )}
    {aligned.length > 0 && unaligned.length > 0 && <span className="rounded-md border border-white/10 px-2 py-1 text-[10px] text-slate-300" data-tip={`${unaligned.map(record => record.id).join(', ')} not in the alignment; left out of conservation and saved to a separate file in gapped exports`}>{aligned.length} of {aligned.length + unaligned.length} aligned</span>}
    {comparisonMenu && <ComparisonMenu {...comparisonMenu} compact={step.compareCompact} arrive={!measuring && arrive} />}
    <button onClick={handleFit} className={segBtn} style={raisedShadow} data-tip="Zoom out to fit the whole sequence" data-tip-kbd="F">Fit</button>
    <div className={segTrack} style={trackShadow}>
      <button onClick={() => handleZoom(1)} className={segIcon} style={raisedShadow} aria-label="Zoom in" data-tip="Zoom in" data-tip-kbd="+"><i className="fas fa-plus text-[9px]"></i></button>
      <button onClick={() => handleZoom(-1)} className={segIcon} style={raisedShadow} aria-label="Zoom out" data-tip="Zoom out" data-tip-kbd="−"><i className="fas fa-minus text-[9px]"></i></button>
    </div>
  </div>
  );
}

export default function ViewerToolbar(props: Props) {
  const { minimap, activeSelection, alignmentLength, comparisonMenu } = props;
  const row = useRef<HTMLDivElement>(null);
  const measures = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(VIEWER_TOOLBAR_STEPS[0]);
  const wasComparable = useRef(comparisonMenu !== null);
  const [arrive, setArrive] = useState(false);
  useEffect(() => {
    setArrive(!wasComparable.current && comparisonMenu !== null);
    wasComparable.current = comparisonMenu !== null;
  }, [comparisonMenu !== null]);
  const selectionText = activeSelection ? `${activeSelection.start}-${activeSelection.end}` : '';
  const referenceName = comparisonMenu?.reference?.name;
  const comparisonHighlight = comparisonMenu?.settings.highlight;
  useLayoutEffect(() => {
    let cancelled = false;
    const measure = () => {
      if (cancelled || !row.current || !measures.current) return;
      const widths = [...measures.current.children].map(element => element.getBoundingClientRect().width);
      const available = row.current.getBoundingClientRect().width - 24;
      if (available <= 0 || !widths.every(width => width > 0)) return;
      setStep(chooseViewerToolbarStep({ available, minimapPreferred: 300, gap: 12,
        controls: { full: widths[0], compareCompact: widths[1], iconActions: widths[2], noReadout: widths[3] } }));
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    if (row.current) observer?.observe(row.current);
    document.fonts?.ready.then(measure);
    document.fonts?.addEventListener('loadingdone', measure);
    window.addEventListener('resize', measure);
    return () => { cancelled = true; observer?.disconnect(); document.fonts?.removeEventListener('loadingdone', measure); window.removeEventListener('resize', measure); };
  }, [selectionText, alignmentLength, comparisonMenu !== null, referenceName, comparisonHighlight]);
  return <>
    <div ref={row} data-viewer-toolbar={step.id} className={`flex-none bg-[#1b2b4d] border-b border-[#060b18] px-3 py-1 flex items-center gap-3 z-20 min-w-0 ${step.wrap ? 'flex-wrap' : ''}`} style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)' }}>
      <div className="flex flex-1" style={{ minWidth: step.wrap ? '100%' : 160 }}>{minimap}</div>
      <ToolbarControls {...props} step={step} arrive={arrive} />
    </div>
    <div ref={measures} aria-hidden="true" inert className="fixed invisible pointer-events-none -left-[10000px] top-0 w-max flex flex-col">
      {([['full', 0], ['compareCompact', 2], ['iconActions', 3], ['noReadout', 4]] as const).map(([variant, index]) => <ToolbarControls key={variant} {...props} step={VIEWER_TOOLBAR_STEPS[index]} measuring variant={variant} arrive={false} />)}
    </div>
  </>;
}

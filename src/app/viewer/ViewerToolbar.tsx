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


import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { SelectionArea } from '@/src/domain/bio/types';
import ComparisonMenu, { type ComparisonMenuProps } from '@/src/app/components/ComparisonMenu';
import { chooseViewerToolbarStep, VIEWER_TOOLBAR_STEPS, type ViewerToolbarStep } from '@/src/app/logic/viewerToolbarFit';

interface Props {
  minimap: React.ReactNode;
  activeSelection: SelectionArea | null;
  alignmentLength: number;
  comparisonMenu: Omit<ComparisonMenuProps, 'compact' | 'arrive'> | null;
  onClearSelection: () => void;
  onExportFasta: () => void;
  gotoPos: string;
  setGotoPos: (value: string) => void;
  handleGoto: (position: number) => void;
  handleCenterOnSelection: () => void;
  handleZoomToSelection: () => void;
  handleFit: () => void;
  handleZoom: (direction: number) => void;
}
export default function ViewerToolbar({ minimap, activeSelection, alignmentLength, comparisonMenu, onClearSelection, onExportFasta,
  gotoPos, setGotoPos, handleGoto, handleCenterOnSelection, handleZoomToSelection, handleFit, handleZoom }: Props) {
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
  // Segmented-inset toolbar (design direction B): two surface levels — recessed
  // track/fields vs raised segments. Session accent = interactive, emerald = export.
  const segTrack = "flex items-stretch gap-[3px] bg-[#12203c] rounded-lg p-[3px]";
  const trackShadow = { boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.45), inset 0 -1px 0 rgba(255,255,255,0.05), 0 0 0 1px rgba(0,0,0,0.2)' };
  const segBtn = "px-2 py-1 rounded-md text-[10px] leading-4 font-bold uppercase bg-[#2b3f66] text-[#c3cfe8] border border-white/10 hover:bg-[#35497a] hover:text-env transition-colors";
  const segIcon = "w-6 h-6 rounded-md flex items-center justify-center bg-[#2b3f66] text-[#c3cfe8] border border-white/10 hover:bg-[#35497a] hover:text-env transition-colors";
  const segExport = "w-6 h-6 rounded-md flex items-center justify-center bg-[#2b3f66] text-emerald-400 border border-white/10 hover:bg-[#35497a] hover:text-emerald-300 transition-colors";
  const raisedShadow = { boxShadow: '0 1px 1.5px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.08)' };
  const segField = "bg-[#0f1c37] border border-white/[0.07] rounded-md";
  const fieldShadow = { boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.4)' };


  const renderControls = (step: ViewerToolbarStep, measuring = false, variant = '') => (
        <div data-toolbar-measure={measuring ? variant : undefined} className={`flex items-center gap-2 ${step.wrap && !measuring ? 'flex-wrap w-full' : 'w-max shrink-0'}`}>
          {/* Go to — recessed field */}
          <div className={`flex items-center ${segField}`} style={fieldShadow}>
            <div className="relative flex items-center">
              <i className="fas fa-location-arrow absolute left-2 text-[10px] text-[#7c8bb0]"></i>
              <input
                type="text"
                placeholder="Go to..."
                aria-label="Go to position"
                data-tip="Type a base position and press Enter"
                className="w-24 bg-transparent pl-5 pr-2 py-1 text-[11px] font-bold text-[#e8edf7] placeholder:text-[#7c8bb0] outline-none focus:ring-1 focus:ring-env rounded"
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
              {/* Readout — twin of the Go-to field, tied to the selection by a sky left-rule */}
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
              {/* Selection actions — segmented track + emerald export */}
              <div className={segTrack} style={trackShadow}>
                <button onClick={handleCenterOnSelection} aria-label="Center" className={step.iconActions ? segIcon : segBtn} style={raisedShadow} data-tip="Scroll the selection to the middle of the view" data-tip-kbd="C">{step.iconActions ? <i aria-hidden="true" className="fas fa-crosshairs" /> : 'Center'}</button>
                <button onClick={() => handleZoomToSelection()} aria-label="Zoom sel" className={step.iconActions ? segIcon : segBtn} style={raisedShadow} data-tip="Zoom until the selection fills the view">{step.iconActions ? <i aria-hidden="true" className="fas fa-magnifying-glass-plus" /> : 'Zoom Sel'}</button>
              </div>
              <button onClick={onExportFasta} className={segExport} style={raisedShadow} aria-label="Export selection as FASTA" data-tip="Download the selected region as FASTA"><i className="fas fa-download text-[8px]"></i></button>
              <button onClick={onClearSelection} className={segIcon} style={raisedShadow} aria-label="Clear selection" data-tip="Clear the current selection"><i aria-hidden="true" className="fas fa-xmark text-rose-400" /></button>
            </>
          )}
          {comparisonMenu && <ComparisonMenu {...comparisonMenu} compact={step.compareCompact} arrive={!measuring && arrive} />}
          {/* Fit — raised segment */}
          <button onClick={handleFit} className={segBtn} style={raisedShadow} data-tip="Zoom out to fit the whole sequence" data-tip-kbd="F">Fit</button>
          {/* Zoom — segmented track */}
          <div className={segTrack} style={trackShadow}>
            <button onClick={() => handleZoom(1)} className={segIcon} style={raisedShadow} aria-label="Zoom in" data-tip="Zoom in" data-tip-kbd="+"><i className="fas fa-plus text-[9px]"></i></button>
            <button onClick={() => handleZoom(-1)} className={segIcon} style={raisedShadow} aria-label="Zoom out" data-tip="Zoom out" data-tip-kbd="−"><i className="fas fa-minus text-[9px]"></i></button>
          </div>
        </div>
  );
  return <>
    <div ref={row} data-viewer-toolbar={step.id} className={`flex-none bg-[#1b2b4d] border-b border-[#060b18] px-3 py-1 flex items-center gap-3 z-20 min-w-0 ${step.wrap ? 'flex-wrap' : ''}`} style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)' }}>
      <div className="flex flex-1" style={{ minWidth: step.wrap ? '100%' : 160 }}>{minimap}</div>
      {renderControls(step)}
    </div>
    <div ref={measures} aria-hidden="true" inert className="fixed invisible pointer-events-none -left-[10000px] top-0 w-max flex flex-col">
      {([['full', 0], ['compareCompact', 2], ['iconActions', 3], ['noReadout', 4]] as const).map(([variant, index]) => <React.Fragment key={variant}>{renderControls(VIEWER_TOOLBAR_STEPS[index], true, variant)}</React.Fragment>)}
    </div>
  </>;
}

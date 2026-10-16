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

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import GenomeViewer from '@/src/app/viewer/GenomeViewer';
import { deriveAlignmentState } from '@/src/app/logic/viewModel';
import { clearAlignConsent } from '@/src/app/logic/alignConsentPref';
import { resolveEnvAccent } from '@/src/app/logic/environment';
import { DEFAULT_THEME_KEY, getTheme, resolveThemeVars } from '@/src/app/logic/theme';
import { ExplainCallout } from './ExplainCallout';
import type { ExplainId } from './explanations';
import { usePressAnchor } from './pressAnchor';
import { RotatePrompt } from './RotatePrompt';
import { ShowroomAlignDialog, useShowroomAlignment } from './ShowroomAlign';
import { ShowroomSidebar } from './ShowroomSidebar';
import { ShowroomTopBar } from './ShowroomTopBar';
import { useLandscape } from './useLandscape';
import { useSelectDragNotice, useShowroomGuards } from './useShowroomGuards';
import { useShowroomWorkspace, type ShowroomWorkspace } from './useShowroomWorkspace';
import './showroom.css';

function FirstVisitStrip({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="absolute inset-x-2 bottom-2 z-20 flex items-center gap-3 rounded-xl border border-sky-400/70 bg-slate-900/95 py-2 pl-3 pr-1.5 shadow-xl">
      <p className="flex-1 text-[12px] leading-snug text-slate-200">This is a test drive with sample data. Tap anything to see what it does. Nothing is saved.</p>
      <button type="button" aria-label="Dismiss" onClick={onDismiss}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400">
        <i aria-hidden="true" className="fas fa-xmark" />
      </button>
    </div>
  );
}

/** The real viewer over the sample session; every callback that would do work explains instead. */
function ShowroomViewer({ workspace, explain }: { workspace: ShowroomWorkspace; explain: (id: ExplainId) => void }) {
  return (
    <GenomeViewer
      records={workspace.transposedRecords}
      consensus={workspace.consensus}
      showAnnotations={workspace.showAnnotations}
      showTracks={workspace.showTracks}
      showTranslation={workspace.showTranslation}
      showConservation={false}
      dragMode={workspace.dragMode}
      activeSelection={workspace.activeSelection}
      onSelectionChange={workspace.setActiveSelection}
      onExportFasta={() => explain('export-fasta')}
      onAddAnnotation={() => explain('add-annotation')}
      searchResults={workspace.search.results}
      currentSearchIdx={workspace.search.currentIdx}
      selectedSearchIndices={workspace.search.selected}
      jumpTo={workspace.jumpTo}
      onJumpComplete={() => workspace.setJumpTo(null)}
      onExportRecord={() => explain('export')}
      onViewDetails={() => explain('view-details')}
      isAlignmentLocked={false}
      onRemoveRecord={() => explain('remove-record')}
    />
  );
}

/** The drawer closes on Escape unless a dialog above it took the key, and gives focus back to its toggle. */
function useSidebarDrawer() {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => { setOpen(false); toggleRef.current?.focus(); }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !event.defaultPrevented) close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);
  return { open, toggleRef, close, toggle: () => (open ? close() : setOpen(true)) };
}

/**
 * A read-only test drive of the workbench for phones held sideways. Portrait
 * covers it with the rotate prompt without unmounting it, so the viewer keeps
 * its zoom and scroll and the session survives rotation; dialogs over it wait
 * for landscape. Leaving ends the alignment consent given here, so the next
 * visit asks again.
 */
export default function Showroom({ onExit }: { onExit: () => void }) {
  const workspace = useShowroomWorkspace();
  const landscape = useLandscape();
  const rootRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const sidebar = useSidebarDrawer();
  const [stripOpen, setStripOpen] = useState(true);
  const pressAnchor = usePressAnchor(rootRef);
  const { openExplain } = workspace;
  const explain = useCallback((id: ExplainId, anchor?: DOMRect) => openExplain(id, anchor ?? pressAnchor()), [openExplain, pressAnchor]);
  useShowroomGuards(rootRef, viewerRef, openExplain);
  useEffect(() => () => clearAlignConsent(), []);
  const alignment = useShowroomAlignment(workspace.records);
  useSelectDragNotice(viewerRef, workspace.dragMode === 'select', openExplain);

  const { alignmentLength, isAlignmentLoaded, sessionMoleculeType } = useMemo(() => deriveAlignmentState(workspace.records, false), [workspace.records]);
  const env = resolveEnvAccent('alignment', sessionMoleculeType);
  const themeStyle = resolveThemeVars(getTheme(DEFAULT_THEME_KEY), env) as CSSProperties;

  return (
    <div ref={rootRef} data-showroom-root="" data-env={env} style={themeStyle}
      className="app-root fixed inset-0 flex flex-col overflow-hidden bg-slate-900 font-sans text-slate-200">
      <div inert={!landscape} aria-hidden={landscape ? undefined : true} className="flex min-h-0 flex-1 flex-col">
        <ShowroomTopBar workspace={workspace} sidebarOpen={sidebar.open} onToggleSidebar={sidebar.toggle} sidebarToggleRef={sidebar.toggleRef}
          isAlignmentLoaded={isAlignmentLoaded} onExplain={explain} onExit={onExit} />
        <div className="relative flex min-h-0 flex-1">
          <ShowroomSidebar open={sidebar.open} onClose={sidebar.close} workspace={workspace}
            alignmentLength={alignmentLength} alignmentState={alignment.state} onOpenAlignment={alignment.show} onExplain={explain} />
          <main className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-slate-900 p-1">
            <div ref={viewerRef} className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-800/50 bg-white shadow-2xl">
              <ShowroomViewer workspace={workspace} explain={explain} />
            </div>
          </main>
          {stripOpen && <FirstVisitStrip onDismiss={() => setStripOpen(false)} />}
        </div>
      </div>
      {landscape ? <>
        <ShowroomAlignDialog alignment={alignment} onSubmit={() => explain('align-submit')} />
        {workspace.explain && <ExplainCallout key={workspace.explainKey} id={workspace.explain} anchor={workspace.explainAnchor} onClose={workspace.closeExplain} />}
      </> : <RotatePrompt onBack={onExit} />}
    </div>
  );
}

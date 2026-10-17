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
import HubReturnPill from '@/src/app/components/HubReturnPill';
import { UiEffectsContext } from '@/src/app/components/uiEffects';
import GenomeViewer from '@/src/app/viewer/GenomeViewer';
import { deriveAlignmentState } from '@/src/app/logic/viewModel';
import { clearAlignConsent } from '@/src/app/logic/alignConsentPref';
import { resolveEnvAccent } from '@/src/app/logic/environment';
import { DEFAULT_THEME_KEY, getTheme, resolveThemeVars } from '@/src/app/logic/theme';
import { ExplainCallout } from './ExplainCallout';
import type { ExplainId, ExplainVars } from './explanations';
import { usePressAnchor } from './pressAnchor';
import { RotatePrompt } from './RotatePrompt';
import { ShowroomAlignDialog, useShowroomAlignment } from './ShowroomAlign';
import { ShowroomDetails } from './ShowroomDetails';
import { ShowroomHub, type ShowroomExplain } from './ShowroomHub';
import { ShowroomSidebar } from './ShowroomSidebar';
import { ShowroomTopBar } from './ShowroomTopBar';
import { useLandscape } from './useLandscape';
import { useShowroomComparison } from './useShowroomComparison';
import { useProjectKeys, useSelectDragNotice, useShowroomGuards } from './useShowroomGuards';
import { useShowroomUiEffects } from './useShowroomUiEffects';
import { useShowroomView, type ShowroomView } from './useShowroomView';
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

interface ShowroomViewerProps {
  workspace: ShowroomWorkspace;
  view: ShowroomView;
  comparison: ReturnType<typeof useShowroomComparison>;
  explain: (id: ExplainId) => void;
}

/** The real viewer over the sample session; every callback that would do work explains instead. */
function ShowroomViewer({ workspace, view, comparison, explain }: ShowroomViewerProps) {
  return (
    <GenomeViewer
      records={workspace.transposedRecords}
      consensus={workspace.consensus}
      showAnnotations={workspace.showAnnotations}
      showTracks={workspace.showTracks}
      showTranslation={workspace.showTranslation}
      showConservation={workspace.showConservation}
      dragMode={workspace.dragMode}
      activeSelection={workspace.activeSelection}
      onSelectionChange={workspace.setActiveSelection}
      onClearSelection={() => workspace.setActiveSelection(null)}
      comparisonMenu={comparison.menu}
      comparison={comparison.comparison}
      onSetComparisonReference={comparison.setReference}
      onExportFasta={() => explain('export-fasta')}
      onAddAnnotation={() => explain('add-annotation')}
      completedSearch={workspace.search.completedSearch}
      searchResults={workspace.search.results}
      currentSearchIdx={workspace.search.currentIdx}
      selectedSearchIndices={workspace.search.selected}
      jumpTo={workspace.jumpTo}
      onJumpComplete={() => workspace.setJumpTo(null)}
      focusRequest={view.focusRequest}
      focusedRegion={view.focusedRegion}
      onFocusComplete={view.completeFocus}
      onExportRecord={() => explain('export')}
      onViewDetails={view.openDetails}
      isAlignmentLocked={false}
      onRemoveRecord={() => explain('remove-record')}
    />
  );
}

/** The viewport or the Hub, whichever the switcher shows, with the way back to the Hub after a Focus jump. */
function ShowroomWorkspaceArea({ workspace, view, comparison, toolsSlot, explain }: Omit<ShowroomViewerProps, 'explain'> & { toolsSlot: HTMLDivElement | null; explain: ShowroomExplain }) {
  if (view.tab === 'features') return <div data-showroom-hub="" className="flex min-h-0 min-w-0 flex-1 flex-col">
    <ShowroomHub records={workspace.records} view={view} toolsSlot={toolsSlot} explain={explain} />
  </div>;
  return <>
    {view.showHubReturn && view.hubFocus && <HubReturnPill label={view.hubFocus.label} onReturn={view.returnToHub} onDismiss={view.dismissHubReturn} />}
    <ShowroomViewer workspace={workspace} view={view} comparison={comparison} explain={explain} />
  </>;
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
 * its zoom and scroll and the session survives rotation. The workbench's dialogs
 * portal into the inert part, so their focus traps cannot take focus from the
 * prompt's Back; the showroom's own overlays wait for landscape. Leaving ends the
 * alignment consent given here, so the next visit asks again.
 */
export default function Showroom({ onExit }: { onExit: () => void }) {
  const workspace = useShowroomWorkspace();
  const view = useShowroomView(workspace.records, workspace.setActiveSelection, workspace.transposedRecords);
  const [hubToolsSlot, setHubToolsSlot] = useState<HTMLDivElement | null>(null);
  const landscape = useLandscape();
  const rootRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [portals, setPortals] = useState<HTMLDivElement | null>(null);
  const sidebar = useSidebarDrawer();
  const [stripOpen, setStripOpen] = useState(true);
  const pressAnchor = usePressAnchor(rootRef);
  const { openExplain } = workspace;
  const explain = useCallback((id: ExplainId, anchor?: DOMRect, vars?: ExplainVars) => openExplain(id, anchor ?? pressAnchor(), vars), [openExplain, pressAnchor]);
  const uiEffects = useShowroomUiEffects(explain, workspace.explain !== null, portals);
  useShowroomGuards(rootRef, workspaceRef, openExplain);
  useProjectKeys(landscape, openExplain);
  useEffect(() => () => clearAlignConsent(), []);
  const alignment = useShowroomAlignment(workspace.records);
  useSelectDragNotice(workspaceRef, workspace.dragMode === 'select' && view.tab === 'alignment', openExplain);

  const { alignmentLength, isAlignmentLoaded, sessionMoleculeType } = useMemo(() => deriveAlignmentState(workspace.records, false), [workspace.records]);
  const env = resolveEnvAccent('alignment', sessionMoleculeType);
  const themeStyle = resolveThemeVars(getTheme(DEFAULT_THEME_KEY), env) as CSSProperties;
  const comparison = useShowroomComparison(workspace.records, sessionMoleculeType === 'protein');

  return (
    <UiEffectsContext.Provider value={uiEffects}>
    <div ref={rootRef} data-showroom-root="" data-env={env} style={themeStyle}
      className="app-root fixed inset-0 flex flex-col overflow-hidden bg-slate-900 font-sans text-slate-200">
      <div inert={!landscape} aria-hidden={landscape ? undefined : true} className="flex min-h-0 flex-1 flex-col">
        <ShowroomTopBar workspace={workspace} tab={view.tab} onTabChange={view.setTab} toolsRef={setHubToolsSlot} sidebarOpen={sidebar.open} onToggleSidebar={sidebar.toggle} sidebarToggleRef={sidebar.toggleRef}
          isAlignmentLoaded={isAlignmentLoaded} onExplain={explain} onExit={onExit} />
        <div className="relative flex min-h-0 flex-1">
          <ShowroomSidebar open={sidebar.open} onClose={sidebar.close} workspace={workspace} view={view}
            alignmentLength={alignmentLength} alignmentState={alignment.state} onOpenAlignment={alignment.show} onExplain={explain} />
          <main className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-slate-900 p-1">
            <div ref={workspaceRef} className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-800/50 bg-white shadow-2xl">
              <ShowroomWorkspaceArea workspace={workspace} view={view} comparison={comparison} toolsSlot={hubToolsSlot} explain={explain} />
            </div>
          </main>
          {stripOpen && <FirstVisitStrip onDismiss={() => setStripOpen(false)} />}
        </div>
        <div ref={setPortals} data-showroom-portals="" />
      </div>
      {landscape ? <>
        <ShowroomAlignDialog alignment={alignment} onSubmit={() => explain('align-submit')} />
        <ShowroomDetails view={view} explain={explain} />
        {workspace.explain && <ExplainCallout key={workspace.explainKey} id={workspace.explain} anchor={workspace.explainAnchor} vars={workspace.explainVars} onClose={workspace.closeExplain} />}
      </> : <RotatePrompt onBack={onExit} />}
    </div>
    </UiEffectsContext.Provider>
  );
}

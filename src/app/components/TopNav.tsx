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

import React, { useState, useRef, useEffect, useLayoutEffect, useCallback, type ChangeEvent } from 'react';
import OptionsPanel from './OptionsPanel';
import { chooseTopBarStep, type TopBarMeasurements, type LayerForm, type ModeLabels, type HubForm } from '@/src/app/logic/topBarFit';

const DRAG_MODES = [
  { mode: 'pan', icon: 'fa-hand', label: 'Pan mode', tip: 'Pan: drag to scroll along the sequence' },
  { mode: 'select', icon: 'fa-vector-square', label: 'Select mode', tip: 'Select: drag to select a region' },
] as const;

export interface TopNavProps {
  toolsRef?: (element: HTMLDivElement | null) => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  activeTab: 'alignment' | 'features';
  onTabChange: (tab: 'alignment' | 'features') => void;
  featureColors: Record<string, string>;
  onSetFeatureColors: (colors: Record<string, string>) => void;
  /** Show the alignment-specific toolbar buttons (true when records are loaded in alignment view) */
  showAlignmentControls: boolean;
  dragMode: 'pan' | 'select';
  onDragModeChange: (mode: 'pan' | 'select') => void;
  showAnnotations: boolean;
  onToggleAnnotations: () => void;
  showTracks: boolean;
  onToggleTracks: () => void;
  showTranslation: boolean;
  onToggleTranslation: () => void;
  showConservation: boolean;
  onToggleConservation: () => void;
  isAlignmentLoaded: boolean;
  sessionMoleculeType: 'nucleotide' | 'protein' | null;
  /** Returns the saved file name, or null when saving was cancelled. */
  onSaveProject: () => string | null;
  onOpenProject: (event: ChangeEvent<HTMLInputElement>) => void;
  onClearWorkspace: () => void;
  sequenceCount: number;
  workspaceLocked?: boolean;
}

/**
 * Top navigation bar with app branding, tab switcher, and alignment toolbar.
 */
const TopNav: React.FC<TopNavProps> = ({
  toolsRef,
  sidebarOpen,
  onToggleSidebar,
  activeTab,
  onTabChange,
  featureColors,
  onSetFeatureColors,
  showAlignmentControls,
  dragMode,
  onDragModeChange,
  showAnnotations,
  onToggleAnnotations,
  showTracks,
  onToggleTracks,
  showTranslation,
  onToggleTranslation,
  showConservation,
  onToggleConservation,
  isAlignmentLoaded,
  sessionMoleculeType,
  onSaveProject,
  onOpenProject,
  onClearWorkspace,
  sequenceCount,
  workspaceLocked = false,
}) => {
  const [layersOpen, setLayersOpen] = useState(false);
  const nav = useRef<HTMLElement>(null);
  const measuring = useRef<HTMLDivElement>(null);
  const workspaceTools = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<ReturnType<typeof chooseTopBarStep> | null>(null);
  const setToolsElement = useCallback((element: HTMLDivElement | null) => { workspaceTools.current = element; toolsRef?.(element); }, [toolsRef]);
  const step = fit?.step;
  const inlineLayers = step ? step.layers !== 'menu' : false;
  const layerForm = step?.layers ?? 'menu';
  const modeLabels = step?.modeLabels ?? 'full';
  const slogan = step?.slogan ?? true;
  useLayoutEffect(() => {
    let cancelled = false;
    const measure = () => {
      if (cancelled || !nav.current || !measuring.current) return;
      const root = measuring.current;
      const width = (key: string) => root.querySelector<HTMLElement>(`[data-topbar-measure="${key}"]`)?.getBoundingClientRect().width ?? 0;
      if (activeTab === 'features' && workspaceTools.current) {
        for (const form of ['full', 'icon', 'narrow'] as HubForm[]) {
          const target = root.querySelector<HTMLElement>(`[data-topbar-measure="hub-${form}"]`)!;
          const clone = workspaceTools.current.cloneNode(true) as HTMLElement;
          clone.removeAttribute('aria-label');
          clone.dataset.hubTools = form;
          clone.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
          clone.querySelectorAll('[aria-label]').forEach(element => element.removeAttribute('aria-label'));
          clone.style.cssText = 'display:flex;flex:none;width:max-content';
          const search = clone.querySelector<HTMLElement>('[data-hub-search]');
          if (search) {
            search.style.cssText = `flex:none;width:${form === 'narrow' ? 140 : 200}px`;
            const input = search.querySelector('input')!;
            input.style.width = '80px';
          }
          target.replaceChildren(clone);
          if (search) {
            const input = search.querySelector('input')!;
            const others = [...search.children].filter(element => element !== input);
            const required = others.reduce((sum, element) => sum + element.getBoundingClientRect().width, 0) + 80 + 18 + 4 * others.length;
            search.style.width = `${Math.max(form === 'narrow' ? 140 : 200, required)}px`;
          }
        }
      }
      const m: TopBarMeasurements = {
        barWidth: nav.current.getBoundingClientRect().width, paddingX: 24, toolsGap: 16,
        brandWidth: { withSlogan: width('brand-full'), withoutSlogan: width('brand-plain'), toggleOnly: width('brand-toggle') },
        switcherWidth: { full: width('modes-full'), short: width('modes-short'), icon: width('modes-icon') },
        toolsWidth: {},
      };
      for (const form of ['full', 'tight', 'short', 'menu'] as LayerForm[]) m.toolsWidth[`layers-${form}`] = width(`layers-${form}`);
      for (const form of ['full', 'icon', 'narrow'] as HubForm[]) m.toolsWidth[`hub-${form}`] = width(`hub-${form}`) + 65;
      if (m.barWidth && m.brandWidth.withSlogan && m.switcherWidth.full) setFit(chooseTopBarStep(m, activeTab === 'alignment' ? 'viewport' : 'hub'));
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    if (nav.current) observer?.observe(nav.current);
    const content = typeof MutationObserver === 'undefined' ? null : new MutationObserver(measure);
    if (activeTab === 'features' && workspaceTools.current) content?.observe(workspaceTools.current, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['value', 'disabled'] });
    document.fonts?.ready.then(measure);
    document.fonts?.addEventListener('loadingdone', measure);
    window.addEventListener('resize', measure);
    return () => { cancelled = true; observer?.disconnect(); content?.disconnect(); document.fonts?.removeEventListener('loadingdone', measure); window.removeEventListener('resize', measure); };
  }, [activeTab, showAlignmentControls, sessionMoleculeType, isAlignmentLoaded, showAnnotations, showTracks, showTranslation, showConservation]);
  const layersElement = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!layersOpen) return;
    const outside = (event: PointerEvent) => { if (!layersElement.current?.contains(event.target as Node)) setLayersOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [layersOpen]);
  const layers = [
    { label: 'Annotations', on: showAnnotations, onToggle: onToggleAnnotations, dot: 'bg-sky-400 text-sky-400',
      tip: 'the annotation lanes above each sequence' },
    { label: 'Tracks', on: showTracks, onToggle: onToggleTracks, dot: 'bg-indigo-400 text-indigo-400',
      tip: 'imported quantitative data tracks' },
    { label: 'Translation', on: showTranslation, onToggle: onToggleTranslation, dot: 'bg-emerald-400 text-emerald-400',
      tip: 'the amino-acid translation of CDS features, forward strand above the bases and reverse below',
      disabledReason: sessionMoleculeType === 'protein' ? 'Translation does not apply to a peptide session' : undefined },
    { label: 'Conservation', on: showConservation, onToggle: onToggleConservation, dot: 'bg-amber-400 text-amber-400',
      tip: 'the per-column conservation heatmap',
      disabledReason: isAlignmentLoaded ? undefined : 'Conservation needs an alignment: upload a pre-aligned FASTA first' },
  ];

  const renderBrand = (showSlogan: boolean, wordmark = true) => (
    <div data-topbar-brand className="flex shrink-0 items-center gap-6 whitespace-nowrap">
      <button
        onClick={onToggleSidebar}
        aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
        data-tip={sidebarOpen ? 'Hide the sidebar to widen the workspace' : 'Show the sidebar (records, navigation, search)'}
        className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-800/50 hover:bg-slate-700 hover:text-slate-200 text-slate-400 transition-all motion-reduce:transition-none border border-slate-700/30 focus:outline-hidden focus-visible:ring-2 focus-visible:ring-slate-500/60"
      >
        <i className={`fas ${sidebarOpen ? 'fa-arrow-left-long' : 'fa-bars-staggered'}`}></i>
      </button>
      {wordmark && <div className="flex flex-col">
        <div className="flex items-center gap-3">
          {/* Indented past the slogan on purpose: the original offset is part of the wordmark. */}
          <span className="ml-3 text-xl font-black tracking-wide uppercase italic text-white">Dunceious</span>
        </div>
        {showSlogan && <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-400 italic leading-none mt-1">
          Because geniality is overpriced.
        </span>}
      </div>}
    </div>
  );
  const renderSwitcher = (labels: ModeLabels) => (
      <div role="group" aria-label="Workspace" className="flex bg-slate-950 p-1 rounded-2xl border border-slate-800 shadow-xl gap-1">
        <button
          onClick={() => onTabChange('alignment')}
          aria-label="Visual Viewport"
          aria-pressed={activeTab === 'alignment'}
          data-tip="Visual Viewport: browse the sequences, annotations and data tracks"
          className={`group flex items-center gap-2.5 ${labels === 'icon' ? 'px-2' : 'pl-2 pr-4'} py-1.5 rounded-xl transition-all motion-reduce:transition-none focus:outline-hidden focus-visible:ring-2 focus-visible:ring-env/60 ${activeTab === 'alignment' ? 'bg-env-strong shadow-lg' : 'hover:bg-slate-800/50'}`}
        >
          <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs transition-all motion-reduce:transition-none ${activeTab === 'alignment' ? 'bg-white/15 text-white' : 'bg-slate-800 text-slate-400 group-hover:text-slate-300'}`}>
            <i className="fas fa-crosshairs"></i>
          </span>
          {labels !== 'icon' && <span className={`text-[11px] font-bold uppercase tracking-wide ${activeTab === 'alignment' ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'}`}>{labels === 'short' ? 'Viewport' : 'Visual Viewport'}</span>}
        </button>
        <button
          onClick={() => onTabChange('features')}
          aria-label="Annotation Hub"
          aria-pressed={activeTab === 'features'}
          data-tip="Annotation Hub: list, edit, export and jump to every annotation"
          className={`group flex items-center gap-2.5 ${labels === 'icon' ? 'px-2' : 'pl-2 pr-4'} py-1.5 rounded-xl transition-all motion-reduce:transition-none focus:outline-hidden focus-visible:ring-2 focus-visible:ring-env/60 ${activeTab === 'features' ? 'bg-env shadow-lg' : 'hover:bg-slate-800/50'}`}
        >
          <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs transition-all motion-reduce:transition-none ${activeTab === 'features' ? 'bg-slate-950/15 text-slate-950' : 'bg-slate-800 text-slate-400 group-hover:text-slate-300'}`}>
            <i className="fas fa-table-list"></i>
          </span>
          {labels !== 'icon' && <span className={`text-[11px] font-bold uppercase tracking-wide ${activeTab === 'features' ? 'text-slate-950' : 'text-slate-400 group-hover:text-slate-200'}`}>{labels === 'short' ? 'Hub' : 'Annotation Hub'}</span>}
        </button>
      </div>
  );
  const renderDrag = () => (
          <div className="flex shrink-0 bg-slate-950 p-1 rounded-xl border border-slate-800" role="group" aria-label="Drag mode">
            {DRAG_MODES.map(m => (
              <button
                key={m.mode}
                onClick={() => onDragModeChange(m.mode)}
                aria-pressed={dragMode === m.mode}
                aria-label={m.label}
                data-tip={m.tip}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all motion-reduce:transition-none focus:outline-hidden focus-visible:ring-2 focus-visible:ring-env/60 ${dragMode === m.mode ? 'bg-white text-env-strong shadow-lg' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/70'}`}
              >
                <i className={`fas ${m.icon}`}></i>
              </button>
            ))}
          </div>
  );
  const renderTray = (form: LayerForm) => (
          <div className="flex w-max shrink-0 bg-slate-950 p-1 rounded-xl border border-slate-800 gap-1" role="group" aria-label="Viewport layers">
            {layers.map(l => (
              <button
                key={l.label}
                aria-label={l.label}
                onClick={() => { if (!l.disabledReason) l.onToggle(); }}
                aria-pressed={l.on}
                aria-disabled={l.disabledReason ? true : undefined}
                data-tip={l.disabledReason ?? `${l.on ? 'Hide' : 'Show'} ${l.tip}`}
                className={`h-8 flex items-center ${form === 'full' ? 'gap-1.5 px-2 tracking-wider' : 'gap-[5px] px-1.5 tracking-[0.03em]'} rounded-lg text-[10px] font-bold uppercase transition-all motion-reduce:transition-none focus:outline-hidden focus-visible:ring-2 focus-visible:ring-env/60 ${
                  l.disabledReason
                    ? 'text-slate-500 cursor-not-allowed'
                    : l.on
                      ? 'bg-slate-800 text-slate-100 shadow-inner'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full transition-all motion-reduce:transition-none ${l.on && !l.disabledReason ? l.dot : 'bg-slate-600'}`}
                  style={l.on && !l.disabledReason ? { boxShadow: '0 0 6px currentColor' } : undefined}
                  aria-hidden="true"
                ></span>
                {form === 'short' ? ({ Annotations: 'Annot', Tracks: 'Tracks', Translation: 'Transl', Conservation: 'Conserv' }[l.label]) : l.label}
              </button>
            ))}
          </div>
  );
  const renderMenu = () => (
          <div ref={layersElement} className="relative shrink-0">
            <button aria-label={`Layers ${layers.filter(layer => layer.on).length}/4`} aria-expanded={layersOpen} data-tip="Choose viewport layers" onClick={() => setLayersOpen(open => !open)} className="h-10 flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950 px-3 text-xs text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500">
              Layers {layers.filter(layer => layer.on).length}/4
              <span className="flex gap-1" aria-hidden="true">{layers.map(layer => <span key={layer.label} className={`h-1.5 w-1.5 rounded-full ${layer.on && !layer.disabledReason ? layer.dot : 'bg-slate-600'}`} />)}</span>
            </button>
            {layersOpen && <div role="group" aria-label="Layer options" onKeyDown={event => { if (event.key === 'Escape') { setLayersOpen(false); event.currentTarget.parentElement?.querySelector('button')?.focus(); } }} className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-slate-800 bg-slate-950 p-2 shadow-xl">
              {layers.map(layer => <div key={layer.label}><button aria-pressed={layer.on} aria-disabled={Boolean(layer.disabledReason)} data-tip={layer.disabledReason ?? layer.tip} onClick={() => { if (!layer.disabledReason) layer.onToggle(); }} className="flex w-full items-center gap-2 rounded-lg p-2 text-left text-xs text-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500"><span className={`h-1.5 w-1.5 rounded-full ${layer.on ? layer.dot : 'bg-slate-600'}`} />{layer.label}</button>{layer.disabledReason && <p className="px-2 pb-2 text-xs text-slate-400">{layer.disabledReason}</p>}</div>)}
            </div>}
          </div>
  );
  return <>
    <nav ref={nav} data-fit-step={step?.id} data-fit={fit?.fits} className="app-nav relative h-16 border-b border-slate-800/80 bg-slate-900 shrink-0 z-50">
      <div className="relative z-[1] h-full flex items-center px-6">
        {renderBrand(slogan, step?.id !== 'no-wordmark')}
        <div data-workspace-switcher style={{ position: 'absolute', left: fit ? fit.switcherLeft : '50%', transform: fit ? undefined : 'translateX(-50%)', width: 'max-content' }}>{renderSwitcher(modeLabels)}</div>
        <div aria-label="Workspace tools and options" className="ml-auto flex shrink-0 items-center justify-end gap-2 whitespace-nowrap">
          <div ref={setToolsElement} data-hub-tools={step?.hub ?? 'full'} aria-label="Workspace tools" data-hub-focus={activeTab === 'features' ? true : undefined} className="flex min-w-0 items-center justify-end gap-2">
            {showAlignmentControls && <>{renderDrag()}{inlineLayers ? renderTray(layerForm) : renderMenu()}</>}
          </div>
          {(showAlignmentControls || activeTab === 'features') && <span aria-hidden="true" className="mx-1 h-6 w-px shrink-0 bg-slate-700" />}
          <OptionsPanel featureColors={featureColors} onSetFeatureColors={onSetFeatureColors}
            onSaveProject={onSaveProject} onOpenProject={onOpenProject} onClearWorkspace={onClearWorkspace} sequenceCount={sequenceCount} locked={workspaceLocked} />
        </div>
      </div>
    </nav>
    <div ref={measuring} aria-hidden="true" inert className="fixed invisible pointer-events-none -left-[10000px] top-0 flex w-max flex-col">
      <div data-topbar-measure="brand-full" className="w-max">{renderBrand(true)}</div>
      <div data-topbar-measure="brand-toggle" className="w-max">{renderBrand(false, false)}</div>
      <div data-topbar-measure="brand-plain" className="w-max">{renderBrand(false)}</div>
      {(['full', 'short', 'icon'] as ModeLabels[]).map(labels => <div key={labels} data-topbar-measure={`modes-${labels}`} className="w-max">{renderSwitcher(labels)}</div>)}
      {(['full', 'tight', 'short', 'menu'] as LayerForm[]).map(form => <div key={form} data-topbar-measure={`layers-${form}`} className="flex w-max items-center gap-2 whitespace-nowrap">
        {showAlignmentControls && <>{renderDrag()}{form === 'menu' ? <button className="h-10 flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950 px-3 text-xs">Layers {layers.filter(layer => layer.on).length}/4<span className="flex gap-1">{layers.map(layer => <span key={layer.label} className="h-1.5 w-1.5" />)}</span></button> : renderTray(form)}</>}
        {(showAlignmentControls || activeTab === 'features') && <span className="mx-1 h-6 w-px shrink-0" />}<div className="w-10 h-10" />
      </div>)}
      {(['full', 'icon', 'narrow'] as HubForm[]).map(form => <div key={form} data-topbar-measure={`hub-${form}`} className="w-max" />)}
    </div>
  </>;
};

export default TopNav;

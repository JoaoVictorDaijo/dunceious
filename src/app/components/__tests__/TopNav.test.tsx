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

// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within, act } from '@/src/app/testing/renderHarness';
import TopNav, { type TopNavProps } from '../TopNav';
import HubToolbar from '../hub/HubToolbar';
import ImportMenu from '../hub/ImportMenu';
import { useHubState } from '@/src/app/hooks/useHubState';
import { createPortal } from 'react-dom';
const noop = () => {};
const defaults: TopNavProps = { sidebarOpen: true, onToggleSidebar: noop, activeTab: 'alignment', onTabChange: noop, featureColors: {}, onSetFeatureColors: noop, themeKey: 'clean', onSetThemeKey: noop, showAlignmentControls: true, dragMode: 'select', onDragModeChange: noop, showAnnotations: true, onToggleAnnotations: noop, showTracks: true, onToggleTracks: noop, showTranslation: true, onToggleTranslation: noop, showConservation: false, onToggleConservation: noop, isAlignmentLoaded: false, sessionMoleculeType: 'nucleotide', onSaveProject: () => null, onOpenProject: noop, onClearWorkspace: noop, sequenceCount: 0 };
function Subject() {
  const [mode, setMode] = useState<'alignment' | 'features'>('alignment');
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  const state = useHubState();
  return <><TopNav {...defaults} activeTab={mode} onTabChange={setMode} showAlignmentControls={mode === 'alignment'} toolsRef={setSlot} />{mode === 'features' && slot && createPortal(<HubToolbar state={state} matchIndex={-1} matchCount={0} onNavigate={noop} onExport={noop} imports={<ImportMenu state={state} onFileUpload={noop} onAlignmentUpload={noop} onAnnotationUpload={noop} onProjectUpload={noop} />} />, slot)}</>;
}
describe('workspace header', () => {
  it('keeps the same centred switcher and swaps only the tools', () => {
    barWidth = 1920;
    render(<Subject />);
    const switcher = screen.getByRole('group', { name: 'Workspace' });
    // The measured switcher bounds keep workspace tools from overlapping navigation.
    const bounds = document.querySelector<HTMLElement>('[data-workspace-switcher]')!;
    expect(bounds.style.left).toBe('788px');
    expect(bounds.style.width).toBe('max-content');
    const viewport = within(switcher).getByRole('button', { name: 'Visual Viewport' });
    expect(viewport.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('group', { name: 'Drag mode' })).toBeTruthy();
    fireEvent.click(within(switcher).getByRole('button', { name: 'Annotation Hub' }));
    expect(screen.getByRole('group', { name: 'Workspace' })).toBe(switcher);
    expect(within(switcher).getAllByRole('button')).toHaveLength(2);
    expect(viewport.getAttribute('aria-pressed')).toBe('false');
    expect(within(switcher).getByRole('button', { name: 'Annotation Hub' }).getAttribute('aria-pressed')).toBe('true');
    const tools = screen.getByLabelText('Workspace tools');
    expect(within(tools).getByRole('searchbox', { name: 'Search annotations' })).toBeTruthy();
    for (const name of ['Import', 'Export…']) expect(within(tools).getByRole('button', { name })).toBeTruthy();
    expect(within(tools).queryByRole('button', { name: 'Add annotation' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Drag mode' })).toBeNull();
  });
  it('keeps contextual comparison out of the top bar', () => {
    render(<TopNav {...defaults} isAlignmentLoaded />);
    expect(screen.queryByRole('button', { name: 'Compare to reference' })).toBeNull();
  });
  it('toggles layers in the popover and explains unavailable layers', () => {
    const toggle = vi.fn(); render(<TopNav {...defaults} sessionMoleculeType="protein" onToggleTracks={toggle} />);
    fireEvent.click(screen.getByRole('button', { name: /^Layers/ }));
    const popover = screen.getByRole('group', { name: 'Layer options' });
    fireEvent.click(within(popover).getByRole('button', { name: 'Tracks' }));
    expect(toggle).toHaveBeenCalledOnce();
    expect(within(popover).getByText('Translation does not apply to a peptide session')).toBeTruthy();
    expect(within(popover).getByText(/Conservation needs an alignment/)).toBeTruthy();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('group', { name: 'Layer options' })).toBeNull();
  });
});


let barWidth = 900;
let fontScale = 1;
let resized = () => {};
const observed: Element[] = [];
beforeEach(() => {
  barWidth = 900; fontScale = 1; observed.length = 0;
  vi.stubGlobal('ResizeObserver', class { constructor(callback: () => void) { resized = callback; } observe(element: Element) { observed.push(element); } disconnect() {} });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
    const key = this.getAttribute('data-topbar-measure');
    const widths: Record<string, number> = { 'brand-full': 345, 'brand-plain': 221, 'brand-toggle': 40, 'modes-full': 344, 'modes-short': 250, 'modes-icon': 100,
      'layers-full': 557, 'layers-tight': 540, 'layers-short': 470, 'layers-menu': 270, 'hub-full': 450, 'hub-icon': 350, 'hub-narrow': 290 };
    const width = this.tagName === 'NAV' ? barWidth : key ? (widths[key] ?? 0) * fontScale : 0;
    return { width, height: 64, left: 0, right: width, top: 0, bottom: 64 } as DOMRect;
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('fixed compression order', () => {
  it('centres the switcher at 1920 and shows the slogan', () => {
    barWidth = 1920; render(<TopNav {...defaults} />);
    expect(document.querySelector<HTMLElement>('[data-workspace-switcher]')!.style.left).toBe('788px');
    expect(within(screen.getByRole('navigation')).getByText('Because geniality is overpriced.')).toBeTruthy();
    expect(screen.getByRole('navigation').getAttribute('data-fit-step')).toBe('centred');
  });
  it('uses short layer names at 1040 and keeps accessible names and tooltips', () => {
    barWidth = 1040; render(<TopNav {...defaults} />);
    const annot = screen.getByRole('button', { name: 'Annotations' });
    expect(annot.textContent).toBe('Annot');
    expect(annot.getAttribute('data-tip')).toBe('Hide the annotation lanes above each sequence');
    expect(screen.getByRole('button', { name: 'Translation' }).textContent).toBe('Transl');
  });
  it('keeps the layer popover at 900', () => {
    render(<TopNav {...defaults} />);
    fireEvent.click(screen.getByRole('button', { name: /^Layers/ }));
    expect(screen.getByRole('group', { name: 'Layer options' })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('group', { name: 'Layer options' }), { key: 'Escape' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /^Layers/ }));
  });
  it('uses icon-only modes at 700 and keeps their full accessible names', () => {
    barWidth = 700; render(<TopNav {...defaults} />);
    expect(screen.getByRole('button', { name: 'Visual Viewport' }).textContent).toBe('');
    expect(screen.getByRole('button', { name: 'Annotation Hub' }).textContent).toBe('');
  });
  it('has no selection input that could change its fit', () => {
    barWidth = 1040;
    const view = render(<TopNav {...defaults} />);
    const step = screen.getByRole('navigation').getAttribute('data-fit-step');
    view.rerender(<TopNav {...defaults} />);
    expect(screen.getByRole('navigation').getAttribute('data-fit-step')).toBe(step);
  });
  it('remeasures when fonts become ready and on loadingdone', async () => {
    barWidth = 1440;
    let ready!: () => void;
    const fonts = new EventTarget();
    Object.assign(fonts, { ready: new Promise<void>(resolve => { ready = resolve; }) });
    vi.stubGlobal('document', document);
    Object.defineProperty(document, 'fonts', { configurable: true, value: fonts });
    render(<TopNav {...defaults} />);
    expect(screen.getByRole('navigation').getAttribute('data-fit-step')).toBe('slide');
    fontScale = 0.7;
    await act(async () => { ready(); });
    expect(screen.getByRole('navigation').getAttribute('data-fit-step')).toBe('centred');
    fontScale = 1;
    act(() => fonts.dispatchEvent(new Event('loadingdone')));
    expect(screen.getByRole('navigation').getAttribute('data-fit-step')).toBe('slide');
    Reflect.deleteProperty(document, 'fonts');
  });
  it('observes only the nav and never mutates its size while measuring', () => {
    barWidth = 1920; render(<TopNav {...defaults} />);
    const nav = screen.getByRole('navigation');
    expect(observed).toEqual([nav]);
    const style = nav.getAttribute('style');
    barWidth = 900; act(resized);
    expect(nav.getAttribute('style')).toBe(style);
    expect(nav.getAttribute('data-fit-step')).toBe('layers-menu');
    barWidth = 1920; act(resized);
    expect(nav.getAttribute('data-fit-step')).toBe('centred');
    expect(observed).toEqual([nav]);
  });
  it.each(['alignment', 'features'] as const)('keeps the cog past the mode tools in %s mode', tab => {
    render(<TopNav {...defaults} activeTab={tab} showAlignmentControls={tab === 'alignment'} />);
    const cluster = screen.getByLabelText('Workspace tools and options');
    const options = within(cluster).getByRole('button', { name: 'Project and options' });
    const tools = within(cluster).getByLabelText('Workspace tools');
    expect(tools.compareDocumentPosition(options) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(cluster.querySelector('span[aria-hidden="true"].w-px')).not.toBeNull();
  });
});

it('hides only the wordmark at the last Hub step with a wide counter', () => {
  barWidth = 680;
  // Larger content metrics force the last step while the sidebar toggle still fits.
  fontScale = 1.4;
  render(<TopNav {...defaults} activeTab="features" showAlignmentControls={false} />);
  expect(screen.getByRole('navigation').getAttribute('data-fit-step')).toBe('no-wordmark');
  expect(within(screen.getByRole('navigation')).queryByText('Dunceious')).toBeNull();
  expect(screen.getByRole('button', { name: 'Hide sidebar' })).toBeTruthy();
});

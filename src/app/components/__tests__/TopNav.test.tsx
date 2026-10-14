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
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within, act } from '@/src/app/testing/renderHarness';
import TopNav, { type TopNavProps } from '../TopNav';
import HubToolbar from '../hub/HubToolbar';
import MoreMenu from '../hub/MoreMenu';
import { useHubState } from '@/src/app/hooks/useHubState';
import { createPortal } from 'react-dom';
const noop = () => {};
const defaults: TopNavProps = { sidebarOpen: true, onToggleSidebar: noop, activeTab: 'alignment', onTabChange: noop, featureColors: {}, onSetFeatureColors: noop, themeKey: 'clean', onSetThemeKey: noop, showAlignmentControls: true, dragMode: 'select', onDragModeChange: noop, activeSelection: null, onClearSelection: noop, showAnnotations: true, onToggleAnnotations: noop, showTracks: true, onToggleTracks: noop, showTranslation: true, onToggleTranslation: noop, showConservation: false, onToggleConservation: noop, isAlignmentLoaded: false, sessionMoleculeType: 'nucleotide' };
function Subject() {
  const [mode, setMode] = useState<'alignment' | 'features'>('alignment');
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  const state = useHubState();
  return <><TopNav {...defaults} activeTab={mode} onTabChange={setMode} showAlignmentControls={mode === 'alignment'} toolsRef={setSlot} />{mode === 'features' && slot && createPortal(<HubToolbar state={state} matchIndex={-1} matchCount={0} onNavigate={noop} onAdd={noop} onExport={noop} more={<MoreMenu state={state} onSave={noop} onClear={noop} onFileUpload={noop} onAlignmentUpload={noop} onAnnotationUpload={noop} onProjectUpload={noop} />} />, slot)}</>;
}
describe('workspace header', () => {
  it('keeps the same centred switcher and swaps only the tools', () => {
    render(<Subject />);
    const switcher = screen.getByRole('group', { name: 'Workspace' });
    expect(switcher.parentElement?.style.left).toBe('50%');
    expect(switcher.parentElement?.style.transform).toBe('translateX(-50%)');
    const structure = switcher.innerHTML.replaceAll('true', 'false');
    expect(screen.getByRole('group', { name: 'Drag mode' })).toBeTruthy();
    fireEvent.click(within(switcher).getByRole('button', { name: 'Annotation Hub' }));
    expect(screen.getByRole('group', { name: 'Workspace' })).toBe(switcher);
    expect(switcher.children.length).toBe(2);
    expect(structure.includes('Visual Viewport')).toBe(true);
    const tools = screen.getByLabelText('Workspace tools');
    expect(within(tools).getByRole('searchbox', { name: 'Search annotations' })).toBeTruthy();
    for (const name of ['Add annotation', 'Export…', 'More workspace actions']) expect(within(tools).getByRole('button', { name })).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Drag mode' })).toBeNull();
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

describe('layer tray fit', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  it('rechecks natural tray width on resize and selection changes', () => {
    let available = 480;
    let resized = () => {};
    vi.stubGlobal('ResizeObserver', class { constructor(callback: () => void) { resized = callback; } observe() {} disconnect() {} });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      const label = this.getAttribute('aria-label');
      const width = label === 'Workspace tools' ? available : label === 'Viewport layers' ? 360 : label === 'Drag mode' ? 80 : this.textContent?.trim() === 'Clear' ? 80 : 600;
      return { left: 0, right: width, top: 0, bottom: 40, width, height: 40 } as DOMRect;
    });
    const { rerender } = render(<TopNav {...defaults} />);
    expect(screen.getByRole('group', { name: 'Viewport layers' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Layers/ })).toBeNull();
    rerender(<TopNav {...defaults} activeSelection={{ start: 0, end: 10, recordIds: ['a'] }} />);
    expect(screen.getByRole('button', { name: /^Layers/ })).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Viewport layers' })).toBeNull();
    rerender(<TopNav {...defaults} />);
    expect(screen.getByRole('group', { name: 'Viewport layers' })).toBeTruthy();
    available = 400; act(resized);
    expect(screen.getByRole('button', { name: /^Layers/ })).toBeTruthy();
    available = 600; act(resized);
    expect(screen.getByRole('group', { name: 'Viewport layers' })).toBeTruthy();
  });
});

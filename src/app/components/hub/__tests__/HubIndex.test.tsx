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
import { useEffect } from 'react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@/src/app/testing/renderHarness';
import { useHubState } from '@/src/app/hooks/useHubState';
import HubIndex from '../HubIndex';
import type { SeqRecord } from '@/src/domain/bio/types';
const records: SeqRecord[] = ['a', 'b', 'c'].map((id, i) => ({ id, name: id, sequence: 'AAAA', features: i < 2 ? [{ type: 'gene', name: 'spike', start: 0, end: 2, strand: 1 }, { type: 'source', name: 'source', start: 0, end: 4, strand: 1, metadata: { organism: 'MERS-CoV', host: 'camel', geo_loc_name: 'Oman:Muscat' } }] : [] }));
function Subject({ toggle = () => {}, features = false }: { toggle?: (id: string) => void; features?: boolean }) {
  const state = useHubState();
  useEffect(() => { if (features) state.setTab('features'); }, [features]);
  return <HubIndex records={records} state={state} onToggleRecordVisibility={toggle} />;
}
describe('HubIndex', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  it('lists each record once and routes the visibility eye', () => {
    const toggle = vi.fn(); render(<Subject toggle={toggle} />);
    expect(screen.getAllByRole('button', { name: /^Jump to sequence/ })).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Hide a in viewport' }));
    expect(toggle).toHaveBeenCalledWith('a');
  });
  it('reveals only the current entry and refreshes container size on resize', () => {
    let resize = () => {};
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { resize = callback; }
      observe() {}
      disconnect() {}
    });
    function ScrollSubject() {
      const state = useHubState();
      return <><button onClick={() => state.setCurrentSectionKey('b')}>Track b</button>
        <HubIndex records={records} state={state} onToggleRecordVisibility={() => {}} /></>;
    }
    render(<ScrollSubject />);
    const container = screen.getByLabelText('Index entries');
    const active = screen.getByRole('button', { name: 'Jump to sequence b' });
    Object.defineProperties(container, { clientHeight: { get: () => 100, configurable: true }, offsetTop: { get: () => 40, configurable: true } });
    Object.defineProperties(active, { offsetTop: { get: () => 240, configurable: true }, offsetHeight: { get: () => 30, configurable: true }, offsetParent: { value: container } });
    resize();
    const untouched = screen.getByRole('button', { name: 'Jump to sequence a' });
    Object.defineProperty(untouched, 'offsetTop', { configurable: true, get: () => 0 });
    const untouchedTop = vi.spyOn(untouched, 'offsetTop', 'get');
    const offsetTop = vi.spyOn(active, 'offsetTop', 'get');
    const offsetHeight = vi.spyOn(active, 'offsetHeight', 'get');
    const containerHeight = vi.spyOn(container, 'clientHeight', 'get');
    const containerBounds = vi.spyOn(container, 'getBoundingClientRect');
    const activeBounds = vi.spyOn(active, 'getBoundingClientRect');
    fireEvent.click(screen.getByRole('button', { name: 'Track b' }));
    expect(active.getAttribute('aria-current')).toBe('true');
    expect(container.scrollTop).toBe(170);
    expect(containerBounds).not.toHaveBeenCalled();
    expect(activeBounds).not.toHaveBeenCalled();
    expect(offsetTop).toHaveBeenCalledTimes(1);
    expect(offsetHeight).toHaveBeenCalledTimes(1);
    expect(untouchedTop).not.toHaveBeenCalled();
    expect(containerHeight).not.toHaveBeenCalled();
    offsetTop.mockReturnValue(400);
    resize();
    expect(container.scrollTop).toBe(330);
    containerBounds.mockRestore();
    activeBounds.mockRestore();
  });
  it('does not measure every index entry after an annotation filter changes', () => {
    function FilterSubject() {
      const state = useHubState();
      return <><button onClick={() => state.setFilters(previous => ({ ...previous, query: 'spike' }))}>Filter annotations</button>
        <HubIndex records={records} state={state} onToggleRecordVisibility={() => {}} /></>;
    }
    render(<FilterSubject />);
    const entries = screen.getAllByRole('button', { name: /^Jump to sequence/ });
    const reads = entries.map(entry => {
      Object.defineProperty(entry, 'offsetTop', { configurable: true, get: () => 0 });
      return vi.spyOn(entry, 'offsetTop', 'get');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Filter annotations' }));
    expect(screen.getAllByRole('button', { name: /^Jump to sequence/ })).toHaveLength(2);
    reads.forEach(read => expect(read).not.toHaveBeenCalled());
  });
  it('does not recompute untouched entries when scroll spy changes the current sequence', () => {
    const definition = vi.fn(() => 'Unchanged isolate');
    const untouched = { ...records[2] };
    Object.defineProperty(untouched, 'definition', { get: definition });
    const stableRecords = [records[0], records[1], untouched];
    const toggle = () => {};
    function MemoSubject() {
      const state = useHubState();
      return <><button onClick={() => state.setCurrentSectionKey('b')}>Track next</button>
        <HubIndex records={stableRecords} state={state} onToggleRecordVisibility={toggle} /></>;
    }
    render(<MemoSubject />);
    definition.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Track next' }));
    expect(screen.getByRole('button', { name: 'Jump to sequence b' }).getAttribute('aria-current')).toBe('true');
    expect(screen.getByText('Unchanged isolate')).toBeTruthy();
    expect(definition).not.toHaveBeenCalled();
  });
  it('indexes Features under organism headings with a sequence limit', () => {
    render(<Subject features />);
    expect(screen.getByLabelText('Limit to sequences')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Fold index group MERS-CoV' }).textContent).toBe('MERS-CoV · 1');
    expect(screen.getByRole('button', { name: 'spike · in 2 of 2' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Jump to sequence/ })).toBeNull();
  });
  it('groups by host with missing values last and previews the loaded data', () => {
    render(<Subject />); fireEvent.click(screen.getByRole('button', { name: 'Grouped' }));
    fireEvent.click(screen.getByRole('button', { name: /by Organism/ }));
    const menu = screen.getByRole('menu');
    expect(within(menu).getByText('Location · 1 groups · 1 not specified')).toBeTruthy();
    expect(within(menu).getByRole('menuitem', { name: /Collection year.*No data in these files/ }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Host ·/ }));
    expect(screen.getAllByRole('button', { name: /^Fold index group/ }).map(el => el.textContent)).toEqual(['camel · 2', 'Not specified · 1']);
  });
});

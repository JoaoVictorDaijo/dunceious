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
import { createHub1000x10 } from '@/src/app/testing/fixtures/hub1000x10';
import type { SeqRecord } from '@/src/domain/bio/types';
const records: SeqRecord[] = ['a', 'b', 'c'].map((id, i) => ({ id, name: id, sequence: 'AAAA', fileDetails: i < 2 ? { organism: 'MERS-CoV', host: 'camel', location: 'Oman:Muscat' } : {}, features: i < 2 ? [{ type: 'gene', name: 'spike', start: 0, end: 2, strand: 1 }, { type: 'source', name: 'source', start: 0, end: 4, strand: 1, metadata: { organism: 'MERS-CoV', host: 'camel', geo_loc_name: 'Oman:Muscat' } }] : [] }));
function Subject({ features = false }: { features?: boolean }) {
  const state = useHubState();
  useEffect(() => { if (features) state.setTab('features'); }, [features]);
  return <HubIndex records={records} state={state} />;
}
describe('HubIndex', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  it('lists each record once and routes the visibility eye', () => {
    render(<Subject />);
    expect(screen.getAllByRole('button', { name: /^Jump to sequence/ })).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: 'Hide a in hub' }));
    expect(screen.getByRole('button', { name: 'Show a in hub' })).toBeTruthy();
  });
  it('reveals a far current card through the windowed list without DOM measurements', () => {
    const many = createHub1000x10();
    function ScrollSubject() {
      const state = useHubState();
      return <><button onClick={() => state.setCurrentSectionKey('index1000')}>Track last</button><HubIndex records={many} state={state} /></>;
    }
    const { container } = render(<ScrollSubject />);
    expect(container.querySelectorAll('[data-index-card]').length).toBeLessThan(40);
    expect(screen.queryByRole('button', { name: 'Jump to sequence index1000' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Track last' }));
    const last = screen.getByRole('button', { name: 'Jump to sequence index1000' });
    expect(last.getAttribute('aria-current')).toBe('true');
    const card = last.closest('[data-index-card]')!;
    expect(card.getAttribute('aria-setsize')).toBe('1000');
    expect(card.getAttribute('aria-posinset')).toBe('1000');
    expect(container.querySelectorAll('[data-index-card]').length).toBeLessThan(40);
  });
  it('does not measure every index entry after an annotation filter changes', () => {
    function FilterSubject() {
      const state = useHubState();
      return <><button onClick={() => state.setFilters(previous => ({ ...previous, query: 'spike' }))}>Filter annotations</button>
        <HubIndex records={records} state={state} /></>;
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
    function MemoSubject() {
      const state = useHubState();
      return <><button onClick={() => state.setCurrentSectionKey('b')}>Track next</button>
        <HubIndex records={stableRecords} state={state} /></>;
    }
    render(<MemoSubject />);
    definition.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Track next' }));
    expect(screen.getByRole('button', { name: 'Jump to sequence b' }).getAttribute('aria-current')).toBe('true');
    expect(screen.getByText(/Unchanged isolate/)).toBeTruthy();
    expect(definition).not.toHaveBeenCalled();
  });
  it('indexes Features under organism headings with a sequence limit', () => {
    render(<Subject features />);
    expect(screen.getByLabelText('Limit to sequences')).toBeTruthy();
    expect(within(screen.getByRole('button', { name: 'Fold index group MERS-CoV' })).getByText('1')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'spike · in 2 of 2' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Jump to sequence/ })).toBeNull();
  });
  it('groups by host with missing values last and previews the loaded data', () => {
    render(<Subject />); fireEvent.click(screen.getByRole('button', { name: 'Grouped' }));
    fireEvent.click(screen.getByRole('button', { name: /by Organism/ }));
    const menu = screen.getByRole('menu');
    expect(within(menu).queryByText('Missing details can be filled in with Edit details.')).toBeNull();
    expect(screen.getByText('Missing details can be filled in with Edit details.')).toBeTruthy();
    expect(within(menu).getByText('Location · 1 groups · 1 not specified')).toBeTruthy();
    expect(within(menu).getByRole('menuitem', { name: /Collection year.*No data in these files/ }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Host ·/ }));
    expect(screen.getAllByRole('button', { name: /^Fold index group/ }).map(el => [el.children[1].textContent, el.lastElementChild?.textContent])).toEqual([['camel', '2'], ['Not specified', '1']]);
  });
});

it('folds windowed groups and toggles attention through the chip', () => {
  render(<Subject />);
  const chip = screen.getByRole('button', { name: 'Needs attention' });
  expect(chip.getAttribute('aria-pressed')).toBe('false');
  fireEvent.click(chip); expect(chip.getAttribute('aria-pressed')).toBe('true');
  expect(screen.getAllByRole('button', { name: /^Jump to sequence/ })).toHaveLength(1);
  fireEvent.click(chip); fireEvent.click(screen.getByRole('button', { name: 'Grouped' }));
  fireEvent.click(screen.getByRole('button', { name: 'Fold index group MERS-CoV' }));
  expect(screen.queryByRole('button', { name: 'Jump to sequence a' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Jump to sequence c' })).toBeTruthy();
});
it('shows the current mini-track window through the shared scroll controller', () => {
  function WindowSubject() { const state = useHubState(); useEffect(() => { state.trackWindow.update({ id: 'a', length: 4, start: 1, end: 3 }); state.setCurrentSectionKey('a'); }, []); return <HubIndex records={records} state={state} />; }
  render(<WindowSubject />);
  const card = screen.getByRole('button', { name: 'Jump to sequence a' }).closest('[data-index-card]')!;
  const band = card.querySelector<HTMLElement>('[data-track-window]')!;
  expect(band.hidden).toBe(false); expect(band.style.left).toBe('25%'); expect(band.style.width).toBe('50%');
});

it('reveals the entire group header when its first card becomes current', () => {
  const many = createHub1000x10();
  function GroupedSubject() {
    const state = useHubState();
    useEffect(() => state.setGrouped(true), []);
    return <><button onClick={() => state.setCurrentSectionKey('index0501')}>Track first in second group</button><HubIndex records={many} state={state} /></>;
  }
  render(<GroupedSubject />);
  const viewport = screen.getByLabelText('Index entries').firstElementChild as HTMLElement;
  Object.defineProperties(viewport, { clientHeight: { configurable: true, value: 600 }, scrollHeight: { configurable: true, value: 118072 } });
  fireEvent.scroll(viewport, { target: { scrollTop: 59054 } });
  fireEvent.click(screen.getByRole('button', { name: 'Track first in second group' }));
  expect(viewport.scrollTop).toBe(59036);
  expect(screen.getByRole('button', { name: 'Fold index group Fixture organism B' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Jump to sequence index0501' }).getAttribute('aria-current')).toBe('true');
});
it('shows only the number in group count pills', () => {
  render(<Subject />); fireEvent.click(screen.getByRole('button', { name: 'Grouped' }));
  const group = screen.getByRole('button', { name: 'Fold index group MERS-CoV' });
  expect(group.lastElementChild?.textContent).toBe('2');
});

it('jumps from card content while preserving its separate controls and feature jump', () => {
  function Cards() {
    const state = useHubState();
    return <><output aria-label="Jump">{state.jumpTarget?.key ?? 'none'}:{state.jumpTarget?.serial ?? 0}</output><HubIndex records={records} state={state} /></>;
  }
  render(<Cards />);
  const card = screen.getByRole('button', { name: 'Jump to sequence a' }).closest('[data-index-card]')!;
  fireEvent.click(card.querySelector('p')!);
  expect(screen.getByLabelText('Jump').textContent).toBe('a:1');
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select sequence a' }));
  fireEvent.click(screen.getByRole('button', { name: 'Hide a in hub' }));
  expect(screen.getByLabelText('Jump').textContent).toBe('a:1');
  expect(screen.getByRole('button', { name: 'Show a in hub' })).toBeTruthy();
  const strip = card.querySelector('svg')!;
  vi.spyOn(strip, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 1000, height: 30 } as DOMRect);
  fireEvent.click(strip, { clientX: 100, clientY: 14 });
  expect(screen.getByLabelText('Jump').textContent).toBe('a:0:2');
  fireEvent.click(strip, { clientX: 800, clientY: 14 });
  expect(screen.getByLabelText('Jump').textContent).toBe('a:3');
  fireEvent.click(screen.getByRole('button', { name: 'Jump to sequence a' }));
  expect(screen.getByLabelText('Jump').textContent).toBe('a:4');
});
it('reserves space for the index scrollbar beside the cards', () => {
  render(<Subject />);
  const viewport = screen.getByLabelText('Index entries').firstElementChild as HTMLElement;
  expect(viewport.classList.contains('custom-scrollbar-pro')).toBe(true);
  expect(viewport.style.scrollbarGutter).toBe('stable');
  expect(viewport.style.paddingRight).toBe('8px');
});

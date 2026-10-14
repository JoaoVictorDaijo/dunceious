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
  it('adds sequences from the index title unless an alignment job holds the lock', () => {
    const add = vi.fn();
    function AddSubject({ locked }: { locked: boolean }) { const state = useHubState(); return <HubIndex records={records} state={state} onAddSequences={add} addLocked={locked} />; }
    const { rerender } = render(<AddSubject locked={false} />);
    const button = within(screen.getByRole('heading', { name: 'Sequence index' }).parentElement!).getByRole('button', { name: 'Add sequences…' });
    fireEvent.click(button);
    expect(add).toHaveBeenCalledTimes(1);
    rerender(<AddSubject locked />);
    expect(screen.getByRole('button', { name: 'Add sequences…' })).toHaveProperty('disabled', true);
  });
  it('offers the sequence sort only where it orders sequences', () => {
    const { unmount } = render(<Subject />);
    const sort = screen.getByLabelText('Sort sequences') as HTMLSelectElement;
    expect([...sort.options].map(option => option.text)).toEqual(['Load order', 'Accession (A–Z)', 'Fewest annotations first']);
    expect(sort.closest('[data-tip]')?.getAttribute('data-tip')).toBe('Order of the sequences in the index and the list');
    unmount();
    render(<Subject features />);
    expect(screen.queryByLabelText('Sort sequences')).toBeNull();
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


it('shows each feature as one compact row without changing the jump', () => {
  const values = records.slice(0, 2).map(record => ({ ...record, features: [...record.features, { ...record.features[0], type: 'CDS' }] }));
  function Features() {
    const state = useHubState();
    useEffect(() => { state.setTab('features'); state.setCurrentSectionKey('["MERS-CoV","spike"]'); }, []);
    return <><output aria-label="Feature jump">{state.jumpTarget?.key}</output><HubIndex records={values} state={state} featureColors={{ gene: 'blue', CDS: 'purple' }} /></>;
  }
  render(<Features />);
  const button = screen.getByRole('button', { name: 'spike · in 2 of 2' });
  expect(button.style.height).toBe('30px');
  expect(button.getAttribute('data-tip')).toBe('spike');
  expect(within(button).getByText('2/2').className).toContain('font-mono');
  const identity = within(button).getByText('spike');
  expect(identity.className).toContain('truncate');
  expect(identity.className).toContain('text-amber-200');
  expect(button.className).toContain('border-env');
  const swatches = [...button.querySelectorAll<HTMLElement>('[data-type-swatch]')];
  expect(swatches.map(swatch => swatch.style.backgroundColor)).toEqual(['purple', 'blue']);
  expect(button.querySelector('[data-presence-state]')).toBeNull();
  expect(button.querySelector('[data-edit-mark]')).toBeNull();
  fireEvent.click(button);
  expect(screen.getByLabelText('Feature jump').textContent).toBe('["MERS-CoV","spike"]');
});

it('marks feature rows that hold annotations edited in Dunceious', () => {
  const values = [{ ...records[0], features: [{ ...records[0].features[0], hubEdit: 'edited' as const }, records[0].features[1]] }];
  function Features() { const state = useHubState(); useEffect(() => state.setTab('features'), []); return <HubIndex records={values} state={state} />; }
  render(<Features />);
  const mark = screen.getByRole('button', { name: 'spike · in 1 of 1' }).querySelector('[data-edit-mark]')!;
  expect(mark.getAttribute('data-tip')).toBe('1 edited');
});

it('spaces feature index rows at their fixed windowing height', () => {
  const values = [{ ...records[0], features: [...records[0].features, { ...records[0].features[0], name: 'other' }] }];
  function Features() { const state = useHubState(); useEffect(() => state.setTab('features'), []); return <HubIndex records={values} state={state} />; }
  render(<Features />);
  const first = screen.getByRole('button', { name: 'other · in 1 of 1' }).closest('[role="listitem"]')!.parentElement!;
  const second = screen.getByRole('button', { name: 'spike · in 1 of 1' }).closest('[role="listitem"]')!.parentElement!;
  expect(first.style.height).toBe('32px');
  expect(second.style.height).toBe('32px');
  expect(Number.parseFloat(second.style.top) - Number.parseFloat(first.style.top)).toBe(32);
});


it('reserves the title row when hidden controls appear and keeps the list siblings in place', () => {
  render(<Subject />);
  const heading = screen.getByRole('heading', { name: 'Sequence index' });
  const titleRow = heading.parentElement!;
  const index = screen.getByLabelText('Index entries');
  const preceding = index.previousElementSibling;
  const siblings = index.parentElement!.children.length;
  fireEvent.click(screen.getByRole('button', { name: 'Hide a in hub' }));
  const show = screen.getByRole('button', { name: 'Show all' });
  expect(titleRow.contains(show)).toBe(true);
  expect(titleRow.style.height).toBe('24px');
  expect(heading.className).toContain('whitespace-nowrap');
  expect(within(titleRow).getByText('2/3')).toBeTruthy();
  expect(index.previousElementSibling).toBe(preceding);
  expect(index.parentElement!.children.length).toBe(siblings);
  expect(show.getAttribute('data-tip')).toBe('Show all');
  fireEvent.click(show);
  expect(screen.queryByRole('button', { name: 'Show all' })).toBeNull();
  expect(titleRow.style.height).toBe('24px');
  expect(index.previousElementSibling).toBe(preceding);
});


it('separates nonzero edit counts from sequence status flags', () => {
  const values = [{ ...records[0], annotationsEdited: true, features: records[0].features.map(feature => feature.type === 'source' ? feature : { ...feature, hubEdit: 'edited' as const }) }];
  function Counts() { const state = useHubState(); return <HubIndex records={values} state={state} />; }
  const { container } = render(<Counts />);
  const card = container.querySelector('[data-index-card]')!;
  expect(card.textContent).toContain('1 edited · Edited');
  expect(card.textContent).not.toContain('0 added');
});

it('saves and clears through workspace actions and disables clear when empty or locked', () => {
  const save = vi.fn(), clear = vi.fn();
  function Actions({ empty = false, locked = false }: { empty?: boolean; locked?: boolean }) {
    const state = useHubState();
    return <HubIndex records={empty ? [] : records} state={state} empty={empty} locked={locked} onExportProjectJson={save} onClearAll={clear} onAddSequences={() => {}} />;
  }
  const { rerender } = render(<Actions />);
  const trigger = screen.getByRole('button', { name: 'Workspace actions' });
  expect(trigger.parentElement?.previousElementSibling).toBe(screen.getByRole('button', { name: 'Add sequences…' }));
  expect(trigger.getAttribute('data-tip')).toBe('Save or clear the workspace');
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole('menuitem', { name: 'Save project' }));
  expect(save).toHaveBeenCalledOnce();
  expect(screen.queryByRole('menu')).toBeNull();
  fireEvent.click(trigger);
  fireEvent.click(screen.getByRole('menuitem', { name: 'Clear workspace…' }));
  expect(clear).toHaveBeenCalledOnce();
  for (const props of [{ empty: true }, { locked: true }]) {
    rerender(<Actions {...props} />);
    fireEvent.click(trigger);
    expect(screen.getByRole('menuitem', { name: 'Clear workspace…' })).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Clear workspace…' }));
    expect(clear).toHaveBeenCalledOnce();
    expect(screen.getByRole('menuitem', { name: 'Save project' })).toHaveProperty('disabled', false);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
  }
});

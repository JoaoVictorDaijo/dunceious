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
import { render, screen, fireEvent, within, stubResizeObserver } from '@/src/app/testing/renderHarness';
import { useHubState } from '@/src/app/hooks/useHubState';
import HubIndex from '../HubIndex';
import HubList from '../HubList';
import { buildSequenceSections } from '@/src/app/logic/hubModel';
import { buildFeatureGroups } from '@/src/app/logic/featureComparison';
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
    // DOM bounds keep far-record reveals virtualized even after the current item changes.
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
    const button = screen.getByRole('button', { name: 'Add sequences…' });
    fireEvent.click(button);
    expect(add).toHaveBeenCalledTimes(1);
    rerender(<AddSubject locked />);
    expect(screen.getByRole('button', { name: 'Add sequences…' })).toHaveProperty('disabled', true);
  });
  it('offers the sequence sort only where it orders sequences', () => {
    const { unmount } = render(<Subject />);
    const sort = screen.getByLabelText('Sort sequences') as HTMLSelectElement;
    expect([...sort.options].map(option => option.text)).toEqual(['Load order', 'Accession (A–Z)', 'Fewest annotations first']);
    expect(sort.closest('[data-sequence-sort]')?.getAttribute('data-tip')).toBe('Order of the sequences in the index and the list');
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
    const groups = screen.getAllByRole('button', { name: /^Fold index group/ });
    expect(groups.map(group => group.getAttribute('aria-label'))).toEqual(['Fold index group camel', 'Fold index group Not specified']);
    expect(within(groups[0]).getByText('2')).toBeTruthy();
    expect(within(groups[1]).getByText('1')).toBeTruthy();
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
  const viewport = screen.getByLabelText('Index entries').querySelector<HTMLElement>('[data-index-viewport]')!;
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
  expect(within(group).getByText('2')).toBeTruthy();
});

it('jumps from card content while preserving its separate controls and feature jump', () => {
  function Cards() {
    const state = useHubState();
    return <><output aria-label="Jump">{state.jumpTarget?.key ?? 'none'}:{state.jumpTarget?.serial ?? 0}</output><HubIndex records={records} state={state} /></>;
  }
  render(<Cards />);
  const card = screen.getByRole('button', { name: 'Jump to sequence a' }).closest('[data-index-card]')!;
  fireEvent.click(within(card as HTMLElement).getByText('4 bp'));
  expect(screen.getByLabelText('Jump').textContent).toBe('a:1');
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select sequence a' }));
  fireEvent.click(screen.getByRole('button', { name: 'Hide a in hub' }));
  expect(screen.getByLabelText('Jump').textContent).toBe('a:1');
  expect(screen.getByRole('button', { name: 'Show a in hub' })).toBeTruthy();
  const strip = card.querySelector('[data-genome-strip]')!;
  vi.spyOn(strip, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 1000, height: 30 } as DOMRect);
  fireEvent.click(strip, { clientX: 100, clientY: 14 });
  expect(screen.getByLabelText('Jump').textContent).toBe('a:0:2');
  fireEvent.click(strip, { clientX: 800, clientY: 14 });
  expect(screen.getByLabelText('Jump').textContent).toBe('a:3');
  fireEvent.click(screen.getByRole('button', { name: 'Jump to sequence a' }));
  expect(screen.getByLabelText('Jump').textContent).toBe('a:4');
});
it('renders the index viewport and sequence cards', () => {
  render(<Subject />);
  const viewport = screen.getByLabelText('Index entries').querySelector<HTMLElement>('[data-index-viewport]')!;
  expect(viewport).toBeTruthy();
  expect(screen.getAllByRole('button', { name: /^Jump to sequence/ })).toHaveLength(3);
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
  // Fixed row heights keep virtualized feature positions aligned with the visible entries.
  expect(button.style.height).toBe('30px');
  expect(button.getAttribute('data-tip')).toBe('spike');
  expect(within(button).getByText('2/2')).toBeTruthy();
  const identity = within(button).getByText('spike');
  expect(button.getAttribute('aria-current')).toBe('true');
  expect(button.getAttribute('data-state')).toBe('current');
  // Amber identifies the current feature independently of its type colour.
  expect(identity.className).toContain('text-amber-200');
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
  const first = screen.getByRole('button', { name: 'other · in 1 of 1' }).closest<HTMLElement>('[data-index-row]')!;
  const second = screen.getByRole('button', { name: 'spike · in 1 of 1' }).closest<HTMLElement>('[data-index-row]')!;
  // Virtual rows must keep their fixed pitch so feature reveals land on the correct entry.
  expect(first.style.height).toBe('32px');
  expect(second.style.height).toBe('32px');
  expect(Number.parseFloat(second.style.top) - Number.parseFloat(first.style.top)).toBe(32);
});


it('shows hidden counts and restores sequences through the title controls', () => {
  render(<Subject />);
  expect(screen.getByRole('heading', { name: 'Sequence index' })).toBeTruthy();
  const index = screen.getByRole('region', { name: 'Hub index' });
  fireEvent.click(screen.getByRole('button', { name: 'Hide a in hub' }));
  const show = screen.getByRole('button', { name: 'Show all' });
  expect(within(index).getByRole('button', { name: 'Show all' })).toBe(show);
  expect(within(index).getByText('2/3')).toBeTruthy();
  expect(show.getAttribute('data-tip')).toBe('Show all');
  fireEvent.click(show);
  expect(screen.queryByRole('button', { name: 'Show all' })).toBeNull();
  expect(within(index).getByRole('heading', { name: 'Sequence index' })).toBeTruthy();
  expect(within(index).getAllByRole('button', { name: /^Jump to sequence/ })).toHaveLength(3);
});


it('separates nonzero edit counts from sequence status flags', () => {
  const values = [{ ...records[0], annotationsEdited: true, features: records[0].features.map(feature => feature.type === 'source' ? feature : { ...feature, hubEdit: 'edited' as const }) }];
  function Counts() { const state = useHubState(); return <HubIndex records={values} state={state} />; }
  const { container } = render(<Counts />);
  const card = container.querySelector('[data-index-card]')!;
  expect(card.textContent?.replace(/\s+/g, ' ').trim()).toContain('1 edited · Edited');
  expect(card.textContent).not.toContain('0 added');
});

it('keeps project actions out of the sequence index title', () => {
  function Subject() { const state = useHubState(); return <HubIndex records={records} state={state} onAddSequences={() => {}} />; }
  render(<Subject />);
  expect(screen.getByRole('button', { name: 'Add sequences…' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Workspace actions' })).toBeNull();
});


it.each(['sequences', 'features'] as const)('keeps the %s index offset through hide and show when the current section changes passively', tab => {
  stubResizeObserver();
  const values: SeqRecord[] = Array.from({ length: 60 }, (_, i) => {
    const id = `seq${String(i + 1).padStart(3, '0')}`;
    return { id, name: id, sequence: 'AAAA', features: [{ type: 'gene', name: id, start: 0, end: 2, strand: 1 }] };
  });
  function Workspace() {
    const state = useHubState();
    useEffect(() => state.setTab(tab), []);
    const visible = values.filter(record => !state.hubHidden.has(record.id));
    const items = tab === 'sequences' ? buildSequenceSections(visible, state.filters, { grouped: false }, 'load') : buildFeatureGroups(visible, state.filters, false);
    return <><output aria-label="Current section">{state.currentSectionKey}</output>
      <button onClick={() => state.toggleHubHidden('seq002')}>Toggle second sequence</button>
      <button onClick={() => state.setJumpTarget({ key: 'seq050:0', serial: 1 })}>Jump far</button>
      <HubIndex records={values} state={state} /><HubList records={values} state={state} kind={tab} items={items} height={180} /></>;
  }
  render(<Workspace />);
  const index = screen.getByLabelText('Index entries').querySelector<HTMLElement>('[data-index-viewport]')!;
  const main = screen.getByRole('region', { name: 'Annotations' });
  Object.defineProperties(index, { clientHeight: { configurable: true, value: 600 }, scrollHeight: { configurable: true, value: 7080 } });
  Object.defineProperties(main, { clientHeight: { configurable: true, value: 180 }, scrollHeight: { configurable: true, value: 20000 } });
  fireEvent.scroll(main, { target: { scrollTop: 4000 } });
  const current = screen.getByLabelText('Current section').textContent;
  fireEvent.scroll(index, { target: { scrollTop: 118 } });
  const toggle = (hidden: boolean) => fireEvent.click(screen.getByRole('button', { name: tab === 'sequences' ? `${hidden ? 'Show' : 'Hide'} seq002 in hub` : 'Toggle second sequence' }));
  toggle(false);
  expect(screen.getByLabelText('Current section').textContent).not.toBe(current);
  expect(index.scrollTop).toBe(118);
  toggle(true);
  expect(screen.getByLabelText('Current section').textContent).toBe(current);
  expect(index.scrollTop).toBe(118);
  fireEvent.scroll(main, { target: { scrollTop: 5000 } });
  expect(index.scrollTop).toBeGreaterThan(118);
  fireEvent.scroll(index, { target: { scrollTop: 118 } });
  fireEvent.click(screen.getByRole('button', { name: 'Jump far' }));
  expect(index.scrollTop).toBeGreaterThan(118);
});


it.each([false, true])('keeps the index offset when toggling an eye with initially hidden=%s and a stable current section', hidden => {
  const values = createHub1000x10();
  function Workspace() {
    const state = useHubState();
    useEffect(() => { state.setCurrentSectionKey('index1000'); if (hidden) state.setHubHidden(new Set(['index0002'])); }, []);
    return <HubIndex records={values} state={state} />;
  }
  render(<Workspace />);
  const viewport = screen.getByLabelText('Index entries').querySelector<HTMLElement>('[data-index-viewport]')!;
  Object.defineProperties(viewport, { clientHeight: { configurable: true, value: 600 }, scrollHeight: { configurable: true, value: 118000 } });
  fireEvent.scroll(viewport, { target: { scrollTop: 118 } });
  fireEvent.click(screen.getByRole('button', { name: `${hidden ? 'Show' : 'Hide'} index0002 in hub` }));
  expect(viewport.scrollTop).toBe(118);
});


it('preserves the index offset for filters and folds but reveals after grouping changes', () => {
  const values = createHub1000x10();
  function Workspace() {
    const state = useHubState();
    useEffect(() => { state.setGrouped(true); state.setCurrentSectionKey('index1000'); }, []);
    return <><button onClick={() => state.setFilters(previous => ({ ...previous, query: 'index-hit' }))}>Filter matches</button><HubIndex records={values} state={state} /></>;
  }
  render(<Workspace />);
  const viewport = screen.getByLabelText('Index entries').querySelector<HTMLElement>('[data-index-viewport]')!;
  Object.defineProperties(viewport, { clientHeight: { configurable: true, value: 600 }, scrollHeight: { configurable: true, value: 118072 } });
  fireEvent.scroll(viewport, { target: { scrollTop: 118 } });
  fireEvent.click(screen.getByRole('button', { name: 'Filter matches' }));
  expect(viewport.scrollTop).toBe(118);
  fireEvent.click(screen.getByRole('button', { name: 'Fold index group Fixture organism A' }));
  expect(viewport.scrollTop).toBe(118);
  fireEvent.click(screen.getByRole('button', { name: 'List' }));
  expect(viewport.scrollTop).toBeGreaterThan(118);
});


it('reveals the current feature after changing tabs restores the main list position', () => {
  stubResizeObserver();
  const values = createHub1000x10().slice(0, 60).map(record => ({ ...record, features: record.features.map((feature, i) => ({ ...feature, metadata: { ...feature.metadata, gene: `${record.id}-${i}` } })) }));
  function Workspace() {
    const state = useHubState();
    const items = state.tab === 'sequences' ? buildSequenceSections(values, state.filters, { grouped: false }, 'load') : buildFeatureGroups(values, state.filters, false);
    return <><button onClick={() => { state.setScrollOffset({ sequences: 0, features: 4000 }); state.setTab('features'); }}>By feature</button>
      <HubIndex records={values} state={state} /><HubList key={state.tab} records={values} state={state} kind={state.tab} items={items} height={180} /></>;
  }
  render(<Workspace />);
  const viewport = screen.getByLabelText('Index entries').querySelector<HTMLElement>('[data-index-viewport]')!;
  fireEvent.click(screen.getByRole('button', { name: 'By feature' }));
  expect(viewport.scrollTop).toBeGreaterThan(0);
  expect(within(screen.getByLabelText('Index entries')).getByRole('button', { current: true })).toBeTruthy();
});
